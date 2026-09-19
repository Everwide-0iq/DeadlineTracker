$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$output = Join-Path $root 'public/brand'
[void][System.IO.Directory]::CreateDirectory($output)
$source = [System.Drawing.Image]::FromFile((Join-Path $root 'design/brand/flame-spark.png'))

function Export-Icon([int]$size, [string]$name, [double]$scale = 1, [bool]$jpeg = $false) {
    $bitmap = New-Object System.Drawing.Bitmap($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#090c0e'))
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $edge = [int][Math]::Round($size * $scale)
        $offset = [int][Math]::Floor(($size - $edge) / 2)
        $graphics.DrawImage($source, $offset, $offset, $edge, $edge)
        $format = if ($jpeg) { [System.Drawing.Imaging.ImageFormat]::Jpeg } else { [System.Drawing.Imaging.ImageFormat]::Png }
        $bitmap.Save((Join-Path $output $name), $format)
    } finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

try {
    foreach ($size in @(16, 32, 48, 64, 128, 180, 192, 512)) {
        Export-Icon $size "fireboard-$size.png"
    }
    Export-Icon 512 'fireboard-maskable-512.png' 0.8
    Export-Icon 1024 'fireboard-telegram.jpg' 1 $true
} finally {
    $source.Dispose()
}

# PNG-backed ICO entries retain the same artwork in legacy favicon requests.
$stream = [System.IO.File]::Create((Join-Path $root 'public/favicon.ico'))
$writer = New-Object System.IO.BinaryWriter($stream)
try {
    $sizes = @(16, 32, 48)
    $writer.Write([UInt16]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]$sizes.Count)
    $offset = 6 + (16 * $sizes.Count)
    foreach ($size in $sizes) {
        $bytes = [System.IO.File]::ReadAllBytes((Join-Path $output "fireboard-$size.png"))
        $writer.Write([byte]$size)
        $writer.Write([byte]$size)
        $writer.Write([byte]0)
        $writer.Write([byte]0)
        $writer.Write([UInt16]1)
        $writer.Write([UInt16]32)
        $writer.Write([UInt32]$bytes.Length)
        $writer.Write([UInt32]$offset)
        $offset += $bytes.Length
    }
    foreach ($size in $sizes) {
        $writer.Write([System.IO.File]::ReadAllBytes((Join-Path $output "fireboard-$size.png")))
    }
} finally {
    $writer.Dispose()
    $stream.Dispose()
}
Write-Output 'Fireboard icons built successfully.'
