param(
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-z]{20}$')][string]$ProjectRef,
    [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9_]{5,32}$')][string]$BotUsername,
    [Parameter(Mandatory = $true)][string]$AppUrl
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$projectUrl = "https://$ProjectRef.supabase.co"
$endpoint = "$projectUrl/functions/v1/telegram-reminders"
$files = @()
$stage = 'validation'

function New-RandomSecret {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}

function Write-PrivateTemp([string]$path, [string]$content) {
    [System.IO.File]::WriteAllText($path, '')
    $acl = New-Object System.Security.AccessControl.FileSecurity
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl.SetOwner($identity)
    $acl.SetAccessRuleProtection($true, $false)
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'Allow')))
    Set-Acl -LiteralPath $path -AclObject $acl
    [System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding($false)))
}

function Invoke-SupabaseQuiet([string[]]$arguments) {
    # CLI error output may contain SQL. Never forward it for secret-bearing setup.
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = & npx.cmd --yes supabase@latest @arguments 2>&1
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($code -ne 0) { throw 'Supabase operation failed' }
}

try {
    $origin = [Uri]$AppUrl
    if ($origin.Scheme -ne 'https' -or $origin.AbsolutePath -ne '/' -or $origin.Query -or $origin.Fragment -or $origin.UserInfo) {
        throw 'App URL must be an HTTPS origin'
    }
    $token = (Get-Clipboard -Raw).Trim()
    if ($token -notmatch '^\d{5,15}:[A-Za-z0-9_-]{30,80}$') { throw 'Clipboard does not contain a bot token' }
    $telegram = "https://api.telegram.org/bot$token"
    $me = Invoke-RestMethod -Uri "$telegram/getMe" -Method Post -TimeoutSec 15
    if (-not $me.ok -or $me.result.username -ine $BotUsername) { throw 'Unexpected bot' }
    $previous = Invoke-RestMethod -Uri "$telegram/getWebhookInfo" -Method Post -TimeoutSec 15
    if (-not $previous.ok -or ($previous.result.url -and $previous.result.url -ne $endpoint)) {
        throw 'Bot already has an unrelated webhook'
    }

    $webhookSecret = New-RandomSecret
    $cronSecret = New-RandomSecret
    $envPath = Join-Path $root ('.telegram-edge-' + [Guid]::NewGuid().ToString('N') + '.local')
    $sqlPath = Join-Path $root ('.telegram-vault-' + [Guid]::NewGuid().ToString('N') + '.local')
    $files = @($envPath, $sqlPath)
    $stage = 'Edge secrets'
    Write-PrivateTemp $envPath "TELEGRAM_BOT_TOKEN=$token`nTELEGRAM_WEBHOOK_SECRET=$webhookSecret`nREMINDER_CRON_SECRET=$cronSecret`n"
    Invoke-SupabaseQuiet @('secrets', 'set', '--project-ref', $ProjectRef, '--env-file', $envPath)

    $stage = 'Vault configuration'
    $safeUrl = $AppUrl.TrimEnd('/').Replace("'", "''")
    $sql = @'
begin;
select public.telegram_configure('__BOT__', '__APP__');
do $setup$
declare secret_id uuid;
begin
  select id into secret_id from vault.secrets where name='fireboard_project_url';
  if secret_id is null then
    perform vault.create_secret('__PROJECT__', 'fireboard_project_url');
  else
    perform vault.update_secret(secret_id, '__PROJECT__');
  end if;
  select id into secret_id from vault.secrets where name='fireboard_reminder_cron_secret';
  if secret_id is null then
    perform vault.create_secret('__CRON__', 'fireboard_reminder_cron_secret');
  else
    perform vault.update_secret(secret_id, '__CRON__');
  end if;
end;
$setup$;
commit;
'@
    $sql = $sql.Replace('__BOT__', $BotUsername).Replace('__APP__', $safeUrl).Replace('__PROJECT__', $projectUrl).Replace('__CRON__', $cronSecret)
    Write-PrivateTemp $sqlPath $sql
    Invoke-SupabaseQuiet @('db', 'query', '--linked', '--project-ref', $ProjectRef, '--file', $sqlPath)

    $stage = 'Cron installation'
    Invoke-SupabaseQuiet @('db', 'query', '--linked', '--project-ref', $ProjectRef, '--file', (Join-Path $root 'supabase/setup/telegram_cron.sql'))
    $stage = 'Webhook registration'
    $payload = @{ url = $endpoint; secret_token = $webhookSecret; allowed_updates = @('message'); max_connections = 2 } | ConvertTo-Json -Compress
    $registered = Invoke-RestMethod -Uri "$telegram/setWebhook" -Method Post -ContentType 'application/json' -Body $payload -TimeoutSec 15
    if (-not $registered.ok) { throw 'Webhook registration failed' }
    $info = Invoke-RestMethod -Uri "$telegram/getWebhookInfo" -Method Post -TimeoutSec 15
    if (-not $info.ok -or $info.result.url -ne $endpoint) { throw 'Webhook verification failed' }

    $stage = 'Worker verification'
    $response = Invoke-WebRequest -Uri $endpoint -Method Post -UseBasicParsing -ContentType 'application/json' -Body '{}' -Headers @{ 'X-Fireboard-Cron-Secret' = $cronSecret } -TimeoutSec 150
    if ($response.StatusCode -ne 200 -or $response.Content -ne 'OK') { throw 'Worker verification failed' }
    Write-Output "Configured @${BotUsername}: Edge secrets, Vault, Cron and webhook. Worker returned OK."
} catch {
    Write-Output "Telegram setup failed at: $stage. Sensitive error details were suppressed."
    exit 1
} finally {
    foreach ($path in $files) {
        if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force }
    }
    Remove-Variable token,telegram,webhookSecret,cronSecret,payload,sql -ErrorAction SilentlyContinue
}
