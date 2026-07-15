import {
  Activity,
  Clock3,
  Eye,
  EyeOff,
  Gauge,
  Globe2,
  ImagePlus,
  KeyRound,
  Loader2,
  Palette,
  Save,
  ShieldCheck,
  Trash2,
  UploadCloud,
  UserRound,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn.ts'
import { useDialogFocus } from '../../lib/useDialogFocus.ts'
import { updatePassword } from '../auth/auth.api.ts'
import { useFeedbackStore } from '../feedback/feedback.store.ts'
import { LanguageToggle } from '../i18n/LanguageToggle.tsx'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { translations } from '../i18n/translations.ts'
import { usePreferencesStore } from '../preferences/preferences.store.ts'
import {
  prepareAvatar,
  removeAvatar,
  revokePreparedAvatar,
  uploadAvatar,
  type PreparedAvatar,
} from './avatar.api.ts'
import { ProfileAvatar } from './ProfileAvatar.tsx'
import { useProfileStore } from './profile.store.ts'
import { defaultActiveColor, getFallbackNickname } from './profile.types.ts'

type ProfileSettingsProps = {
  isOpen: boolean
  onClose: () => void
  userEmail: string | null
  userId: string
}

type PreviewStyle = CSSProperties & Record<`--${string}`, string>

const activeColors = [
  '#65e7ff',
  '#4ade80',
  '#a3e635',
  '#facc15',
  '#fb923c',
  '#ff5b57',
  '#f472b6',
  '#a78bfa',
]

const normalizeColor = (value: string) =>
  /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : defaultActiveColor

export function ProfileSettings({ isOpen, onClose, userEmail, userId }: ProfileSettingsProps) {
  const profile = useProfileStore((state) => state.profiles[userId] ?? null)
  const profileError = useProfileStore((state) => state.error)
  const updateProfile = useProfileStore((state) => state.updateProfile)
  const performanceMode = usePreferencesStore((state) => state.performanceMode)
  const setPerformanceMode = usePreferencesStore((state) => state.setPerformanceMode)
  const confirm = useFeedbackStore((state) => state.confirm)
  const pushToast = useFeedbackStore((state) => state.pushToast)
  const language = useI18nStore((state) => state.language)
  const t = translations[language]
  const [activeColor, setActiveColor] = useState(defaultActiveColor)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [confirmPassword, setConfirmPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isPreparingAvatar, setIsPreparingAvatar] = useState(false)
  const [isSavingPassword, setIsSavingPassword] = useState(false)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [pendingAvatar, setPendingAvatar] = useState<PreparedAvatar | null>(null)
  const [removeExistingAvatar, setRemoveExistingAvatar] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const fallbackNickname = getFallbackNickname(userEmail, t.profile.memberFallback)
  const dialogRef = useDialogFocus<HTMLElement>({
    active: isOpen,
    onEscape: () => void requestClose(),
  })

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setNickname(profile?.nickname ?? fallbackNickname)
    setActiveColor(profile?.activeColor ?? defaultActiveColor)
    setFormError(null)
    setAvatarError(null)
    setNewPassword('')
    setConfirmPassword('')
    setRemoveExistingAvatar(false)
    setPendingAvatar((current) => {
      revokePreparedAvatar(current)
      return null
    })
  }, [fallbackNickname, isOpen, profile])

  useEffect(
    () => () => {
      revokePreparedAvatar(pendingAvatar)
    },
    [pendingAvatar],
  )

  const normalizedNickname = nickname.trim()
  const hasProfileChanges =
    normalizedNickname !== (profile?.nickname ?? fallbackNickname) ||
    normalizeColor(activeColor) !== (profile?.activeColor ?? defaultActiveColor) ||
    Boolean(pendingAvatar) ||
    removeExistingAvatar
  const hasUnsavedChanges = hasProfileChanges || Boolean(newPassword || confirmPassword)
  const visibleAvatarPath = removeExistingAvatar ? null : profile?.avatarPath ?? null
  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || t.profile.localTime,
    [t.profile.localTime],
  )
  const previewStyle: PreviewStyle = { '--profile-color': normalizeColor(activeColor) }

  async function requestClose() {
    if (!hasUnsavedChanges) {
      onClose()
      return
    }

    const confirmed = await confirm({
      confirmLabel: t.profile.discard,
      description: t.profile.discardDescription,
      title: t.profile.discardTitle,
      tone: 'info',
    })

    if (confirmed) {
      onClose()
    }
  }

  const handleAvatarFile = async (file: File | null) => {
    if (!file) {
      return
    }

    setAvatarError(null)
    setIsPreparingAvatar(true)

    try {
      const avatar = await prepareAvatar(file)
      setPendingAvatar((current) => {
        revokePreparedAvatar(current)
        return avatar
      })
      setRemoveExistingAvatar(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      setAvatarError(
        message === 'source-too-large'
          ? t.profile.avatarTooLarge
          : message === 'unsupported'
            ? t.profile.avatarUnsupported
            : t.profile.avatarFailed,
      )
    } finally {
      setIsPreparingAvatar(false)
      if (avatarInputRef.current) {
        avatarInputRef.current.value = ''
      }
    }
  }

  const handleRemoveAvatar = () => {
    setPendingAvatar((current) => {
      revokePreparedAvatar(current)
      return null
    })
    setRemoveExistingAvatar(Boolean(profile?.avatarPath))
    setAvatarError(null)
  }

  const handleProfileSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)

    if (normalizedNickname.length < 1 || normalizedNickname.length > 32) {
      setFormError(t.profile.nicknameInvalid)
      return
    }

    setIsSavingProfile(true)
    let uploadedPath: string | null = null

    try {
      if (pendingAvatar) {
        uploadedPath = await uploadAvatar(userId, pendingAvatar)
      }

      const nextAvatarPath = uploadedPath ?? (removeExistingAvatar ? null : profile?.avatarPath ?? null)
      await updateProfile(userId, {
        activeColor: normalizeColor(activeColor),
        avatarPath: nextAvatarPath,
        nickname: normalizedNickname,
      })

      if (profile?.avatarPath && profile.avatarPath !== nextAvatarPath) {
        void removeAvatar(profile.avatarPath).catch(() => undefined)
      }

      setPendingAvatar((current) => {
        revokePreparedAvatar(current)
        return null
      })
      setRemoveExistingAvatar(false)
      pushToast({ title: t.profile.saved, description: t.profile.savedDescription, tone: 'success' })
    } catch {
      if (uploadedPath) {
        void removeAvatar(uploadedPath).catch(() => undefined)
      }
      setFormError(t.profile.saveFailed)
    } finally {
      setIsSavingProfile(false)
    }
  }

  const handlePasswordSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)

    if (newPassword.length < 8) {
      setFormError(t.profile.passwordTooShort)
      return
    }

    if (newPassword !== confirmPassword) {
      setFormError(t.profile.passwordMismatch)
      return
    }

    setIsSavingPassword(true)

    try {
      await updatePassword(newPassword)
      setNewPassword('')
      setConfirmPassword('')
      pushToast({ title: t.profile.passwordSaved, description: t.profile.passwordSavedDescription, tone: 'success' })
    } catch {
      setFormError(t.profile.passwordFailed)
    } finally {
      setIsSavingPassword(false)
    }
  }

  if (!isOpen) {
    return null
  }

  return createPortal(
    <div className="profile-settings-backdrop">
      <section
        aria-labelledby="profile-settings-title"
        aria-modal="true"
        className="profile-settings-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header className="profile-settings-header">
          <div>
            <p><UserRound size={15} /> {t.profile.kicker}</p>
            <h2 id="profile-settings-title">{t.profile.title}</h2>
            <span>{userEmail}</span>
          </div>
          <button aria-label={t.common.close} className="icon-button" type="button" onClick={() => void requestClose()}>
            <X size={19} />
          </button>
        </header>

        <div className="profile-settings-content">
          <form className="profile-settings-main" onSubmit={handleProfileSubmit}>
            <section className="profile-settings-section profile-identity-section">
              <div className="profile-avatar-editor">
                {pendingAvatar ? (
                  <span className="profile-avatar profile-avatar-preview" style={{ '--profile-color': activeColor } as PreviewStyle}>
                    <img alt={t.profile.avatarPreview} draggable={false} src={pendingAvatar.objectUrl} />
                  </span>
                ) : (
                  <ProfileAvatar
                    avatarPath={visibleAvatarPath}
                    color={activeColor}
                    name={normalizedNickname || fallbackNickname}
                    size={92}
                  />
                )}
                <div className="profile-avatar-actions">
                  <input
                    accept="image/*"
                    className="hidden"
                    ref={avatarInputRef}
                    type="file"
                    onChange={(event) => void handleAvatarFile(event.target.files?.item(0) ?? null)}
                  />
                  <button
                    className="secondary-button"
                    disabled={isPreparingAvatar || isSavingProfile}
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    {isPreparingAvatar ? <Loader2 className="animate-spin" size={17} /> : <UploadCloud size={17} />}
                    {t.profile.uploadAvatar}
                  </button>
                  {(pendingAvatar || visibleAvatarPath) ? (
                    <button
                      aria-label={t.profile.removeAvatar}
                      className="icon-button text-red-100"
                      disabled={isSavingProfile}
                      type="button"
                      onClick={handleRemoveAvatar}
                    >
                      <Trash2 size={16} />
                    </button>
                  ) : null}
                </div>
                <p><ImagePlus size={13} /> {t.profile.avatarHint}</p>
                {avatarError ? <strong className="profile-field-error">{avatarError}</strong> : null}
              </div>

              <label className="form-field min-w-0 flex-1">
                <span>{t.profile.nickname}</span>
                <input
                  autoFocus
                  maxLength={32}
                  placeholder={t.profile.nicknamePlaceholder}
                  type="text"
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                />
                <small>{t.profile.nicknameHint}</small>
              </label>
            </section>

            <section className="profile-settings-section">
              <div className="profile-section-heading">
                <Palette size={17} />
                <div>
                  <h3>{t.profile.activeColor}</h3>
                  <p>{t.profile.activeColorDescription}</p>
                </div>
              </div>
              <div className="profile-color-layout">
                <div className="profile-color-grid">
                  {activeColors.map((color) => (
                    <button
                      aria-label={t.profile.chooseColor(color)}
                      aria-pressed={normalizeColor(activeColor) === color}
                      className={cn('profile-color-swatch', normalizeColor(activeColor) === color && 'profile-color-swatch-active')}
                      key={color}
                      style={{ '--profile-color': color } as PreviewStyle}
                      type="button"
                      onClick={() => setActiveColor(color)}
                    >
                      <span />
                    </button>
                  ))}
                  <label className="profile-custom-color" title={t.profile.customColor}>
                    <input
                      aria-label={t.profile.customColor}
                      type="color"
                      value={normalizeColor(activeColor)}
                      onChange={(event) => setActiveColor(event.target.value)}
                    />
                    <Palette size={17} />
                  </label>
                </div>

                <div className="profile-active-preview" style={previewStyle}>
                  <span className="profile-active-preview-beam" />
                  <div className="profile-active-preview-label">
                    <Activity size={13} />
                    {normalizedNickname || fallbackNickname}
                  </div>
                  <strong>{t.profile.previewCard}</strong>
                  <p>{t.profile.previewDescription}</p>
                </div>
              </div>
            </section>

            <button
              className="primary-button justify-center sm:self-end"
              disabled={!hasProfileChanges || isSavingProfile || isPreparingAvatar}
              type="submit"
            >
              {isSavingProfile ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />}
              {t.profile.saveProfile}
            </button>
          </form>

          <aside className="profile-settings-side">
            <section className="profile-settings-section">
              <div className="profile-section-heading">
                <Gauge size={17} />
                <div>
                  <h3>{t.profile.interface}</h3>
                  <p>{t.profile.interfaceDescription}</p>
                </div>
              </div>
              <div className="profile-setting-row">
                <span><Globe2 size={16} /> {t.profile.language}</span>
                <LanguageToggle className="h-10" />
              </div>
              <button
                aria-pressed={performanceMode}
                className="profile-setting-row profile-setting-button"
                type="button"
                onClick={() => setPerformanceMode(!performanceMode)}
              >
                <span><Activity size={16} /> {t.board.performanceMode}</span>
                <i className="profile-switch" data-active={performanceMode ? 'true' : 'false'}><b /></i>
              </button>
              <div className="profile-time-zone">
                <Clock3 size={15} />
                <span>{t.profile.timeZone}</span>
                <strong>{timeZone}</strong>
              </div>
            </section>

            <form className="profile-settings-section" onSubmit={handlePasswordSubmit}>
              <div className="profile-section-heading">
                <ShieldCheck size={17} />
                <div>
                  <h3>{t.profile.security}</h3>
                  <p>{t.profile.securityDescription}</p>
                </div>
              </div>
              <label className="form-field">
                <span>{t.profile.newPassword}</span>
                <div className="profile-password-field">
                  <input
                    autoComplete="new-password"
                    minLength={8}
                    placeholder={t.profile.passwordPlaceholder}
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                  <button
                    aria-label={showPassword ? t.profile.hidePassword : t.profile.showPassword}
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </label>
              <label className="form-field">
                <span>{t.profile.confirmPassword}</span>
                <input
                  autoComplete="new-password"
                  minLength={8}
                  placeholder={t.profile.confirmPasswordPlaceholder}
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </label>
              <div className="profile-password-meter" data-strength={Math.min(Math.floor(newPassword.length / 4), 3)}>
                <i /><i /><i />
              </div>
              <button
                className="secondary-button justify-center"
                disabled={!newPassword || !confirmPassword || isSavingPassword}
                type="submit"
              >
                {isSavingPassword ? <Loader2 className="animate-spin" size={17} /> : <KeyRound size={17} />}
                {t.profile.changePassword}
              </button>
            </form>

            {formError || profileError ? (
              <div className="profile-settings-error">{formError ?? profileError}</div>
            ) : null}
          </aside>
        </div>
      </section>
    </div>,
    document.body,
  )
}
