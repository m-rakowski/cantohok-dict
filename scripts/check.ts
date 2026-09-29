// This script is the dictionary's gatekeeper. It reads every file in the
// repo and reports anything wrong with it, so a mistake gets caught before
// it is merged rather than after someone downloads a broken dictionary. Run
// it with `pnpm run check` (which also runs Prettier's own formatting check
// first).
//
// Rules enforced here, in plain words:
// - Every word file (words/<letter>/<word>.json) must be valid JSON.
// - A word file's name must match its "term" (words/c/cab.json for "cab"),
//   including the underscore trick for words that are reserved names on
//   Windows (like "con" -> con_.json).
// - No two words may have the same term, even if the capitalization differs.
// - No two rows, anywhere in the dictionary, may share the same "id".
// - frequency.json and aliases.json must exist.
// - Every row's id must have a matching entry in frequency.json's "rows",
//   and every id listed there must belong to a real row.
// - Every word's term must have a rank in frequency.json's "words", and
//   every term listed there must belong to a real word file.
// - Every term used as a key in aliases.json must belong to a real word file.
// - Rows in the same word's file that share the same partOfSpeech and
//   meaning (so, the same sense of the word) must all list the same
//   meaningShare number in frequency.json.
// - A note must read on its own. It must not point at the generator's
//   numbered senses ("sense 2", "the second sense"), which a learner never
//   sees, and it may say "slice" only on a row whose own term or meaning is
//   about slices; anywhere else "slice" was generator talk for "part of a
//   meaning" ("the colloquial slice").
// - An English example must name real people and things, not a placeholder
//   letter ("please A"). A capital letter on its own is allowed only as "I",
//   or as the article "A" starting a sentence ("A dog barked."). A letter
//   joined to another letter or digit ("Q&A", "T-shirt", "U.S.", "X-ray") is
//   part of a word, not on its own.
//
// The shape of each file on its own — which fields are required, that text
// fields can't be empty, that an id is 8 lowercase letters/digits, and so on
// — is checked separately, against the rules in schema/ (word.schema.json,
// frequency.schema.json, aliases.schema.json). This file loads those schemas
// and reports whatever they flag, on top of the checks above that only make
// sense by comparing files to each other.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Ajv2020 } from 'ajv/dist/2020.js'
import type { ErrorObject, ValidateFunction } from 'ajv'
import { listWordFiles } from './repo.ts'
import { wordPath, type AliasesFile, type FrequencyFile, type WordFile } from './types.ts'
import wordSchema from '../schema/word.schema.json' with { type: 'json' }
import frequencySchema from '../schema/frequency.schema.json' with { type: 'json' }
import aliasesSchema from '../schema/aliases.schema.json' with { type: 'json' }

const ajv = new Ajv2020({ allErrors: true })
const validateWord = ajv.compile(wordSchema)
const validateFrequency = ajv.compile(frequencySchema)
const validateAliases = ajv.compile(aliasesSchema)

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isFilled = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''

/** Formats one Ajv error the way every schema failure is reported: `<path>: <instancePath or "(root)"> <message>`, plus the offending field name for `additionalProperties`. */
function formatSchemaError(path: string, error: ErrorObject): string {
  const where = error.instancePath === '' ? '(root)' : error.instancePath
  const extra =
    error.keyword === 'additionalProperties'
      ? ` "${(error.params as { additionalProperty: string }).additionalProperty}"`
      : ''
  return `${path}: ${where} ${error.message}${extra}`
}

function runSchema(path: string, json: unknown, validate: ValidateFunction, errors: string[]): boolean {
  if (validate(json)) return true
  for (const error of validate.errors ?? []) errors.push(formatSchemaError(path, error))
  return false
}

const INVALID = Symbol('invalid JSON')

/** Parses `path`'s JSON, pushing `<path>: invalid JSON` and returning `INVALID` on failure. */
function parseJson(root: string, path: string, errors: string[]): unknown | typeof INVALID {
  const text = readFileSync(join(root, path), 'utf8')
  try {
    return JSON.parse(text)
  } catch {
    errors.push(`${path}: invalid JSON`)
    return INVALID
  }
}

/**
 * A word file that parsed into an object with a string `term` and an array
 * `rows` joins the cross-file checks below (file name, duplicate term, and —
 * via the ids collected from `rows` — the frequency.json id checks) even when
 * a row fails the schema, so one bad field is one message rather than a
 * cascade of "no entry"/"in no word file" errors. `valid` is true only when
 * the whole file passed the schema; only then does it join the meaningShare
 * check, which reads fields the schema guarantees are present.
 */
interface CheckedWord {
  path: string
  term: string
  rowIds: string[]
  file: WordFile | null
  valid: boolean
}

function checkWords(root: string, errors: string[]): CheckedWord[] {
  const words: CheckedWord[] = []
  const byLowerTerm = new Map<string, string>()
  for (const path of listWordFiles(root)) {
    const json = parseJson(root, path, errors)
    if (json === INVALID) continue
    const valid = runSchema(path, json, validateWord, errors)
    const hasBasicShape = isObject(json) && isFilled(json.term) && Array.isArray(json.rows)
    if (!hasBasicShape) continue
    const term = (json as { term: string }).term
    const rows = (json as { rows: unknown[] }).rows
    const rowIds = rows.filter(row => isObject(row) && isFilled(row.id)).map(row => (row as { id: string }).id)
    if (wordPath(term) !== path)
      errors.push(`${path}: file name does not match term "${term}" (expected ${wordPath(term)})`)
    const lower = term.toLowerCase()
    const other = byLowerTerm.get(lower)
    if (other) errors.push(`${path}: term "${term}" duplicates ${other}`)
    else byLowerTerm.set(lower, path)
    words.push({ path, term, rowIds, file: valid ? (json as unknown as WordFile) : null, valid })
  }
  return words
}

function checkDuplicateIds(words: CheckedWord[], errors: string[]): void {
  const idPath = new Map<string, string>()
  for (const { path, rowIds } of words) {
    for (const id of rowIds) {
      const previous = idPath.get(id)
      if (previous) errors.push(`duplicate id "${id}" in ${previous} and ${path}`)
      else idPath.set(id, path)
    }
  }
}

function readTopLevelFile(root: string, path: string, validate: ValidateFunction, errors: string[]): unknown | null {
  if (!existsSync(join(root, path))) {
    errors.push(`${path}: missing`)
    return null
  }
  const json = parseJson(root, path, errors)
  if (json === INVALID) return null
  return runSchema(path, json, validate, errors) ? json : null
}

function checkFrequency(root: string, words: CheckedWord[], errors: string[]): FrequencyFile | null {
  const json = readTopLevelFile(root, 'frequency.json', validateFrequency, errors) as FrequencyFile | null
  if (!json) return null

  const idPath = new Map<string, string>()
  for (const { path, rowIds } of words) for (const id of rowIds) idPath.set(id, path)
  for (const { path, rowIds } of words) {
    for (const id of rowIds)
      if (!Object.hasOwn(json.rows, id)) errors.push(`frequency.json: no entry for id "${id}" (${path})`)
  }
  for (const id of Object.keys(json.rows))
    if (!idPath.has(id)) errors.push(`frequency.json: id "${id}" is in no word file`)

  const termPath = new Map(words.map(({ term, path }) => [term, path]))
  for (const { term, path } of words)
    if (!Object.hasOwn(json.words, term)) errors.push(`frequency.json: no rank for "${term}" (${path})`)
  for (const term of Object.keys(json.words))
    if (!termPath.has(term)) errors.push(`frequency.json: "${term}" has no word file`)

  return json
}

function checkAliases(root: string, words: CheckedWord[], errors: string[]): void {
  const json = readTopLevelFile(root, 'aliases.json', validateAliases, errors) as AliasesFile | null
  if (!json) return
  const terms = new Set(words.map(word => word.term))
  for (const term of Object.keys(json)) if (!terms.has(term)) errors.push(`aliases.json: "${term}" has no word file`)
}

function checkMeaningShare(words: CheckedWord[], frequency: FrequencyFile | null, errors: string[]): void {
  if (!frequency) return
  for (const { path, valid, file } of words) {
    if (!valid || !file) continue
    const byMeaning = new Map<string, number[]>()
    for (const row of file.rows) {
      const entry = frequency.rows[row.id]
      if (!entry) continue
      const key = `${row.partOfSpeech} · ${row.meaning}`
      byMeaning.set(key, [...(byMeaning.get(key) ?? []), entry.meaningShare])
    }
    for (const [key, values] of byMeaning) {
      if (new Set(values).size > 1)
        errors.push(`${path}: meaning "${key}" has rows with different meaningShare (${values.join(', ')})`)
    }
  }
}

// "sense 2", "senses 1 and 2", "sense #3", "the second sense". "sixth" is
// left out on purpose: "a sixth sense" is ordinary English.
const SENSE_NUMBER =
  /\bsenses?\s*(?:#\s*)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b|\b(?:first|second|third|fourth|fifth|seventh|eighth|ninth|tenth|\d+(?:st|nd|rd|th))\s+senses?\b/i
const SLICE = /\bslices?\b/i
// A capital letter with no letter or digit touching it, directly or across
// one joining character (&, ., -, ' or ’).
const LONE_CAPITAL = /(?<![\p{L}\p{N}]|[\p{L}\p{N}][&.'’-])\p{Lu}(?![\p{L}\p{N}]|[&.'’-][\p{L}\p{N}])/gu
// Start of the text, or just after a sentence end or an opening quote/bracket.
const SENTENCE_START = /(?:^|[.!?:]\s+|["“‘(]\s*)$/

/** The capital letters in `english` that stand alone, other than "I" and a sentence-initial article "A". */
function loneLetters(english: string): string[] {
  const found: string[] = []
  for (const match of english.matchAll(LONE_CAPITAL)) {
    const letter = match[0]
    if (letter === 'I') continue
    const before = english.slice(0, match.index)
    const after = english.slice(match.index + 1)
    if (letter === 'A' && SENTENCE_START.test(before) && /^ \p{L}/u.test(after)) continue
    found.push(letter)
  }
  return found
}

function checkShownText(words: CheckedWord[], errors: string[]): void {
  for (const { path, term, valid, file } of words) {
    if (!valid || !file) continue
    for (const row of file.rows) {
      const sense = row.note.match(SENSE_NUMBER)
      if (sense) errors.push(`${path}: row "${row.id}" note points at a numbered sense ("${sense[0]}")`)
      if (SLICE.test(row.note) && !SLICE.test(`${term} ${row.meaning}`))
        errors.push(`${path}: row "${row.id}" note says "slice" on a row that is not about slices`)
      const letters = row.example ? loneLetters(row.example.english) : []
      if (letters.length)
        errors.push(`${path}: row "${row.id}" example.english has a placeholder letter (${letters.join(', ')})`)
    }
  }
}

/** Runs every check in this file against the repo at `root` and returns the list of error messages (empty means the repo is clean). */
export function checkRepo(root: string): string[] {
  const errors: string[] = []
  const words = checkWords(root, errors)
  checkDuplicateIds(words, errors)
  const beforeFrequency = errors.length
  const frequency = checkFrequency(root, words, errors)
  const frequencyClean = errors.length === beforeFrequency
  checkAliases(root, words, errors)
  // meaningShare compares rows via the ids frequency.json maps them by, so it
  // only runs once that map is known complete (no missing/orphaned entries) —
  // otherwise a row whose id has no frequency.json entry, or a duplicate id
  // that resolves to the wrong entry, would report an incidental, misleading
  // mismatch on top of the real problem already reported above.
  checkMeaningShare(words, frequencyClean ? frequency : null, errors)
  checkShownText(words, errors)
  return errors
}

if (import.meta.main) {
  const errors = checkRepo(process.cwd())
  for (const error of errors) console.error(error)
  console.log(errors.length ? `${errors.length} problem(s)` : 'OK')
  process.exit(errors.length ? 1 : 0)
}
