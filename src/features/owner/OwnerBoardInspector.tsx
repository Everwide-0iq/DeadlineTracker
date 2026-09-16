import { CheckCircle2, ChevronDown, ChevronUp, Download, Focus, Image, ListChecks, Loader2, Minus, Plus, Search, X } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { requireSupabase } from '../../lib/supabase.ts'
import { CardLinkLayer } from '../board/CardLinkLayer.tsx'
import type { ConnectableBoardObjectMetric } from '../board/boardObject.types.ts'
import { getCardRenderSize } from '../cards/card.utils.ts'
import { getDeadlineVisualState } from '../cards/deadlineColor.ts'
import { useI18nStore } from '../i18n/i18n.store.ts'
import { getTodoBlockRenderHeight } from '../todos/todo.utils.ts'
import { OwnerBoardCard } from './OwnerBoardCard.tsx'
import { field, isLockedError, ownerAction, type OwnerBoardTarget, type OwnerRow } from './owner.api.ts'
import type { OwnerCopy } from './owner.copy.ts'
import { boardBounds, fitBoard, inViewport, numberField, parseBoardSnapshot, zoomAt, type BoardSnapshot } from './ownerBoard.model.ts'
import { useInspectorCamera } from './useInspectorCamera.ts'
import { OwnerImage } from './OwnerImage.tsx'

const noop = () => {}
const fontFamilies: Record<string, string> = { display: 'Inter, sans-serif', mono: 'ui-monospace, monospace', serif: 'Georgia, serif', system: 'system-ui, sans-serif' }

export function OwnerBoardInspector({ target, refresh, t, onLocked }: { target: OwnerBoardTarget; refresh: number; t: OwnerCopy; onLocked: () => void }) {
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [images, setImages] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [now, setNow] = useState(Date.now)
  const { viewportRef, camera, latest, size, move, moved, pointerDown, pointerMove, pointerUp } = useInspectorCamera()
  const fitted = useRef(false)
  const alive = useRef(true)
  const locked = useRef(onLocked)
  locked.current = onLocked
  const language = useI18nStore(s => s.language)
  const prefix = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    let current = true
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 25_000)
    setLoading(true); setError('')
    void Promise.resolve(requireSupabase().rpc('owner_console_board', { target_user_id: target.userId, target_project_id: target.projectId }).abortSignal(controller.signal))
      .then(({ data, error: failure }) => {
        if (failure) throw failure
        const next = parseBoardSnapshot(data)
        if (current) { setSnapshot(next); setSelected(null) }
      }).catch(failure => {
        if (!current) return
        if (isLockedError(failure)) locked.current()
        else setError(failure?.code === '54000' ? t.boardTooLarge : t.error)
      }).finally(() => { clearTimeout(timeout); if (current) setLoading(false) })
    return () => { current = false; controller.abort(); clearTimeout(timeout) }
  }, [target.userId, target.projectId, refresh, t.error, t.boardTooLarge])
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer) }, [])
  const profiles = useMemo(() => new Map(snapshot?.profiles.map(p => [field(p, 'id'), p])), [snapshot])
  const itemsByBlock = useMemo(() => {
    const result = new Map<string, OwnerRow[]>()
    for (const item of snapshot?.items ?? []) { const key = field(item, 'block_id'); const list = result.get(key) ?? []; list.push(item); result.set(key, list) }
    return result
  }, [snapshot])
  const nodes = useMemo(() => {
    const cards = (snapshot?.cards ?? []).map(card => ({ id: card.id, kind: 'card' as const, x: card.x, y: card.y, ...getCardRenderSize(card), color: getDeadlineVisualState(card.deadlineAt, card.status, now, language).borderColor }))
    const todos = (snapshot?.todos ?? []).map(row => ({ id: field(row, 'id'), kind: 'todo' as const, x: numberField(row, 'x'), y: numberField(row, 'y'), w: numberField(row, 'w'), h: getTodoBlockRenderHeight(itemsByBlock.get(field(row, 'id'))?.length ?? 0, expanded.has(field(row, 'id'))), color: '#76e4e8' }))
    const texts = (snapshot?.texts ?? []).map(row => {
      const fontSize = numberField(row, 'font_size'), w = numberField(row, 'w')
      const lines = field(row, 'content').split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(line.length / Math.max(1, w / (fontSize * 0.58)))), 0)
      return { id: field(row, 'id'), kind: 'text' as const, x: numberField(row, 'x'), y: numberField(row, 'y'), w, h: lines * fontSize * 1.12 + 16, color: field(row, 'color') }
    })
    return [...cards, ...todos, ...texts]
  }, [snapshot, itemsByBlock, expanded, now, language])
  const bounds = useMemo(() => boardBounds(nodes), [nodes])
  const linkNodes = useMemo(() => nodes.filter(n => n.kind !== 'text') as ConnectableBoardObjectMetric[], [nodes])
  useEffect(() => {
    if (!fitted.current && snapshot && size.width > 0 && size.height > 0) { fitted.current = true; move(fitBoard(bounds, size.width, size.height)) }
  }, [snapshot, bounds, size, move])
  const select = useCallback((id: string) => { if (!moved.current) setSelected(id) }, [moved])
  const cardById = useMemo(() => new Map(snapshot?.cards.map(c => [c.id, c])), [snapshot])
  const textById = useMemo(() => new Map(snapshot?.texts.map(r => [field(r, 'id'), r])), [snapshot])
  const todoById = useMemo(() => new Map(snapshot?.todos.map(r => [field(r, 'id'), r])), [snapshot])
  const names = useMemo(() => new Map(nodes.map(node => [node.id, cardById.get(node.id)?.title ?? field(textById.get(node.id) ?? todoById.get(node.id) ?? {}, node.kind === 'text' ? 'content' : 'title')])), [nodes, cardById, textById, todoById])
  const matches = search.trim() ? nodes.filter(n => names.get(n.id)?.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).slice(0, 12) : []
  const selectedCard = selected ? cardById.get(selected) : undefined
  const selectedRow = selected ? todoById.get(selected) ?? textById.get(selected) : undefined
  const focus = (id: string) => { const node = nodes.find(n => n.id === id); if (node) { move(fitBoard(node, size.width, size.height)); setSelected(id); setSearch('') } }
  const exportBoard = async () => {
    if (!snapshot || exporting) return
    setExporting(true)
    try {
      await ownerAction('export_page')
      if (!alive.current) return
      const url = URL.createObjectURL(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), target, snapshot }, null, 2)], { type: 'application/json' }))
      const link = document.createElement('a'); link.href = url; link.download = 'fireboard-admin-board.json'; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (failure) { if (alive.current) { if (isLockedError(failure)) locked.current(); else setError(t.error) } }
    finally { if (alive.current) setExporting(false) }
  }
  return <div className="owner-inspector">
    <div className="owner-inspector-toolbar">
      <div className="owner-inspector-search"><Search size={15} /><input aria-label={t.search} placeholder={t.search} value={search} onChange={e => setSearch(e.target.value)} />
        {search && <div className="owner-search-results">{matches.length ? matches.map(n => <button key={n.id} onClick={() => focus(n.id)}>{names.get(n.id)}</button>) : <p>{t.empty}</p>}</div>}
      </div>
      <span className="owner-badge">{nodes.length} {t.objects}</span>
      <button className="icon-button" title={t.image} aria-label={t.image} aria-pressed={images} onClick={() => setImages(v => !v)}><Image size={17} /></button>
      <button className="icon-button" title={t.fit} aria-label={t.fit} onClick={() => move(fitBoard(bounds, size.width, size.height))}><Focus size={17} /></button>
      <button className="icon-button" title={t.zoomOut} aria-label={t.zoomOut} onClick={() => move(zoomAt(latest.current, 0.8, size.width / 2, size.height / 2))}><Minus size={17} /></button>
      <button className="owner-zoom" title="100%" onClick={() => move(zoomAt(latest.current, 1 / latest.current.zoom, size.width / 2, size.height / 2))}>{Math.round(camera.zoom * 100)}%</button>
      <button className="icon-button" title={t.zoomIn} aria-label={t.zoomIn} onClick={() => move(zoomAt(latest.current, 1.25, size.width / 2, size.height / 2))}><Plus size={17} /></button>
      <button className="icon-button" disabled={!snapshot || exporting} title={t.exportBoard} aria-label={t.exportBoard} onClick={() => void exportBoard()}><Download size={17} /></button>
    </div>
    {error && <div className="owner-error" role="alert">{error}</div>}
    <div className="owner-inspector-body">
      <div className="owner-canvas" ref={viewportRef} tabIndex={0} aria-label={t.canvas}
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onLostPointerCapture={pointerUp}
        onClickCapture={e => { if (moved.current) { e.stopPropagation(); moved.current = false } }}
        onKeyDown={e => { if (e.target !== e.currentTarget) return; const delta = { ArrowLeft: [80, 0], ArrowRight: [-80, 0], ArrowUp: [0, 80], ArrowDown: [0, -80] }[e.key]; if (delta) { e.preventDefault(); move({ ...latest.current, x: latest.current.x + delta[0], y: latest.current.y + delta[1] }) } }}
        style={{ backgroundSize: `${40 * camera.zoom}px ${40 * camera.zoom}px`, backgroundPosition: `${camera.x}px ${camera.y}px` }}>
        <div className="owner-canvas-world" style={{ transform: `translate(${camera.x}px,${camera.y}px) scale(${camera.zoom})` }}>
          {snapshot && <div className="owner-readonly-links"><CardLinkLayer idPrefix={`owner-${prefix}`} draftLink={null} links={snapshot.links} nodes={linkNodes} selectedLinkId={null} onDeleteLink={noop} onSelectLink={noop} /></div>}
          {nodes.filter(n => inViewport(n, camera, size.width, size.height)).map(node => {
            if (node.kind === 'card') { const card = cardById.get(node.id)!; return <OwnerBoardCard key={node.id} card={card} activeProfile={profiles.get(card.activeBy ?? '')} now={now} images={images && camera.zoom >= 0.25} selected={selected === node.id} onSelect={select} t={t} /> }
            if (node.kind === 'text') { const row = textById.get(node.id)!; return <div key={node.id} className="owner-canvas-text" role="button" tabIndex={0} onClick={() => select(node.id)} onKeyDown={e => { if (e.key === 'Enter') setSelected(node.id) }}
              style={{ left: node.x, top: node.y, width: node.w, color: node.color, fontSize: numberField(row, 'font_size'), fontFamily: fontFamilies[field(row, 'font_family')] ?? fontFamilies.system }}>{field(row, 'content')}</div> }
            const row = todoById.get(node.id)!, items = itemsByBlock.get(node.id) ?? [], isExpanded = expanded.has(node.id)
            return <article key={node.id} className="owner-canvas-todo" tabIndex={0} aria-label={field(row, 'title')} style={{ left: node.x, top: node.y, width: node.w, height: node.h }} onClick={() => select(node.id)} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setSelected(node.id) } }}>
              <header><ListChecks size={20} /><strong>{field(row, 'title')}</strong><span>{items.filter(i => i.is_done === true).length}/{items.length}</span></header>
              <p>{field(row, 'deadline_at') ? new Date(field(row, 'deadline_at')).toLocaleString() : t.noDeadline}</p>
              {(isExpanded ? items : items.slice(0, 10)).map(item => <div className="owner-todo-row" key={field(item, 'id')} data-done={item.is_done === true}><CheckCircle2 size={18} /><span>{field(item, 'title')}</span>{item.is_active === true && <b>{t.active}</b>}</div>)}
              {items.length > 10 && <button data-inspector-ui type="button" onClick={e => { e.stopPropagation(); setExpanded(current => { const next = new Set(current); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next }) }}>{isExpanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}{isExpanded ? t.collapse : t.expand}</button>}
            </article>
          })}
        </div>
        {!loading && snapshot && nodes.length === 0 && <p className="owner-canvas-empty">{t.empty}</p>}
        {loading && <div className="owner-canvas-loading"><Loader2 className="animate-spin" size={24} /></div>}
        <svg className="owner-canvas-minimap" data-inspector-ui viewBox={`${bounds.x - 40} ${bounds.y - 40} ${bounds.w + 80} ${bounds.h + 80}`} preserveAspectRatio="none" role="img" aria-label={t.minimap}
          onPointerDown={e => { e.preventDefault(); const rect = e.currentTarget.getBoundingClientRect(); const x = bounds.x - 40 + (e.clientX - rect.left) / rect.width * (bounds.w + 80), y = bounds.y - 40 + (e.clientY - rect.top) / rect.height * (bounds.h + 80); move({ ...latest.current, x: size.width / 2 - x * latest.current.zoom, y: size.height / 2 - y * latest.current.zoom }) }}>
          {nodes.map(n => <rect key={n.id} x={n.x} y={n.y} width={n.w} height={n.h} fill={n.color} opacity="0.7" />)}
          <rect x={-camera.x / camera.zoom} y={-camera.y / camera.zoom} width={size.width / camera.zoom} height={size.height / camera.zoom} fill="none" stroke="white" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        </svg>
        {snapshot && <span className="owner-snapshot-time">{t.snapshot}: {new Date(snapshot.capturedAt).toLocaleTimeString()}</span>}
      </div>
      {(selectedCard || selectedRow) && <aside className="owner-board-details" aria-label={t.details}>
        <header><span>{t.details}</span><button className="icon-button" aria-label={t.close} onClick={() => setSelected(null)}><X size={17} /></button></header>
        <h3>{selectedCard?.title ?? field(selectedRow!, 'title') ?? ''}</h3>
        <p className="owner-content">{selectedCard?.description ?? field(selectedRow ?? {}, 'content')}</p>
        {selectedCard && <><span className="owner-badge">{selectedCard.status === 'done' ? t.done : t.todo}</span><p>{t.deadline}: {selectedCard.deadlineAt ? new Date(selectedCard.deadlineAt).toLocaleString() : t.noDeadline}</p><p>{selectedCard.completedAt && `${t.completed}: ${new Date(selectedCard.completedAt).toLocaleString()}`}</p>
          {selectedCard.activeBy && <p>{t.active}: {field(profiles.get(selectedCard.activeBy) ?? {}, 'nickname') || selectedCard.activeBy}</p>}
          {selectedCard.completedBy && <p>{t.completed}: {field(profiles.get(selectedCard.completedBy) ?? {}, 'nickname') || selectedCard.completedBy}</p>}
          {selectedCard.imagePath && <OwnerImage path={selectedCard.imagePath} todo={false} t={t} />}</>}
        {selectedRow && (itemsByBlock.get(field(selectedRow, 'id')) ?? []).map(item => <section key={field(item, 'id')}><strong>{item.is_done === true ? '✓ ' : ''}{field(item, 'title')}</strong><p className="owner-content">{field(item, 'description')}</p>{item.is_active === true && <span className="owner-badge">{t.active} · {field(profiles.get(field(item, 'active_by')) ?? {}, 'nickname')}</span>}{field(item, 'image_path') && <OwnerImage path={field(item, 'image_path')} todo t={t} />}</section>)}
        <code>{selected}</code>
      </aside>}
    </div>
  </div>
}
