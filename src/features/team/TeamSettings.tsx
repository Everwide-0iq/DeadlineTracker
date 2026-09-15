import { Check, Copy, Link2, Settings2, ShieldCheck, Trash2, UserPlus, UsersRound, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useDialogFocus } from '../../lib/useDialogFocus.ts'
import { cn } from '../../lib/cn.ts'
import { useFeedbackStore } from '../feedback/feedback.store.ts'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { translations } from '../i18n/translations.ts'
import type { Project } from '../projects/project.types.ts'
import { getProjectDisplayName } from '../projects/project.utils.ts'
import { ProfileAvatar } from '../profile/ProfileAvatar.tsx'
import type { UserProfile } from '../profile/profile.types.ts'
import {
  createTeamInvite,
  fetchProjectMembers,
  fetchTeamInvites,
  fetchTeamMembers,
  removeTeamMember,
  revokeTeamInvite,
  updateTeamMemberAccess,
  subscribeToTeamMembers,
} from './team.api.ts'
import {
  assignableTeamRoles,
  isTeamAdmin,
  type AssignableTeamRole,
  type ProjectMember,
  type Team,
  type TeamInvite,
  type TeamMember,
  type TeamRole,
} from './team.types.ts'

type TeamSettingsProps = {
  currentRole: TeamRole | null
  isOpen: boolean
  onClose: () => void
  onMembershipChanged: () => void
  profiles: Record<string, UserProfile>
  projects: Project[]
  team: Team
  userId: string
}

function roleLabel(role: TeamRole, t: (typeof translations)['ru']) {
  return t.team[role]
}

function buildInviteUrl(rawToken: string) {
  return `${window.location.origin}/?invite=${encodeURIComponent(rawToken)}`
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.append(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('Could not copy the invitation link.')
}

function getTeamErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message) {
      return message
    }
  }

  return fallback
}

export function TeamSettings({
  currentRole,
  isOpen,
  onClose,
  onMembershipChanged,
  profiles,
  projects,
  team,
  userId,
}: TeamSettingsProps) {
  const language = useI18nStore((state) => state.language)
  const t = translations[language]
  const confirm = useFeedbackStore((state) => state.confirm)
  const pushToast = useFeedbackStore((state) => state.pushToast)
  const [email, setEmail] = useState('')
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [invites, setInvites] = useState<TeamInvite[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [memberProjectIds, setMemberProjectIds] = useState<string[]>([])
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([])
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([])
  const [role, setRole] = useState<AssignableTeamRole>('member')
  const reloadVersion = useRef(0)

  const canManage = isTeamAdmin(currentRole)
  const centerProjectId = projects.find((project) => project.id === '00000000-0000-0000-0000-000000000001')?.id ?? null
  const assignableRoles = useMemo(
    () => (currentRole === 'owner' ? assignableTeamRoles : assignableTeamRoles.filter((candidate) => candidate !== 'admin')),
    [currentRole],
  )
  const dialogRef = useDialogFocus<HTMLElement>({ active: isOpen, onEscape: onClose })

  const reload = useCallback(async () => {
    const version = ++reloadVersion.current
    setIsLoading(true)
    setError(null)
    try {
      const [nextMembers, nextProjectMembers, nextInvites] = await Promise.all([
        fetchTeamMembers(team.id),
        fetchProjectMembers(projects.map((project) => project.id)),
        fetchTeamInvites(team.id),
      ])
      if (version !== reloadVersion.current) return
      setMembers(nextMembers)
      setProjectMembers(nextProjectMembers)
      setInvites(nextInvites)
    } catch (caughtError) {
      if (version !== reloadVersion.current) return
      setError(getTeamErrorMessage(caughtError, t.team.inviteFailed))
    } finally {
      if (version === reloadVersion.current) setIsLoading(false)
    }
  }, [projects, t.team.inviteFailed, team.id])

  useEffect(() => {
    if (!isOpen || !canManage) return
    const requestVersion = reloadVersion
    void reload()
    const unsubscribe = subscribeToTeamMembers(team.id, () => void reload())
    return () => { requestVersion.current++; unsubscribe() }
  }, [canManage, isOpen, reload, team.id])

  useEffect(() => {
    if (!centerProjectId) return
    setSelectedProjectIds((current) => (current.includes(centerProjectId) ? current : [centerProjectId, ...current]))
  }, [centerProjectId])

  if (!isOpen || !canManage) return null

  const getProjectIdsForMember = (memberId: string) =>
    projectMembers.filter((membership) => membership.userId === memberId).map((membership) => membership.projectId)

  const hasFullProjectAccess = (member: Pick<TeamMember, 'role'>) => isTeamAdmin(member.role)

  const toggleProject = (projectId: string) => {
    if (projectId === centerProjectId) return
    setSelectedProjectIds((current) =>
      current.includes(projectId) ? current.filter((id) => id !== projectId) : [...current, projectId],
    )
  }

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setInviteLink(null)
    setIsSaving(true)

    try {
      const invite = await createTeamInvite({
        email: email.trim(),
        projectIds: selectedProjectIds,
        role,
        teamId: team.id,
      })
      const link = buildInviteUrl(invite.invite_token)
      setInviteLink(link)
      setEmail('')
      await reload()
      pushToast({ description: t.team.inviteDescription, title: t.team.inviteCreated, tone: 'success' })
    } catch (caughtError) {
      setError(getTeamErrorMessage(caughtError, t.team.inviteFailed))
    } finally {
      setIsSaving(false)
    }
  }

  const handleUpdateMember = async (member: TeamMember, nextRole: AssignableTeamRole) => {
    setError(null)
    setIsSaving(true)
    try {
      await updateTeamMemberAccess({
        projectIds: getProjectIdsForMember(member.userId),
        role: nextRole,
        teamId: team.id,
        userId: member.userId,
      })
      await reload()
      onMembershipChanged()
      pushToast({ title: t.team.saved, tone: 'success' })
    } catch (caughtError) {
      setError(getTeamErrorMessage(caughtError, t.team.inviteFailed))
    } finally {
      setIsSaving(false)
    }
  }

  const openMemberAccess = (member: TeamMember) => {
    const current = getProjectIdsForMember(member.userId)
    setMemberProjectIds(centerProjectId && !current.includes(centerProjectId) ? [centerProjectId, ...current] : current)
    setEditingMemberId(member.userId)
  }

  const toggleMemberProject = (projectId: string) => {
    if (projectId === centerProjectId) return
    setMemberProjectIds((current) =>
      current.includes(projectId) ? current.filter((id) => id !== projectId) : [...current, projectId],
    )
  }

  const handleSaveMemberProjects = async (member: TeamMember) => {
    setError(null)
    setIsSaving(true)
    try {
      await updateTeamMemberAccess({
        projectIds: memberProjectIds,
        role: member.role as AssignableTeamRole,
        teamId: team.id,
        userId: member.userId,
      })
      setEditingMemberId(null)
      await reload()
      onMembershipChanged()
      pushToast({ title: t.team.saved, tone: 'success' })
    } catch (caughtError) {
      setError(getTeamErrorMessage(caughtError, t.team.inviteFailed))
    } finally {
      setIsSaving(false)
    }
  }

  const handleRemoveMember = async (member: TeamMember) => {
    const profile = profiles[member.userId]
    const memberName = profile?.nickname ?? t.team.member
    const confirmed = await confirm({
      confirmLabel: t.team.remove,
      description: t.team.removeDescription(memberName),
      title: t.team.removeTitle,
      tone: 'danger',
    })
    if (!confirmed) return

    setError(null)
    setIsSaving(true)
    try {
      await removeTeamMember(team.id, member.userId)
      await reload()
      onMembershipChanged()
    } catch (caughtError) {
      setError(getTeamErrorMessage(caughtError, t.team.inviteFailed))
    } finally {
      setIsSaving(false)
    }
  }

  const handleRevokeInvite = async (inviteId: string) => {
    setError(null)
    setIsSaving(true)
    try {
      await revokeTeamInvite(inviteId)
      await reload()
    } catch (caughtError) {
      setError(getTeamErrorMessage(caughtError, t.team.inviteFailed))
    } finally {
      setIsSaving(false)
    }
  }

  const handleCopyInvite = async () => {
    if (!inviteLink) return
    try {
      await copyText(inviteLink)
      pushToast({ description: t.team.inviteLinkCopied, title: t.team.inviteCreated, tone: 'success' })
    } catch (caughtError) {
      setError(getTeamErrorMessage(caughtError, t.team.inviteFailed))
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/70 p-0 backdrop-blur-md lg:place-items-center lg:p-6">
      <section
        aria-labelledby="team-settings-title"
        aria-modal="true"
        className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-[28px] border border-white/10 bg-[#090b10]/[0.98] shadow-[0_0_80px_rgb(99_217_95_/_0.12)] lg:rounded-[28px]"
        ref={dialogRef}
        role="dialog"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-5 py-5 lg:px-7">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-300">
              <ShieldCheck size={16} />
              {team.name}
            </div>
            <h2 className="text-2xl font-black text-white" id="team-settings-title">{t.team.manage}</h2>
            <p className="mt-1 text-sm text-white/45">{t.team.manageDescription}</p>
          </div>
          <button aria-label={t.project.closeEditor} className="icon-button" type="button" onClick={onClose}>
            <X size={19} />
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto px-5 py-5 lg:px-7 lg:py-6">
          <div className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
            <form className="space-y-5" onSubmit={handleInvite}>
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-black text-white"><UserPlus size={17} />{t.team.invite}</div>
                <p className="text-sm leading-6 text-white/45">{t.team.inviteDescription}</p>
              </div>

              <label className="form-field">
                <span>{t.team.email}</span>
                <input autoComplete="email" inputMode="email" placeholder="name@example.com" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              </label>

              <label className="form-field">
                <span>{t.team.role}</span>
                <select value={role} onChange={(event) => setRole(event.target.value as AssignableTeamRole)}>
                  {assignableRoles.map((candidate) => <option key={candidate} value={candidate}>{roleLabel(candidate, t)}</option>)}
                </select>
                <small>{t.team.roleHint}</small>
              </label>

              <fieldset className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                <legend className="px-1 text-xs font-black uppercase tracking-[0.16em] text-white/55">{t.team.access}</legend>
                <p className="mb-3 text-xs leading-5 text-white/40">{t.team.accessHint}</p>
                {role === 'admin' ? (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-300/15 bg-emerald-400/[0.06] px-3 py-2.5 text-sm font-semibold text-emerald-100/85">
                    <ShieldCheck className="shrink-0" size={16} />
                    {t.team.adminAllProjects}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {projects.map((project) => {
                    const isCenter = project.id === centerProjectId
                    const checked = isCenter || selectedProjectIds.includes(project.id)
                    const projectName = getProjectDisplayName(project, t) ?? project.name
                    return (
                      <label className={cn('flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-sm transition hover:bg-white/[0.04]', isCenter && 'cursor-default opacity-80')} key={project.id}>
                        <input checked={checked} disabled={isCenter} type="checkbox" onChange={() => toggleProject(project.id)} />
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: project.color, boxShadow: `0 0 12px ${project.color}` }} />
                        <span className="min-w-0 flex-1 truncate font-semibold text-white/82">{projectName}</span>
                        {isCenter ? <span className="text-[10px] font-black uppercase tracking-[0.12em] text-white/35">{t.team.center}</span> : null}
                      </label>
                    )
                    })}
                  </div>
                )}
              </fieldset>

              {inviteLink ? (
                <div className="rounded-2xl border border-emerald-300/25 bg-emerald-400/[0.07] p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-bold text-emerald-100"><Link2 size={16} />{t.team.inviteCreated}</div>
                  <button className="secondary-button w-full justify-center text-xs" type="button" onClick={() => void handleCopyInvite()}><Copy size={15} />{t.team.copyLink}</button>
                </div>
              ) : null}

              <button className="primary-button w-full justify-center" disabled={isSaving} type="submit"><UserPlus size={17} />{t.team.invite}</button>
            </form>

            <div className="min-w-0 space-y-6">
              <section>
                <div className="mb-3 flex items-center gap-2 text-sm font-black text-white"><UsersRound size={17} />{t.team.members}</div>
                <div className="space-y-2">
                  {!isLoading && members.length === 0 ? <p className="text-sm text-white/40">{t.team.noMembers}</p> : null}
                  {members.map((member) => {
                    const profile = profiles[member.userId]
                    const name = profile?.nickname ?? t.team.member
                    const isOwner = member.role === 'owner'
                    const hasFullAccess = hasFullProjectAccess(member)
                    const canManageMember = !isOwner && member.userId !== userId && (currentRole === 'owner' || member.role !== 'admin')
                    const currentAccess = hasFullAccess ? projects.map((project) => project.id) : getProjectIdsForMember(member.userId)
                    return (
                      <article className="rounded-2xl border border-white/10 bg-white/[0.025] p-3" key={member.userId}>
                        <div className="flex items-center gap-3">
                          <ProfileAvatar avatarPath={profile?.avatarPath} color={profile?.activeColor ?? '#65e7ff'} name={name} size={38} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-bold text-white">{name}</div>
                            <div className="mt-0.5 text-xs text-white/42">{roleLabel(member.role, t)} · {currentAccess.length} {t.team.projects.toLowerCase()}</div>
                          </div>
                          {canManageMember ? (
                            <select className="max-w-32" disabled={isSaving} value={member.role} onChange={(event) => void handleUpdateMember(member, event.target.value as AssignableTeamRole)}>
                              {assignableRoles.map((candidate) => <option key={candidate} value={candidate}>{roleLabel(candidate, t)}</option>)}
                            </select>
                          ) : <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs font-bold text-white/60">{roleLabel(member.role, t)}</span>}
                          {canManageMember && !hasFullAccess ? <button aria-label={t.team.access} className="icon-button h-9 w-9" disabled={isSaving} type="button" onClick={() => openMemberAccess(member)}><Settings2 size={16} /></button> : null}
                          {canManageMember ? <button aria-label={t.team.remove} className="icon-button h-9 w-9 text-red-200/70 hover:text-red-100" disabled={isSaving} type="button" onClick={() => void handleRemoveMember(member)}><Trash2 size={16} /></button> : null}
                        </div>
                        {editingMemberId === member.userId ? (
                          <div className="mt-3 border-t border-white/[0.08] pt-3">
                            <div className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-white/50">{t.team.access}</div>
                            <div className="grid gap-1 sm:grid-cols-2">
                              {projects.map((project) => {
                                const isCenter = project.id === centerProjectId
                                const checked = isCenter || memberProjectIds.includes(project.id)
                                return (
                                  <label className={cn('flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-white/70 hover:bg-white/[0.04]', isCenter && 'opacity-70')} key={project.id}>
                                    <input checked={checked} disabled={isCenter || isSaving} type="checkbox" onChange={() => toggleMemberProject(project.id)} />
                                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
                                    <span className="truncate">{getProjectDisplayName(project, t) ?? project.name}</span>
                                  </label>
                                )
                              })}
                            </div>
                            <div className="mt-3 flex justify-end gap-2">
                              <button className="secondary-button px-3 py-2 text-xs" disabled={isSaving} type="button" onClick={() => setEditingMemberId(null)}>{t.common.cancel}</button>
                              <button className="primary-button px-3 py-2 text-xs" disabled={isSaving} type="button" onClick={() => void handleSaveMemberProjects(member)}><Check size={14} />{t.team.saveAccess}</button>
                            </div>
                          </div>
                        ) : null}
                      </article>
                    )
                  })}
                </div>
              </section>

              <section>
                <div className="mb-3 flex items-center gap-2 text-sm font-black text-white"><Link2 size={17} />{t.team.invites}</div>
                <div className="space-y-2">
                  {!isLoading && invites.filter((invite) => !invite.revokedAt && !invite.acceptedAt).length === 0 ? <p className="text-sm text-white/40">{t.team.noInvites}</p> : null}
                  {invites.filter((invite) => !invite.revokedAt && !invite.acceptedAt).map((invite) => (
                    <article className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-3" key={invite.id}>
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-amber-200"><Link2 size={16} /></span>
                      <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold text-white">{invite.email}</div><div className="mt-0.5 text-xs text-white/42">{roleLabel(invite.role, t)} · {t.team.pending}</div></div>
                      <button aria-label={t.team.remove} className="icon-button h-9 w-9 text-red-200/70 hover:text-red-100" disabled={isSaving} type="button" onClick={() => void handleRevokeInvite(invite.id)}><Trash2 size={16} /></button>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </div>

          {error ? <div className="mt-5 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div> : null}
        </div>
      </section>
    </div>
  )
}
