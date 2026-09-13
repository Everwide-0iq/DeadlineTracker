import { Crosshair, Gamepad2, Heart, Keyboard, LoaderCircle, Pause, Play, RotateCcw, Trophy, Volume2, VolumeX, X, Zap, Route } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDialogFocus } from '../../lib/useDialogFocus.ts'
import { readStorageValue, writeStorageValue } from '../../lib/storage.ts'
import { ArcadeAudio } from './arcade.audio.ts'
import { readBest, saveBest, type ArcadeMode, type ArcadeSnapshot, type ArcadeStats } from './arcade.model.ts'
import { BoardArcadeScene, createArcadeGame } from './BoardArcadeScene.ts'
import { useTeamStore } from '../team/team.store.ts'
import { ArcadeLeaderboard } from './ArcadeLeaderboard.tsx'
import { useArcadeLeaderboard } from './useArcadeLeaderboard.ts'
import './arcade.css'

export type ArcadeDialogProps = { snapshot: ArcadeSnapshot; userId: string; reduced: boolean; language: 'en' | 'ru'; anchor: HTMLElement | null; onClose: () => void }
const copy = {
  en: { score: 'Score', best: 'Personal best', level: 'Level', lives: 'Lives', play: 'Play', resume: 'Resume', pause: 'Pause', paused: 'Paused', over: 'Run complete', restart: 'New run', exit: 'Back to board', sound: 'Sound', loading: 'Loading Arcade', error: 'Arcade could not start. Try a new run or return to the board.', record: 'New personal best', storage: 'Record could not be saved in this browser.', keys: 'Snake: WASD / arrows. Shooter: WASD / arrows to move, mouse to aim, hold click / Space to fire. P pauses, Esc exits.', local: 'LOCAL ARCADE' },
  ru: { score: 'Очки', best: 'Личный рекорд', level: 'Уровень', lives: 'Жизни', play: 'Играть', resume: 'Продолжить', pause: 'Пауза', paused: 'Пауза', over: 'Игра завершена', restart: 'Новая игра', exit: 'Вернуться к доске', sound: 'Звук', loading: 'Загрузка Arcade', error: 'Не удалось запустить Arcade. Начните новую игру или вернитесь к доске.', record: 'Новый личный рекорд', storage: 'Не удалось сохранить рекорд в этом браузере.', keys: 'Змейка: WASD / стрелки. Шутер: WASD / стрелки для движения, мышь для прицела, зажать ЛКМ / пробел для стрельбы. P — пауза, Esc — выход.', local: 'LOCAL ARCADE' },
}

export default function ArcadeDialog({ snapshot, userId, reduced, language, anchor, onClose }: ArcadeDialogProps) {
  const t = copy[language]
  const [mode, setMode] = useState<ArcadeMode>('snake')
  const teamId = useTeamStore(state => state.team?.id ?? null)
  const leaderboard = useArcadeLeaderboard(teamId, mode)
  const submitRef = useRef(leaderboard.submit)
  submitRef.current = leaderboard.submit
  const runToken = useRef<string | null>(null)
  const runEpoch = useRef(0)
  const invalidateRun = useCallback(() => { runEpoch.current++ }, [])
  const [starting, setStarting] = useState(false)
  const [run, setRun] = useState(0)
  const [stats, setStats] = useState<ArcadeStats>({ score: 0, lives: 1, level: 1, phase: 'ready' })
  const [best, setBest] = useState(() => readBest(userId, 'snake'))
  const [record, setRecord] = useState(false)
  const [recordBaseline, setRecordBaseline] = useState(0)
  const [storageError, setStorageError] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(false)
  const [muted, setMuted] = useState(() => readStorageValue('fireboard.arcade.muted') === 'true')
  const [closing, setClosing] = useState(false)
  const closeTimer = useRef<number | null>(null)
  const lostFocus = useRef(false)
  const container = useRef<HTMLDivElement>(null)
  const scene = useRef<BoardArcadeScene | null>(null)
  const sound = useRef<ArcadeAudio | null>(null)
  const closeRef = useRef(onClose)
  const requestClose = useCallback(() => {
    if (closeTimer.current !== null) return
    invalidateRun()
    scene.current?.pause(); sound.current?.silence()
    setClosing(true)
    closeTimer.current = window.setTimeout(onClose, reduced || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160)
  }, [onClose, reduced, invalidateRun])
  closeRef.current = requestClose
  const dialog = useDialogFocus<HTMLDialogElement>({ active: true })
  useLayoutEffect(() => {
    const element = dialog.current
    if (!element || !anchor) return
    const position = () => {
      const rect = anchor.getBoundingClientRect()
      Object.assign(element.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` })
    }
    position()
    const observer = new ResizeObserver(position)
    observer.observe(anchor)
    window.addEventListener('resize', position)
    return () => { observer.disconnect(); window.removeEventListener('resize', position) }
  }, [anchor, dialog])

  useEffect(() => () => { if (closeTimer.current !== null) clearTimeout(closeTimer.current) }, [])
  const liveStats = useRef(stats)
  const togglePause = useCallback(() => {
    if (liveStats.current.phase === 'playing') { scene.current?.pause(); sound.current?.silence() }
    else if (liveStats.current.phase === 'paused') { sound.current?.unlock(); scene.current?.resume(); container.current?.querySelector('canvas')?.focus() }
  }, [])

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [dialog])

  useEffect(() => {
    const audio = new ArcadeAudio()
    sound.current = audio
    return () => { audio.destroy(); sound.current = null }
  }, [])

  useEffect(() => {
    if (!sound.current) return
    sound.current.muted = muted
    writeStorageValue('fireboard.arcade.muted', String(muted))
    if (muted) sound.current.silence()
    else sound.current.unlock()
  }, [muted])

  useEffect(() => {
    const host = container.current
    if (!host || !sound.current) return
    let disposed = false
    invalidateRun()
    runToken.current = null
    setStarting(false)
    let game: ReturnType<typeof createArcadeGame> | null = null
    const initialBest = readBest(userId, mode)
    setBest(initialBest); setRecord(false); setReady(false); setError(false); setStorageError(false)
    setStats({ score: 0, lives: mode === 'snake' ? 1 : 3, level: 1, phase: 'ready' })
    const next = new BoardArcadeScene({ mode, snapshot, reduced: reduced || window.matchMedia('(prefers-reduced-motion: reduce)').matches, sound: sound.current,
      report: value => {
        if (disposed) return
        liveStats.current = value
        setStats(value); setReady(true)
        if (value.phase === 'over') submitRef.current(runToken.current, value.score, value.elapsedMs ?? 0)
        if (value.score > initialBest) {
          setBest(value.score); setRecord(true)
          if (!saveBest(userId, mode, value.score)) setStorageError(true)
        }
      },
    })
    scene.current = next
    const onContextLost = () => { next.pause(); setError(true) }
    const frame = requestAnimationFrame(() => {
      try {
        game = createArcadeGame(host, next)
        game.canvas.tabIndex = 0
        game.canvas.setAttribute('aria-label', mode === 'snake' ? 'Neon Snake' : 'Deadline Blaster')
        game.canvas.addEventListener('webglcontextlost', onContextLost)
      } catch { setError(true) }
    })
    const timeout = window.setTimeout(() => { if (!game?.isBooted) setError(true) }, 10000)
    return () => {
      disposed = true
      invalidateRun()
      cancelAnimationFrame(frame); clearTimeout(timeout)
      sound.current?.silence()
      scene.current = null
      if (game) {
        game.canvas?.removeEventListener('webglcontextlost', onContextLost)
        // Process Phaser's queued destruction even when the browser throttles animation frames.
        game.destroy(true)
        game.step(performance.now(), 0)
      }
    }
  }, [mode, run, snapshot, userId, reduced, invalidateRun])

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.code === 'Tab') return
      event.stopImmediatePropagation()
      if (closeTimer.current !== null) return
      const down = event.type === 'keydown'
      if (event.code === 'Escape') { event.preventDefault(); if (down) closeRef.current(); return }
      if (event.code === 'KeyP' && down && !event.repeat) { event.preventDefault(); togglePause(); return }
      const controlFocused = event.target instanceof Element && !!event.target.closest('button')
      if (controlFocused && (event.code === 'Space' || event.code === 'Enter')) return
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault()
      if (!event.repeat || !down) scene.current?.setKey(event.code, down)
    }
    const pause = () => { lostFocus.current = true; scene.current?.pause(); sound.current?.silence() }
    const visibility = () => { if (document.hidden) pause() }
    window.addEventListener('keydown', key, true)
    window.addEventListener('keyup', key, true)
    window.addEventListener('blur', pause)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('keydown', key, true); window.removeEventListener('keyup', key, true)
      window.removeEventListener('blur', pause); document.removeEventListener('visibilitychange', visibility)
    }
  }, [togglePause])

  const start = async () => {
    lostFocus.current = false
    sound.current?.unlock()
    if (stats.phase === 'paused') { scene.current?.resume() }
    else {
      if (starting) return
      setRecordBaseline(Math.max(best, sharedBest))
      setStarting(true)
      const epoch = runEpoch.current
      const token = await leaderboard.begin()
      if (runEpoch.current !== epoch) return
      runToken.current = token
      setStarting(false)
      sound.current?.unlock()
      scene.current?.start()
      if (document.hidden || lostFocus.current) { scene.current?.pause(); sound.current?.silence() }
    }
    container.current?.querySelector('canvas')?.focus()
  }
  const reset = () => { sound.current?.unlock(); setRun(n => n + 1) }
  const switchMode = (value: ArcadeMode) => { if (value !== mode) { sound.current?.silence(); setMode(value) } }
  const leader = leaderboard.entries[0]
  const sharedBest = leaderboard.entries.find(entry => entry.user_id === userId)?.score ?? 0
  const target = leaderboard.entries.filter(entry => entry.user_id !== userId && entry.score >= stats.score).at(-1)
  const leaderboardPanel = <ArcadeLeaderboard entries={leaderboard.entries} status={leaderboard.status} saving={leaderboard.saving} userId={userId} language={language} onRefresh={leaderboard.retry} />

  return createPortal(<dialog ref={dialog} className="arcade-dialog" aria-labelledby="arcade-title" onCancel={e => { e.preventDefault(); requestClose() }} data-reduced={reduced} data-closing={closing}
    onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onPointerMove={e => e.stopPropagation()}
    onWheel={e => e.stopPropagation()} onContextMenu={e => { e.preventDefault(); e.stopPropagation() }}>
    <header className="arcade-header">
      <div className="arcade-brand"><Gamepad2 size={25} /><div><strong id="arcade-title">FIREBOARD <span>ARCADE</span></strong><small>{snapshot.name}</small></div></div>
      <div className="arcade-modes" role="group" aria-label="Arcade">
        <button type="button" disabled={starting || leaderboard.saving === 'saving'} aria-pressed={mode === 'snake'} onClick={() => switchMode('snake')}><Route size={17} />Neon Snake</button>
        <button type="button" disabled={starting || leaderboard.saving === 'saving'} aria-pressed={mode === 'shooter'} onClick={() => switchMode('shooter')}><Crosshair size={17} />Deadline Blaster</button>
      </div>
      <div className="arcade-tools">
        <button type="button" title={t.keys} aria-label={t.keys}><Keyboard size={19} /></button>
        <button type="button" title={t.sound} aria-label={t.sound} aria-pressed={!muted} onClick={() => setMuted(v => !v)}>{muted ? <VolumeX size={19} /> : <Volume2 size={19} />}</button>
        <button type="button" title={t.exit} aria-label={t.exit} onClick={requestClose}><X size={21} /></button>
      </div>
    </header>
    <div className="arcade-hud">
      <div><span>{t.score}</span><strong>{String(stats.score).padStart(5, '0')}</strong></div>
      <div className="arcade-best" title={t.best}><Trophy size={17} /><span>{t.best}</span><strong>{Math.max(best, sharedBest)}</strong></div>
      <div><Zap size={16} /><span>{t.level}</span><strong>{stats.level}</strong></div>
      <div aria-label={`${t.lives}: ${stats.lives}`} className="arcade-lives">{Array.from({ length: mode === 'snake' ? 1 : 3 }, (_, i) => <Heart key={i} size={18} fill={i < stats.lives ? 'currentColor' : 'none'} opacity={i < stats.lives ? 1 : .25} />)}</div>
      <div className="arcade-session-tools">
        <button type="button" title={stats.phase === 'paused' ? t.resume : t.pause} aria-label={stats.phase === 'paused' ? t.resume : t.pause} disabled={stats.phase !== 'playing' && stats.phase !== 'paused'} onClick={togglePause}>{stats.phase === 'paused' ? <Play size={18} /> : <Pause size={18} />}</button>
        <button type="button" title={t.restart} aria-label={t.restart} disabled={starting || leaderboard.saving === 'saving'} onClick={reset}><RotateCcw size={18} /></button>
      </div>
    </div>
    {leader ? <div className="arcade-challenge"><Trophy size={15} /><span title={leader.nickname}>{language === 'ru' ? 'Лидер' : 'Leader'}: <b>{leader.nickname}</b></span><strong>{leader.score}</strong>{target ? <span className="arcade-next-target" title={target.nickname}>{language === 'ru' ? `До обгона ${target.nickname}` : `To beat ${target.nickname}`}: <b>+{Math.max(mode === 'snake' ? 25 : 10, target.score - stats.score + (mode === 'snake' ? 25 : 10))}</b></span> : <span className="arcade-next-target">{language === 'ru' ? 'Задай новый рекорд' : 'Set the next record'}</span>}</div> : null}
    <main className="arcade-stage" data-ready={ready}>
      <div className="arcade-canvas" ref={container} onPointerDown={() => { sound.current?.unlock(); container.current?.querySelector('canvas')?.focus() }} />
      {error ? <div className="arcade-curtain"><p role="alert">{t.error}</p><button type="button" className="arcade-play" onClick={reset}><RotateCcw size={19} />{t.restart}</button></div> : !ready ?
        <div className="arcade-curtain" role="status"><LoaderCircle className="animate-spin" /><p>{t.loading}</p></div> : stats.phase !== 'playing' ?
        <div className={`arcade-curtain arcade-${stats.phase} arcade-lobby`}>
          <div className="arcade-lobby-action">
          <span className="arcade-eyebrow">{stats.phase === 'over' && record && stats.score > recordBaseline ? t.record : leaderboard.status === 'ready' ? 'TEAM CHALLENGE' : t.local}</span>
          <h1>{stats.phase === 'ready' ? mode === 'snake' ? 'NEON SNAKE' : 'DEADLINE BLASTER' : stats.phase === 'paused' ? t.paused : t.over}</h1>
          {stats.phase === 'over' ? <strong className="arcade-final-score">{stats.score}<Trophy size={26} /></strong> : null}
          <button type="button" className="arcade-play" disabled={starting || leaderboard.saving === 'saving'} onClick={stats.phase === 'over' ? reset : () => void start()}>{starting ? <LoaderCircle size={21} className="animate-spin" /> : <Play size={21} fill="currentColor" />}{stats.phase === 'over' ? t.restart : stats.phase === 'paused' ? t.resume : t.play}</button>
          </div>
          {leaderboardPanel}
        </div> : null}
    </main>
    {storageError ? <p className="arcade-storage" role="status">{t.storage}</p> : null}
  </dialog>, document.body)
}
