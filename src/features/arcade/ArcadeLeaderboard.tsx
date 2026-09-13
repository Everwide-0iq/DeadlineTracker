import { Crown, LoaderCircle, RefreshCw, Trophy } from 'lucide-react'
import { ProfileAvatar } from '../profile/ProfileAvatar.tsx'
import type { LeaderboardEntry, LeaderboardStatus } from './useArcadeLeaderboard.ts'

export function ArcadeLeaderboard({ entries, status, saving, userId, language, onRefresh }: {
  entries: LeaderboardEntry[]; status: LeaderboardStatus; saving: 'idle' | 'saving' | 'failed'; userId: string; language: 'en' | 'ru'; onRefresh: () => void
}) {
  const ru = language === 'ru'
  return <section className="arcade-leaderboard" aria-label={ru ? 'Лидерборд команды' : 'Team leaderboard'}>
    <header><Trophy size={18} /><h2>{ru ? 'Лидерборд команды' : 'Team leaderboard'}</h2><button type="button" title={ru ? 'Обновить рейтинг' : 'Refresh leaderboard'} aria-label={ru ? 'Обновить рейтинг' : 'Refresh leaderboard'} onClick={onRefresh} disabled={status === 'loading' || saving === 'saving'}><RefreshCw size={15} /></button></header>
    {saving === 'saving' ? <p className="arcade-ranking-status" role="status"><LoaderCircle size={14} className="animate-spin" />{ru ? 'Сохраняем результат...' : 'Saving result...'}</p> : null}
    {saving === 'failed' ? <button className="arcade-ranking-retry" type="button" onClick={onRefresh}><RefreshCw size={14} />{ru ? 'Повторить отправку результата' : 'Retry score submission'}</button> : null}
    {status === 'loading' && !entries.length ? <p className="arcade-ranking-status" role="status"><LoaderCircle size={16} className="animate-spin" />{ru ? 'Загрузка рейтинга...' : 'Loading leaderboard...'}</p> : null}
    {status === 'setup' ? <p className="arcade-ranking-status" role="status">{ru ? 'Для командного рейтинга примените обновлённый SQL в Supabase. Личные рекорды доступны.' : 'Apply the updated Supabase SQL to enable team rankings. Personal records are available.'}</p> : null}
    {status === 'offline' ? <p className="arcade-ranking-status" role="status">{ru ? 'Рейтинг временно недоступен. Можно играть локально.' : 'Rankings are unavailable. Local play is available.'}</p> : null}
    {status === 'no-team' ? <p className="arcade-ranking-status">{ru ? 'Командный рейтинг доступен участникам команды.' : 'Team membership is required for shared rankings.'}</p> : null}
    {status === 'ready' && !entries.length ? <div className="arcade-ranking-empty"><Crown size={30} /><strong>{ru ? 'Первое место свободно' : 'First place is waiting'}</strong></div> : null}
    {entries.length ? <ol>{entries.map(entry => <li key={entry.user_id} data-self={entry.user_id === userId} data-rank={entry.rank}>
      <span className="arcade-rank">{entry.rank === 1 ? <Crown size={17} /> : `#${entry.rank}`}</span>
      <ProfileAvatar avatarPath={entry.avatar_path} color={entry.active_color} name={entry.nickname} size={30} />
      <span className="arcade-ranked-name" title={entry.nickname}>{entry.nickname}{entry.user_id === userId ? <small>{ru ? 'Вы' : 'You'}</small> : null}</span>
      <strong>{entry.score}</strong>
    </li>)}</ol> : null}
  </section>
}
