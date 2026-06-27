import { useShallow } from 'zustand/react/shallow'
import { useAuthStore } from './auth.store.ts'

export function useAuth() {
  return useAuthStore(
    useShallow((state) => ({
      error: state.error,
      isLoading: state.isLoading,
      isSubmitting: state.isSubmitting,
      session: state.session,
      user: state.user,
      clearError: state.clearError,
      login: state.login,
      logout: state.logout,
    })),
  )
}
