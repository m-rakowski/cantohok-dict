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
// - Every Cantonese page file (cantonese/<traditional>_<partOfSpeech>_<id>.json)
//   must be valid JSON and match schema/page.schema.json: at least one box,
//   every box with at least one English word, and no id on a box.
// - A page file's name must match its "traditional", "partOfSpeech" and "id"
//   (cantonese/的士_noun_abcd1234.json); characters that cannot appear in a file name are reported
//   instead of being turned into a path.
// - Page files live directly in cantonese/ (a file in a subfolder is
//   refused), and no two page paths may differ only in letter case, because
//   macOS and Windows would treat them as one file.
// - No two pages may share an "id", and no page id may equal an English
//   row's id.
// - A page has one reading, in its "jyutping", compared exactly as stored.
//   Two pages may not have the same characters, part of speech and reading;
//   they would be the same page twice.
// - pages-by-id.json (the link lookup) is required once any page file
//   exists, and must match schema/pages-by-id.schema.json. Every English row
//   id must have an entry; every value must be an existing page id; every
//   page id must map to itself.
// - The note and example rules below also apply inside a page's boxes (a
//   note is judged against all of the box's English words; an English
//   entry's own note is judged against that entry's word and meaning).
// - A box lists its English words as entries ({ "word": ..., and optionally
//   "id", "meaning", "note", "register" }). No two entries may share an "id",
//   no entry id may equal a page id, and every entry id must be a key in
//   pages-by-id.json that maps to the page holding the entry.
// - While any word file exists, entries and rows in words/ are kept exact:
//   every row id must be the id of exactly one entry, every entry id must be
//   a row id, and an entry's word, meaning, note and register must equal its
//   row's term, meaning, note and register (both absent counts as equal),
//   and its page's partOfSpeech, jyutping and traditional must equal the
//   row's (a "/" in the row's part of speech or characters is read as "／"),
//   and the row's example must be the box example at the entry's position in
//   the box's English list (both absent counts as equal).
// - A row's "order" in frequency.json must be its index in its word file.
// - frequency.json and aliases.json must exist.
// - Every row's id must have a matching entry in frequency.json's "rows",
//   and every id listed there must belong to a real row. Each of those
//   entries carries an "order": the row's position in its word file.
// - Every word's term must have a rank in frequency.json's "words", and
//   every term listed there must belong to a real word file.
// - Every term used as a key in aliases.json must belong to a real word file.
// - Rows in the same word's file that share the same partOfSpeech and
//   meaning (so, the same sense of the word) must all list the same
//   meaningShare number in frequency.json.
// - A note must read on its own, and an English example must name real
//   people and things rather than placeholder letters. Those two rules live
//   in scripts/shown-text.ts, which has no imports so the generator can load
//   the very same file.
//
// The shape of each file on its own — which fields are required, that text
// fields can't be empty, that an id is 8 lowercase letters/digits, and so on
// — is checked separately, against the rules in schema/ (word.schema.json,
// page.schema.json, pages-by-id.schema.json, frequency.schema.json, aliases.schema.json). This file loads those schemas
// and reports whatever they flag, on top of the checks above that only make
// sense by comparing files to each other.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Ajv2020 } from 'ajv/dist/2020.js'
import type { ErrorObject, ValidateFunction } from 'ajv'
import { listPageFiles, listWordFiles } from './repo.ts'
import { noteProblems, placeholderLetters } from './shown-text.ts'
import {
  ID_PATTERN,
  pageNameProblem,
  pagePath,
  wordPath,
  type AliasesFile,
  type Box,
  type EnglishEntry,
  type Example,
  type FrequencyFile,
  type PageFile,
  type PageLookup,
  type WordFile,
} from './types.ts'
import wordSchema from '../schema/word.schema.json' with { type: 'json' }
import pageSchema from '../schema/page.schema.json' with { type: 'json' }
import frequencySchema from '../schema/frequency.schema.json' with { type: 'json' }
import aliasesSchema from '../schema/aliases.schema.json' with { type: 'json' }
import pageLookupSchema from '../schema/pages-by-id.schema.json' with { type: 'json' }

const ajv = new Ajv2020({ allErrors: true })
const validateWord = ajv.compile(wordSchema)
const validatePage = ajv.compile(pageSchema)
const validateFrequency = ajv.compile(frequencySchema)
const validateAliases = ajv.compile(aliasesSchema)
const validatePageLookup = ajv.compile(pageLookupSchema)

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

/**
 * A page file that parsed into an object with string `traditional` and
 * `partOfSpeech` joins the file-name check even when it fails the schema, so
 * one bad field is one message. `id` is null unless the file parsed and holds
 * a non-empty string `id`; `valid` is true only when the whole file passed
 * the schema. A file that is not JSON is kept (so the lookup knows a page
 * exists) with `id` null.
 */
interface CheckedPage {
  path: string
  id: string | null
  file: PageFile | null
  valid: boolean
  /** The ids of its English entries, read even when the page fails the schema; null when the file is not JSON. */
  entryIds: string[] | null
}

/** Ids of English entries in a parsed page, ignoring anything of the wrong shape (the schema reports those). */
function rawEntryIds(json: unknown): string[] {
  if (!isObject(json) || !Array.isArray(json.boxes)) return []
  const ids: string[] = []
  for (const box of json.boxes)
    if (isObject(box) && Array.isArray(box.english))
      for (const entry of box.english)
        if (isObject(entry) && typeof entry.id === 'string' && ID_PATTERN.test(entry.id)) ids.push(entry.id)
  return ids
}

/**
 * One message per page path that differs only in letter case from an earlier
 * one (macOS and Windows would treat them as one file). A page that already
 * failed the file-name rule (`nameOk` false) is left out, so one wrong name is
 * one message.
 */
export function casePathDuplicates(pages: { path: string; nameOk: boolean }[]): string[] {
  const messages: string[] = []
  const byLowerPath = new Map<string, string>()
  for (const { path, nameOk } of pages) {
    if (!nameOk) continue
    const other = byLowerPath.get(path.toLowerCase())
    if (other) messages.push(`${path}: duplicates ${other} when letter case is ignored`)
    else byLowerPath.set(path.toLowerCase(), path)
  }
  return messages
}

function checkPages(root: string, errors: string[]): CheckedPage[] {
  const pages: CheckedPage[] = []
  const names: { path: string; nameOk: boolean }[] = []
  for (const path of listPageFiles(root)) {
    if (path.split('/').length > 2) {
      errors.push(`${path}: page files live directly in cantonese/`)
      continue
    }
    const json = parseJson(root, path, errors)
    if (json === INVALID) {
      pages.push({ path, id: null, file: null, valid: false, entryIds: null })
      continue
    }
    const valid = runSchema(path, json, validatePage, errors)
    let nameOk = true
    // An id of the wrong shape is already reported by the schema and cannot
    // be a key in the lookup, so it counts as no usable id.
    const id = isObject(json) && isFilled(json.id) && ID_PATTERN.test(json.id) ? json.id : null
    if (isObject(json) && isFilled(json.traditional) && isFilled(json.partOfSpeech)) {
      const { traditional, partOfSpeech } = json
      const problem = pageNameProblem(traditional, partOfSpeech)
      if (problem) errors.push(`${path}: ${problem}`)
      else if (id !== null && pagePath(traditional, partOfSpeech, id) !== path)
        errors.push(
          `${path}: file name does not match ${traditional} ${partOfSpeech} ${id} (expected ${pagePath(traditional, partOfSpeech, id)})`,
        )
      nameOk = !problem && id !== null && pagePath(traditional, partOfSpeech, id) === path
    }
    names.push({ path, nameOk })
    pages.push({ path, id, file: valid ? (json as unknown as PageFile) : null, valid, entryIds: rawEntryIds(json) })
  }
  errors.push(...casePathDuplicates(names))
  return pages
}

/**
 * No two pages are the same word, part of speech and reading. Only pages that passed the schema are judged. Readings are
 * compared exactly as stored.
 */
function checkPageReadings(pages: CheckedPage[], errors: string[]): void {
  const firstPath = new Map<string, string>()
  for (const { path, file } of pages) {
    if (!file) continue
    const key = JSON.stringify([file.traditional, file.partOfSpeech, file.jyutping])
    const earlier = firstPath.get(key)
    if (earlier)
      errors.push(
        `${path}: same word, part of speech and reading (${file.traditional} ${file.partOfSpeech} ${file.jyutping}) as ${earlier}`,
      )
    else firstPath.set(key, path)
  }
}

/** No two pages share an id, no page id equals an English row id, and English entry ids are unique and are not page ids. Pages without a usable id are skipped. */
function checkPageIds(pages: CheckedPage[], words: CheckedWord[], errors: string[]): void {
  const rowPath = new Map<string, string>()
  for (const { path, rowIds } of words) for (const id of rowIds) rowPath.set(id, path)
  const idPath = new Map<string, string>()
  for (const { path, id } of pages) {
    if (id === null) continue
    const previous = idPath.get(id)
    if (previous) errors.push(`duplicate page id "${id}" in ${previous} and ${path}`)
    else idPath.set(id, path)
    const row = rowPath.get(id)
    if (row) errors.push(`${path}: page id "${id}" is also an English row id (${row})`)
  }
  const entryPath = new Map<string, string>()
  for (const { path, entryIds } of pages)
    for (const id of entryIds ?? []) {
      const previous = entryPath.get(id)
      if (previous) errors.push(`duplicate English entry id "${id}" in ${previous} and ${path}`)
      else entryPath.set(id, path)
      if (idPath.has(id)) errors.push(`${path}: English entry id "${id}" is also a page id`)
    }
}

/**
 * pages-by-id.json is required only once a page file exists. A page without a
 * usable id (broken JSON, or no id) is already reported, and its id cannot be
 * known, so while one exists the "points at a non-page" rule stays quiet
 * rather than echo the same page as a lookup error.
 */
function checkPageLookup(
  root: string,
  pages: CheckedPage[],
  words: CheckedWord[],
  errors: string[],
): PageLookup | null {
  if (pages.length === 0) return null
  const lookup = readTopLevelFile(root, 'pages-by-id.json', validatePageLookup, errors) as PageLookup | null
  if (!lookup) return null
  const pageIds = new Set(pages.flatMap(({ id }) => (id === null ? [] : [id])))
  const someIdUnknown = pages.some(({ id }) => id === null)
  // A row id that is not 8 lowercase letters/digits is already reported by the
  // word schema, and the lookup's own schema could not hold it as a key.
  for (const { path, rowIds } of words)
    for (const id of rowIds)
      if (ID_PATTERN.test(id) && !Object.hasOwn(lookup, id))
        errors.push(`pages-by-id.json: row "${id}" (${path}) has no page`)
  if (!someIdUnknown)
    for (const [key, value] of Object.entries(lookup))
      if (!pageIds.has(value)) errors.push(`pages-by-id.json: "${key}" points at "${value}", which is not a page id`)
  for (const { path, id } of pages)
    if (id !== null && lookup[id] !== id) errors.push(`pages-by-id.json: page "${id}" (${path}) does not map to itself`)
  for (const { path, id, entryIds } of pages)
    for (const entryId of entryIds ?? []) {
      if (!Object.hasOwn(lookup, entryId))
        errors.push(`pages-by-id.json: English entry "${entryId}" (${path}) has no entry`)
      else if (id !== null && lookup[entryId] !== id)
        errors.push(
          `pages-by-id.json: English entry "${entryId}" (${path}) maps to "${lookup[entryId]}", not to its page "${id}"`,
        )
    }
  return lookup
}

/** The row's text as a page shows it: a page cannot hold "/" in its characters or part of speech (they are in its file name), so "／" stands in. The reading is not in the file name and is copied as it is. */
const pageForm = (text: string): string => text.replaceAll('/', '／')

interface RowMatch {
  path: string
  term: string
  row: WordFile['rows'][number]
}

/** One message per field where an entry (or its page) differs from the row with its id; empty when they are exact copies. */
function entryDifferences(
  path: string,
  page: PageFile,
  box: Box,
  entry: EnglishEntry,
  { path: rowPath, term, row }: RowMatch,
): string[] {
  // [field, value on the page side, value as the row shows it, value the page should hold]
  const fields: [string, string | undefined, string | undefined, string | undefined][] = [
    ['word', entry.word, term, term],
    ['meaning', entry.meaning, row.meaning, row.meaning],
    ['note', entry.note, row.note, row.note],
    ['register', entry.register, row.register, row.register],
    ['partOfSpeech', page.partOfSpeech, row.partOfSpeech, pageForm(row.partOfSpeech)],
    ['jyutping', page.jyutping, row.jyutping, row.jyutping],
    ['traditional', page.traditional, row.traditional, pageForm(row.traditional)],
  ]
  const messages = fields
    .filter(([, onPage, , expected]) => (onPage ?? '') !== (expected ?? ''))
    .map(
      ([field, onPage, shown]) =>
        `${path}: English entry "${entry.id}" ${field} "${onPage ?? ''}" differs from ${rowPath} ("${shown ?? ''}")`,
    )
  const problem = exampleProblem(row.example, box.examples[box.english.indexOf(entry)], box.english.indexOf(entry) + 1)
  if (problem) messages.push(`${path}: English entry "${entry.id}" example differs from ${rowPath} (${problem})`)
  return messages
}

/** Null when the row's example and the box example at the entry's position are the same (or both absent); otherwise what differs. */
function exampleProblem(row: Example | undefined, onPage: Example | undefined, position: number): string | null {
  if (!row && !onPage) return null
  if (!row) return `the row has no example but example ${position} of the box is "${onPage?.english}"`
  if (!onPage) return `the row has an example but the box has no example ${position}`
  const differing = (['english', 'traditional', 'jyutping'] as const).filter(field => row[field] !== onPage[field])
  return differing.length ? `example ${position} of the box differs in ${differing.join(', ')}` : null
}

/**
 * While any word file exists, English entries and rows in words/ are copies of
 * each other, matched by row id. A row on no entry is reported against its
 * file, an entry that is no row against its page, and a matched pair once per
 * differing field, plus once when the row's example is not the box example at
 * the entry's position in `english` (both absent counts as equal). Pages that
 * failed the schema still count for their entry ids, and a page that is not
 * JSON hides only the rows the lookup sends to it, so one broken page is not a
 * cascade of "on no entry"; likewise a word file that is not JSON hides its row ids, so "is not a row"
 * waits until every word file has been read.
 */
function checkEntriesMatchRows(
  pages: CheckedPage[],
  words: CheckedWord[],
  lookup: PageLookup | null,
  everyWordFileRead: boolean,
  errors: string[],
): void {
  if (words.length === 0) return
  const rowIds = new Set(words.flatMap(word => word.rowIds))
  const entryIds = new Set(pages.flatMap(page => page.entryIds ?? []))
  // A page that is not JSON hides its entries, so a row it shows would look
  // unplaced. Its id is in its file name; a row whose lookup target is such a
  // page is skipped (one broken page hides only its own rows). With no usable
  // lookup the target is unknown, so every row is skipped while one page is broken.
  const unreadable = pages.filter(page => page.entryIds === null)
  const unreadableIds = new Set(unreadable.map(page => /_([a-z0-9]{8})\.json$/.exec(page.path)?.[1]))
  for (const { path, rowIds: ids } of words)
    for (const id of ids) {
      if (!ID_PATTERN.test(id) || entryIds.has(id)) continue
      const hidden = lookup ? unreadableIds.has(lookup[id]) : unreadable.length > 0
      if (!hidden) errors.push(`${path}: row "${id}" is on no page entry`)
    }
  const rows = new Map<string, RowMatch>()
  for (const { path, term, file } of words) for (const row of file?.rows ?? []) rows.set(row.id, { path, term, row })
  for (const { path, file } of pages) {
    if (!file) continue
    for (const box of file.boxes)
      for (const entry of box.english) {
        if (entry.id === undefined) continue
        const match = rows.get(entry.id)
        if (match) errors.push(...entryDifferences(path, file, box, entry, match))
        else if (everyWordFileRead && !rowIds.has(entry.id))
          errors.push(`${path}: English entry "${entry.id}" is not a row in words/`)
      }
  }
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

/** A row's `order` in frequency.json is its index in its word file. Only word files that passed the schema are judged, and an id used by two rows is left to the duplicate-id message. */
function checkFrequencyOrder(words: CheckedWord[], frequency: FrequencyFile | null, errors: string[]): void {
  if (!frequency) return
  const seen = new Set<string>()
  const repeated = new Set<string>()
  for (const { rowIds } of words) for (const id of rowIds) (seen.has(id) ? repeated : seen).add(id)
  for (const { path, file } of words)
    file?.rows.forEach((row, index) => {
      if (repeated.has(row.id)) return
      const entry = frequency.rows[row.id]
      if (entry && entry.order !== index)
        errors.push(`frequency.json: row "${row.id}" order ${entry.order} but it is row ${index} of ${path}`)
    })
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

function checkShownText(words: CheckedWord[], errors: string[]): void {
  for (const { path, term, valid, file } of words) {
    if (!valid || !file) continue
    for (const row of file.rows) {
      for (const problem of noteProblems(row.note, term, row.meaning))
        errors.push(`${path}: row "${row.id}" ${problem}`)
      const letters = row.example ? placeholderLetters(row.example.english) : []
      if (letters.length)
        errors.push(`${path}: row "${row.id}" example.english has a placeholder letter (${letters.join(', ')})`)
    }
  }
}

function checkPageShownText(pages: CheckedPage[], errors: string[]): void {
  for (const { path, valid, file } of pages) {
    if (!valid || !file) continue
    file.boxes.forEach((box, boxIndex) => {
      const where = `${path}: box ${boxIndex + 1}`
      if (box.note !== undefined)
        for (const problem of noteProblems(box.note, box.english.map(entry => entry.word).join(' '), box.meaning))
          errors.push(`${where} ${problem}`)
      for (const entry of box.english)
        if (entry.note !== undefined)
          for (const problem of noteProblems(entry.note, entry.word, entry.meaning ?? box.meaning))
            errors.push(`${where} English entry "${entry.word}" ${problem}`)
      box.examples.forEach((example, exampleIndex) => {
        const letters = placeholderLetters(example.english)
        if (letters.length)
          errors.push(`${where} example ${exampleIndex + 1} english has a placeholder letter (${letters.join(', ')})`)
      })
    })
  }
}

/** Runs every check in this file against the repo at `root` and returns the list of error messages (empty means the repo is clean). */
export function checkRepo(root: string): string[] {
  const errors: string[] = []
  const words = checkWords(root, errors)
  checkDuplicateIds(words, errors)
  const pages = checkPages(root, errors)
  checkPageIds(pages, words, errors)
  checkPageReadings(pages, errors)
  const lookup = checkPageLookup(root, pages, words, errors)
  checkEntriesMatchRows(pages, words, lookup, words.length === listWordFiles(root).length, errors)
  const beforeFrequency = errors.length
  const frequency = checkFrequency(root, words, errors)
  const frequencyClean = errors.length === beforeFrequency
  checkFrequencyOrder(words, frequency, errors)
  checkAliases(root, words, errors)
  // meaningShare compares rows via the ids frequency.json maps them by, so it
  // only runs once that map is known complete (no missing/orphaned entries) —
  // otherwise a row whose id has no frequency.json entry, or a duplicate id
  // that resolves to the wrong entry, would report an incidental, misleading
  // mismatch on top of the real problem already reported above.
  checkMeaningShare(words, frequencyClean ? frequency : null, errors)
  checkShownText(words, errors)
  checkPageShownText(pages, errors)
  return errors
}

if (import.meta.main) {
  const errors = checkRepo(process.cwd())
  for (const error of errors) console.error(error)
  console.log(errors.length ? `${errors.length} problem(s)` : 'OK')
  process.exit(errors.length ? 1 : 0)
}
