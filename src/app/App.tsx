import { AppProviders } from './providers/AppProviders.tsx'
import { AppRouter } from './router.tsx'

export function App() {
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  )
}
