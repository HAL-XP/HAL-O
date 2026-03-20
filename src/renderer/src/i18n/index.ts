import { createContext, useContext } from 'react'
import type { LanguageCode, Translations } from './types'
import { en } from './en'
import { fr } from './fr'
import { es } from './es'
import { de } from './de'
import { pt } from './pt'
import { it } from './it'
import { nl } from './nl'
import { pl } from './pl'
import { ru } from './ru'
import { tr } from './tr'
import { ar } from './ar'
import { hi } from './hi'
import { ja } from './ja'
import { zh } from './zh'
import { ko } from './ko'
import { vi } from './vi'

const ALL_TRANSLATIONS: Record<LanguageCode, Translations> = { en, fr, es, de, pt, it, nl, pl, ru, tr, ar, hi, ja, zh, ko, vi }

export type TFunction = (key: string, params?: Record<string, string | number>) => string

export interface I18nContextValue {
  lang: LanguageCode
  setLang: (lang: LanguageCode) => void
  t: TFunction
}

function createT(lang: LanguageCode): TFunction {
  return (key: string, params?: Record<string, string | number>): string => {
    let text = ALL_TRANSLATIONS[lang]?.[key] ?? ALL_TRANSLATIONS.en[key] ?? key
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
      }
    }
    return text
  }
}

export const I18nContext = createContext<I18nContextValue>({
  lang: 'en',
  setLang: () => {},
  t: createT('en'),
})

export function useI18n(): I18nContextValue {
  return useContext(I18nContext)
}

export { createT }
