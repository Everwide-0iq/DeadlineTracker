import { create } from 'zustand'
import { readStorageValue, writeStorageValue } from '../../lib/storage.ts'
import type { Language } from './i18n.types.ts'
import { translations } from './translations.ts'

type I18nState = {
  language: Language
  setLanguage: (language: Language) => void
  toggleLanguage: () => void
}

const storageKey = 'fireboard.language'

function getInitialLanguage(): Language {
  const stored = readStorageValue(storageKey)
  return stored === 'en' || stored === 'ru' ? stored : 'ru'
}

export const useI18nStore = create<I18nState>((set, get) => ({
  language: getInitialLanguage(),
  setLanguage: (language) => {
    writeStorageValue(storageKey, language)
    set({ language })
  },
  toggleLanguage: () => {
    const nextLanguage = get().language === 'ru' ? 'en' : 'ru'
    writeStorageValue(storageKey, nextLanguage)
    set({ language: nextLanguage })
  },
}))

export function getCurrentLanguage() {
  return useI18nStore.getState().language
}

export function getCurrentTranslation() {
  return translations[getCurrentLanguage()]
}
