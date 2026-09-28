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
