import { create } from 'zustand'
import { readStorageValue, writeStorageValue } from '../../lib/storage.ts'

export const performanceModeStorageKey = 'fireboard.performance-mode.v1'

type PreferencesState = {
  performanceMode: boolean
  setPerformanceMode: (enabled: boolean) => void
  togglePerformanceMode: () => void
}

const initialPerformanceMode = readStorageValue(performanceModeStorageKey) === 'true'

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  performanceMode: initialPerformanceMode,
  setPerformanceMode: (performanceMode) => {
    writeStorageValue(performanceModeStorageKey, String(performanceMode))
    set({ performanceMode })
  },
  togglePerformanceMode: () => get().setPerformanceMode(!get().performanceMode),
}))
