// The shapes of the dictionary's data, all in one place, so every script
// agrees on what a "row" or a "word file" looks like. TypeScript uses these
// to catch a typo or a missing field while a script is being written, before
// it ever runs. There's no command to run this file by itself — the other
// scripts import from it.
export interface Example {
  english: string
  traditional: string
  jyutping: string
}

export interface Row {
  id: string
  partOfSpeech: string
  meaning: string
  traditional: string
  jyutping: string
  register?: string
  note: string
  example?: Example
}

export interface WordFile {
  term: string
  rows: Row[]
}

/** One Cantonese word page's example sentence; the same shape as a row's `example`. */
export type PageExample = Example

/** One group of English words that share a meaning and a reading, shown as one box on a page. */
export interface Box {
  jyutping: string
  english: string[]
  meaning: string
  examples: PageExample[]
  note?: string
  register?: string
}

/** A Cantonese word page: cantonese/<traditional>_<partOfSpeech>.json. */
export interface PageFile {
  id: string
  traditional: string
  partOfSpeech: string
  boxes: Box[]
}

/** The link lookup (pages-by-id.json): every English row id and every page id, mapped to a page id. */
export type PageLookup = Record<string, string>

export interface FrequencyFile {
  rows: Record<string, { meaningShare: number; share: number }>
  words: Record<string, number>
}

export type AliasesFile = Record<string, string[]>

export const ID_PATTERN = /^[a-z0-9]{8}$/

// Windows device names: Git for Windows refuses to check out a file whose
// base name (case-insensitively) is one of these, so such words are stored
// with a trailing "_" before the extension (words/c/con_.json).
const RESERVED_WINDOWS_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/** Where a word's file lives, relative to the repo root. */
export function wordPath(term: string): string {
  const suffix = RESERVED_WINDOWS_NAME.test(term) ? '_' : ''
  return `words/${term[0].toLowerCase()}/${term}${suffix}.json`
}

/** Where a Cantonese page's file lives, relative to the repo root. */
export function pagePath(traditional: string, partOfSpeech: string): string {
  return `cantonese/${traditional}_${partOfSpeech}.json`
}

// Characters no file name may hold on Windows (and "/" on any system).
const FORBIDDEN_IN_FILE_NAME = new Set('/\\:*?"<>|')

// `endsFileName` is true only for the part of speech: the file name always
// continues with `_<partOfSpeech>.json`, so only the part of speech can end it.
function textProblem(label: string, text: string, endsFileName: boolean): string | null {
  const s = label === 'characters' ? '' : 's'
  for (const char of text) {
    if (char === '/')
      return `${label} "${text}" contain${s} "/", which cannot appear in a file name; write "／" (U+FF0F, fullwidth slash) instead`
    if (FORBIDDEN_IN_FILE_NAME.has(char))
      return `${label} "${text}" contain${s} "${char}", which cannot appear in a file name`
    if (/\p{Cc}/u.test(char))
      return `${label} "${text}" contain${s} a control character, which cannot appear in a file name`
  }
  const last = text.at(-1)
  if (endsFileName && (last === '.' || last === ' '))
    return `${label} "${text}" end${s} with "${last}", which cannot end a file name`
  return null
}

/** Null when a page's characters and part of speech can make a file name; otherwise a message naming what cannot. */
export function pageNameProblem(traditional: string, partOfSpeech: string): string | null {
  return textProblem('characters', traditional, false) ?? textProblem('part of speech', partOfSpeech, true)
}
