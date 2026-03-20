export type LanguageCode = 'en' | 'fr' | 'es' | 'de' | 'pt' | 'ja' | 'zh' | 'ko' | 'it' | 'ru' | 'tr' | 'pl' | 'nl' | 'ar' | 'hi' | 'vi'

export interface LanguageInfo {
  code: LanguageCode
  label: string       // native name
  shortLabel: string   // 2-letter display code
}

export const LANGUAGES: LanguageInfo[] = [
  { code: 'en', label: 'English', shortLabel: 'EN' },
  { code: 'fr', label: 'Fran\u00e7ais', shortLabel: 'FR' },
  { code: 'es', label: 'Espa\u00f1ol', shortLabel: 'ES' },
  { code: 'de', label: 'Deutsch', shortLabel: 'DE' },
  { code: 'pt', label: 'Portugu\u00eas', shortLabel: 'PT' },
  { code: 'it', label: 'Italiano', shortLabel: 'IT' },
  { code: 'nl', label: 'Nederlands', shortLabel: 'NL' },
  { code: 'pl', label: 'Polski', shortLabel: 'PL' },
  { code: 'ru', label: '\u0420\u0443\u0441\u0441\u043a\u0438\u0439', shortLabel: 'RU' },
  { code: 'tr', label: 'T\u00fcrk\u00e7e', shortLabel: 'TR' },
  { code: 'ar', label: '\u0627\u0644\u0639\u0631\u0628\u064a\u0629', shortLabel: 'AR' },
  { code: 'hi', label: '\u0939\u093f\u0928\u094d\u0926\u0940', shortLabel: 'HI' },
  { code: 'ja', label: '\u65e5\u672c\u8a9e', shortLabel: 'JA' },
  { code: 'zh', label: '\u4e2d\u6587', shortLabel: 'ZH' },
  { code: 'ko', label: '\ud55c\uad6d\uc5b4', shortLabel: 'KO' },
  { code: 'vi', label: 'Ti\u1ebfng Vi\u1ec7t', shortLabel: 'VI' },
]

// All translatable keys in the app
export interface Translations {
  [key: string]: string
}
