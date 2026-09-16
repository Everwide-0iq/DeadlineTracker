import { AppErrorBoundary } from '../components/AppErrorBoundary.tsx'
import { FeedbackCenter } from '../features/feedback/FeedbackCenter.tsx'
import { SessionAudit } from '../features/owner/SessionAudit.tsx'
import { AppProviders } from './providers/AppProviders.tsx'
import { AppRouter } from './router.tsx'

export function App() {
  return (
    <AppProviders>
      <AppErrorBoundary>
        <AppRouter />
        <SessionAudit />
        <FeedbackCenter />
      </AppErrorBoundary>
    </AppProviders>
  )
}
