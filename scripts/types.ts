// The shapes of the dictionary's data, all in one place, so every script
// agrees on what a "row" or a "word file" looks like. TypeScript uses these
// to catch a typo or a missing field while a script is being written, before
// it ever runs. There's no command to run this file by itself — the other
// scripts import from it.
export interface Example {
  /** A page sentence's permanent name, unique on its page (page.schema.json requires it). Legacy word rows have none. */
  id?: string
  english: string
  traditional: string
  jyutping: string
  /** Where a page sentence came from (page.schema.json requires it). Legacy word rows have none. */
  source?: SentenceSource
}

/** Who wrote a sentence (`by`), or the corpus line it was copied from, with who wrote its English when that is not the corpus's. */
export type SentenceSource = { by: string } | { corpus: string; line: string; englishBy?: string }

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

/**
 * One English word on a page, with its own meaning. `exampleSentences` are the sentences shown with
 * this word (always present, possibly empty). An entry with an `id` is the page's copy of that
 * row in words/ (and `meaning`, `note` and `register` repeat the row's); an
 * entry without an `id` is one an editor added.
 */
export interface EnglishEntry {
  /** Null when English has no word for it (a sentence-final particle like 啊); `meaning` then says what it does. */
  word: string | null
  id?: string
  meaning: string
  note?: string
  register?: string
  exampleSentences: Example[]
}

/**
 * A Cantonese word page: cantonese/<traditional>_<partOfSpeech>_<id>.json (or <traditional>_<id>.json with no English
 * word). It has one reading and one sense; a second
 * sense of the same word is a second page file. The page has no meaning, note or register of its own: each English
 * entry carries its own.
 */
export interface PageFile {
  id: string
  traditional: string
  /** The English word's type; null exactly when no entry has an English word. */
  partOfSpeech: string | null
  jyutping: string
  english: EnglishEntry[]
  /** What kind of word it is in Cantonese ("time word"); `partOfSpeech` is the English word's. */
  cantonesePartOfSpeech?: string
  /** Other spellings of the word, none equal to `traditional`. */
  variants?: string[]
}

/** The link lookup (pages-by-id.json): every English row id and every page id, mapped to a page id. */
export type PageLookup = Record<string, string>

export interface FrequencyFile {
  rows: Record<string, { meaningShare: number; share: number; order: number }>
  words: Record<string, number>
}

export type AliasesFile = Record<string, string[]>

/** One hand-picked Wikimedia Commons photo: the file's page id (https://commons.wikimedia.org/?curid=<commons>), its license and its author. */
export interface CommonsPhoto {
  commons: number
  author?: string
  license: string
}

/**
 * One Pexels photo (https://www.pexels.com/photo/<pexels>/), under the Pexels License: its id, its
 * file name on https://images.pexels.com/photos/<pexels>/ and its photographer.
 */
export interface PexelsPhoto {
  pexels: number
  file: string
  author: string
}

export type PicturePhoto = CommonsPhoto | PexelsPhoto

/** pictures.json: a page id → that page's photos, in display order. */
export type PicturesFile = Record<string, PicturePhoto[]>

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

/** Where a Cantonese page's file lives, relative to the repo root. A page with no English type leaves it out (啊_<id>.json). */
export function pagePath(traditional: string, partOfSpeech: string | null, id: string): string {
  return partOfSpeech === null
    ? `cantonese/${traditional}_${id}.json`
    : `cantonese/${traditional}_${partOfSpeech}_${id}.json`
}

// Characters no file name may hold on Windows (and "/" on any system).
const FORBIDDEN_IN_FILE_NAME = new Set('/\\:*?"<>|')

// Neither part can end the file name: it always continues with
// `_<partOfSpeech>_<id>.json` after the characters and `_<id>.json` after the
// part of speech, so a trailing "." or " " is fine in both.
function textProblem(label: string, text: string): string | null {
  const s = label === 'characters' ? '' : 's'
  for (const char of text) {
    if (char === '/')
      return `${label} "${text}" contain${s} "/", which cannot appear in a file name; write "／" (U+FF0F, fullwidth slash) instead`
    if (FORBIDDEN_IN_FILE_NAME.has(char))
      return `${label} "${text}" contain${s} "${char}", which cannot appear in a file name`
    if (/\p{Cc}/u.test(char))
      return `${label} "${text}" contain${s} a control character, which cannot appear in a file name`
  }
  return null
}

/** Null when a page's characters and part of speech can make a file name; otherwise a message naming what cannot. */
export function pageNameProblem(traditional: string, partOfSpeech: string | null): string | null {
  return (
    textProblem('characters', traditional) ??
    (partOfSpeech === null ? null : textProblem('part of speech', partOfSpeech))
  )
}
