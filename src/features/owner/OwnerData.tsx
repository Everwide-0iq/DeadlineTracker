import { ArrowLeft, ChevronLeft, ChevronRight, Download, ExternalLink, FileText, Folder, ListChecks, RefreshCw, Search, Trash2, Users } from 'lucide-react'
import { memo, useEffect, useRef, useState, type FormEvent } from 'react'
import { useFeedbackStore } from '../feedback/feedback.store.ts'
import { ProfileAvatar } from '../profile/ProfileAvatar.tsx'
import { asRow, field, isLockedError, ownerAction, readOwner, type OwnerRow, type OwnerView, type OwnerBoardTarget } from './owner.api.ts'
import type { OwnerCopy } from './owner.copy.ts'
import { OwnerImage } from './OwnerImage.tsx'
import { OwnerBoardInspector } from './OwnerBoardInspector.tsx'
import { OwnerAccess } from './OwnerAccess.tsx'

type Target = OwnerBoardTarget
const views = ['overview', 'audit', 'members', 'projects', 'invites'] as const
const kinds = ['cards', 'todos', 'texts', 'links'] as const
const entities = ['cards', 'todo_blocks', 'todo_items', 'board_texts', 'card_links', 'projects', 'profiles', 'team_members', 'project_members', 'team_invites', 'security', 'owner_console']
const date = (value: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : ''
const bytes = (value: string) => `${(Number(value) / 1024 / 1024).toLocaleString(undefined, { maximumFractionDigits: 2 })} MB`

function OwnerDataView({ t, onLocked, canManageAccess }: { t: OwnerCopy; onLocked: () => void; canManageAccess: boolean }) {
  const [view, setView] = useState<OwnerView | 'access'>('overview')
  const [boardMode, setBoardMode] = useState<'canvas' | 'list'>('canvas')
  const [filters, setFilters] = useState<OwnerRow>({})
  const [target, setTarget] = useState<Target | null>(null)
  const [kind, setKind] = useState<string>('cards')
  const [blockId, setBlockId] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const [data, setData] = useState<OwnerRow | OwnerRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const confirm = useFeedbackStore(s => s.confirm)
  const mounted = useRef(true)
  const locked = useRef(onLocked)
  locked.current = onLocked
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    if (view === 'access' || (view === 'board' && boardMode === 'canvas')) { setLoading(false); setData(null); setError(false); return }
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 20_000)
    let current = true
    setLoading(true); setError(false); setData(null)
    const args: OwnerRow = { ...filters, page, cursor: cursors[page] ?? null }
    if (view === 'board' && target) Object.assign(args, { userId: target.userId, projectId: target.projectId, kind, blockId })
    void readOwner(view, args, controller.signal).then(result => {
      if (current) setData(result)
    }).catch(reason => {
      if (!current) return
      if (isLockedError(reason)) locked.current()
      else setError(true)
    }).finally(() => { window.clearTimeout(timeout); if (current) setLoading(false) })
    return () => { current = false; window.clearTimeout(timeout); controller.abort() }
  }, [view, boardMode, filters, target, kind, blockId, page, cursors, refresh])
  const rows = Array.isArray(data) ? data.slice(0, 50) : []
  const resetPage = () => { setPage(0); setCursors([null]) }
  const navigate = (next: OwnerView | 'access') => { setView(next); setTarget(null); setFilters({}); setBlockId(null); resetPage() }
  const openBoard = (next: Target) => { setTarget(next); setView('board'); setBoardMode('canvas'); setKind('cards'); setBlockId(null); setFilters({}); resetPage() }
  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const next: OwnerRow = {}
    for (const [key, value] of form) if (typeof value === 'string' && value.trim()) next[key] = value.trim()
    setFilters(next); resetPage()
  }
  const act = async (action: 'revoke_invite' | 'purge_old_audit' | 'export_page', id?: string) => {
    if (busy) return
    if (action !== 'export_page' && !await confirm({ title: action === 'revoke_invite' ? t.revoke : t.purge, description: action === 'revoke_invite' ? t.revokeConfirm : t.purgeConfirm, confirmLabel: action === 'revoke_invite' ? t.revoke : t.purge, tone: 'danger' })) return
    if (!mounted.current) return
    setBusy(true); setError(false)
    try {
      await ownerAction(action, id)
      if (!mounted.current) return
      if (action === 'export_page') {
        const payload = { exported_at: new Date().toISOString(), section: view, board: target, kind: view === 'board' ? kind : undefined, filters, page: page + 1, records: Array.isArray(data) ? rows : data }
        const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
        const link = document.createElement('a')
        link.href = url; link.download = `fireboard-owner-${view}-${new Date().toISOString().slice(0, 10)}.json`
        link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      } else setRefresh(n => n + 1)
    } catch (reason) { if (mounted.current) { if (isLockedError(reason)) locked.current(); else setError(true) } }
    finally { if (mounted.current) setBusy(false) }
  }
  const actionName = (value: string) => t.actions[value as keyof typeof t.actions] ?? value
  return <>
    <nav className="owner-tabs" aria-label={t.title}>
      {views.map(item => <button key={item} type="button" aria-current={view === item ? 'page' : undefined} onClick={() => navigate(item)}>{t[item]}</button>)}
      {canManageAccess && <button type="button" aria-current={view === 'access' ? 'page' : undefined} onClick={() => navigate('access')}>{t.access}</button>}
    </nav>
    <div className={view === 'board' && boardMode === 'canvas' ? 'owner-workspace owner-workspace-canvas' : 'owner-workspace'}>
      <div className="owner-section-heading">
        <div>{target && <button type="button" className="owner-back" onClick={() => navigate(target.userId ? 'members' : 'projects')}><ArrowLeft size={15} />{t.back}</button>}
          <h3>{target?.name ?? t[view]}</h3>{target && <span className="owner-badge">{t.readOnly} · {target.userId ? t.personal : t.projects}</span>}
        </div>
        <div className="owner-commands">
          {target && <div className="owner-view-toggle"><button aria-pressed={boardMode === 'canvas'} onClick={() => setBoardMode('canvas')}>{t.canvas}</button><button aria-pressed={boardMode === 'list'} onClick={() => setBoardMode('list')}>{t.list}</button></div>}
          <button className="icon-button" title={t.refresh} aria-label={t.refresh} disabled={loading || busy} onClick={() => setRefresh(n => n + 1)}><RefreshCw size={17} /></button>
          {view !== 'access' && !(target && boardMode === 'canvas') && <button className="secondary-button" disabled={loading || busy || !data} onClick={() => void act('export_page')}><Download size={16} />{t.export}</button>}
          {view === 'audit' && canManageAccess && <button className="icon-button" title={t.purge} aria-label={t.purge} disabled={busy} onClick={() => void act('purge_old_audit')}><Trash2 size={17} /></button>}
        </div>
      </div>
      {view === 'access' ? (canManageAccess && <OwnerAccess t={t} refresh={refresh} onLocked={onLocked} />) : target && boardMode === 'canvas' ? <OwnerBoardInspector key={target.userId ?? target.projectId} target={target} refresh={refresh} t={t} onLocked={onLocked} /> : <>
      {target && <nav className="owner-kinds" aria-label={t.board}>{kinds.map(item => <button type="button" key={item} aria-pressed={kind === item || (item === 'todos' && kind === 'items')} onClick={() => { setKind(item); setBlockId(null); resetPage() }}>{t[item]}</button>)}</nav>}
      {view !== 'overview' && view !== 'invites' && <form className="owner-filters" key={view} onSubmit={search}>
        <label><span>{t.search}</span><input name="search" type="search" maxLength={100} defaultValue={field(filters, 'search')} /></label>
        {view === 'audit' && <>
          <label><span>{t.all}</span><select name="action"><option value="">{t.all}</option>{Object.entries(t.actions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label><span>{t.allEntities}</span><select name="entity"><option value="">{t.allEntities}</option>{entities.map(item => <option key={item}>{item}</option>)}</select></label>
          <label><span>{t.since}</span><input name="since" type="date" /></label>
          <label><span>{t.actor}</span><input name="actor" pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" /></label>
          <label><span>{t.newest}</span><select name="sort"><option value="newest">{t.newest}</option><option value="oldest">{t.oldest}</option></select></label>
        </>}
        <button type="submit" className="icon-button" title={t.search} aria-label={t.search}><Search size={17} /></button>
      </form>}
      {error && <div className="owner-error" role="alert">{t.error}<button className="secondary-button" onClick={() => setRefresh(n => n + 1)}>{t.retry}</button></div>}
      <div className="owner-results" aria-busy={loading}>
        {loading ? <div className="owner-loading"><RefreshCw size={22} className="animate-spin" /></div> : data && !Array.isArray(data) ? <dl className="owner-metrics">
          {Object.entries(t.metrics).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{key.endsWith('Bytes') ? bytes(field(data, key)) : field(data, key)}</dd></div>)}
        </dl> : !rows.length && !error ? <p className="owner-empty">{t.empty}</p> : rows.map(row => <div className="owner-record" key={field(row, 'id')}>
          {view === 'audit' ? <>
            <div className="owner-event-meta"><span className="owner-badge">{actionName(field(row, 'action'))}</span><time>{date(field(row, 'occurred_at'))}</time></div>
            <strong>{field(row, 'title') || field(row, 'entity_type')}</strong>
            <p>{field(row, 'actor_name') || field(row, 'actor_id') || 'SQL'} · {field(row, 'entity_type')}{field(row, 'board_scope') && ` · ${field(row, 'board_scope')}`}</p>
            {Array.isArray(row.changed_fields) && row.changed_fields.length > 0 && <p className="owner-fields">{row.changed_fields.join(', ')}</p>}
            <details><summary>ID</summary><code>{field(row, 'entity_id') || field(row, 'project_id') || field(row, 'id')}</code><br /><code>{field(row, 'actor_id')}</code></details>
          </> : view === 'members' ? <>
            <div className="owner-identity"><ProfileAvatar name={field(row, 'nickname')} avatarPath={field(row, 'avatar_path')} color={field(row, 'active_color') || '#65e7ff'} /><div><strong>{field(row, 'nickname')}</strong><code>{field(row, 'id')}</code></div>
              <button type="button" className="secondary-button" onClick={() => openBoard({ userId: field(row, 'id'), name: field(row, 'nickname') })}><ExternalLink size={15} />{t.personal}</button></div>
            <p>{t.cards}: {field(row, 'personal_cards')} · To-do: {field(row, 'personal_blocks')} · {t.session}: {date(field(row, 'last_seen')) || '—'}</p>
            <div className="owner-memberships">{Array.isArray(row.memberships) && row.memberships.map((value, i) => { const m = asRow(value); return <span className="owner-badge" key={i}><Users size={12} />{field(m, 'team')} · {field(m, 'role')}</span> })}</div>
          </> : view === 'projects' ? <>
            <div className="owner-identity"><Folder size={22} /><div><strong>{field(row, 'name')}</strong><p>{field(row, 'team')} · {t.done}: {field(row, 'done')} / {field(row, 'cards')}</p></div><button className="icon-button" aria-label={t.board} title={t.board} onClick={() => openBoard({ projectId: field(row, 'id'), name: field(row, 'name') })}><ExternalLink size={17} /></button></div>
          </> : view === 'invites' ? <>
            <div className="owner-identity"><div><strong>{field(row, 'invitee_email')}</strong><p>{field(row, 'team')} · {field(row, 'role')} · {t.expires}: {date(field(row, 'expires_at'))}</p></div>{canManageAccess && <button className="icon-button" aria-label={t.revoke} title={t.revoke} disabled={busy} onClick={() => void act('revoke_invite', field(row, 'id'))}><Trash2 size={17} /></button>}</div>
          </> : <>
            <div className="owner-event-meta">{(kind === 'cards' || kind === 'items') && <span className="owner-badge" data-done={row.status === 'done' || row.is_done === true}>{row.status === 'done' || row.is_done === true ? t.done : t.todo}{row.is_active === true ? ` · ${t.active}` : ''}</span>}
              {field(row, 'deadline_at') && <time>{t.deadline}: {date(field(row, 'deadline_at'))}</time>}</div>
            <strong>{field(row, 'title')}</strong>
            {kind === 'texts' && <p className="owner-content"><FileText size={16} /> {field(row, 'content')}</p>}
            {field(row, 'description') && <p className="owner-content">{field(row, 'description')}</p>}
            {field(row, 'completed_at') && <p>{t.completed}: {date(field(row, 'completed_at'))}</p>}
            {kind === 'todos' && <button className="secondary-button" onClick={() => { setKind('items'); setBlockId(field(row, 'id')); resetPage() }}><ListChecks size={16} />{t.items} · {field(row, 'done')} / {field(row, 'items')}</button>}
            {kind === 'links' && <code>{field(row, 'from_card_id') || field(row, 'from_todo_block_id')} → {field(row, 'to_card_id') || field(row, 'to_todo_block_id')}</code>}
            {field(row, 'image_path') && <OwnerImage path={field(row, 'image_path')} todo={kind === 'items'} t={t} />}
          </>}
        </div>)}
      </div>
      {Array.isArray(data) && <footer className="owner-pagination">
        <button className="icon-button" aria-label={t.previous} title={t.previous} disabled={loading || page === 0} onClick={() => setPage(n => n - 1)}><ChevronLeft size={18} /></button><span>{page + 1}</span>
        <button className="icon-button" aria-label={t.next} title={t.next} disabled={loading || data.length <= 50 || page >= 1000} onClick={() => { setCursors(current => [...current.slice(0, page + 1), field(rows[49], 'id')]); setPage(n => n + 1) }}><ChevronRight size={18} /></button>
      </footer>}
      </>}
    </div>
  </>
}

export const OwnerData = memo(OwnerDataView)
