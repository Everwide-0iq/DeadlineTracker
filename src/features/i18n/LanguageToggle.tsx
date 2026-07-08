import { Languages } from 'lucide-react'
import { cn } from '../../lib/cn.ts'
import { useI18nStore } from './i18n.store.ts'
import { languageLabels, translations } from './translations.ts'

type LanguageToggleProps = {
  className?: string
  variant?: 'floating' | 'inline'
}

export function LanguageToggle({ className, variant = 'inline' }: LanguageToggleProps) {
  const language = useI18nStore((state) => state.language)
  const toggleLanguage = useI18nStore((state) => state.toggleLanguage)
  const t = translations[language]

  return (
    <button
      aria-label={t.language.aria}
      className={cn('language-toggle', variant === 'floating' && 'language-toggle-floating', className)}
      title={t.language.current}
      type="button"
      onClick={toggleLanguage}
    >
      <Languages size={16} />
      <span className={cn(language === 'ru' && 'language-toggle-active')}>{languageLabels.ru}</span>
      <i aria-hidden="true" />
      <span className={cn(language === 'en' && 'language-toggle-active')}>{languageLabels.en}</span>
    </button>
  )
}
