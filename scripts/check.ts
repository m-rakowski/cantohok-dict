// This script is the dictionary's gatekeeper. It reads every file in the
// repo and reports anything wrong with it, so a mistake gets caught before
// it is merged rather than after someone downloads a broken dictionary. Run
// it with `pnpm run check` (which also runs Prettier's own formatting check
// first).
//
// Rules enforced here, in plain words. The word-file rules keep the legacy
// words/ folder (words/README.md) valid; nobody edits it any more.
// - Every word file (words/<letter>/<word>.json) must be valid JSON.
// - A word file's name must match its "term" (words/c/cab.json for "cab"),
//   including the underscore trick for words that are reserved names on
//   Windows (like "con" -> con_.json).
// - No two words may have the same term, even if the capitalization differs.
// - No two rows, anywhere in the dictionary, may share the same "id".
// - Every Cantonese page file (cantonese/<traditional>_<partOfSpeech>_<id>.json)
//   must be valid JSON and match schema/page.schema.json: at least one
//   English word, no "boxes" key, and no meaning, note or register of the
//   page's own (each English entry carries its own).
// - A page's "partOfSpeech" must be one of 13 values: noun, verb, adj
//   (adjective), adv (adverb), prep (preposition), pron (pronoun), det
//   (determiner), conj (conjunction), num (number), name (a proper noun),
//   intj (interjection), phrase, postp (postposition). It is the English word's
//   type, so it is null exactly when no English entry has a word: a word English
//   has no word for (the sentence-final particle 啊) is a page whose entries have
//   "word": null and a "meaning" saying what it does.
// - A page may say what kind of word it is in Cantonese, "cantonesePartOfSpeech",
//   one of the names in the schema (noun, time word, measure word,
//   sentence-final particle...). Its "partOfSpeech" stays the English word's.
// - A page may list other spellings of its word, "variants" (an older corpus
//   spelling, say), each once and none equal to the page's own "traditional".
// - A page file's name must match its "traditional", "partOfSpeech" and "id"
//   (cantonese/的士_noun_abcd1234.json; cantonese/啊_abcd1234.json for a page
//   with no English type); characters that cannot appear in a file name are reported
//   instead of being turned into a path.
// - Page files live directly in cantonese/ (a file in a subfolder is
//   refused), and no two page paths may differ only in letter case, because
//   macOS and Windows would treat them as one file.
// - No two pages may share an "id", and no page id may equal an English
//   row's id.
// - A page has one reading, in its "jyutping", compared exactly as stored, and
//   one sense. Two pages may not have the same characters, part of speech,
//   reading, and English words with the same meanings (in any order); they
//   would be the same page twice. A second sense of the same word is a second
//   page file.
// - pages-by-id.json (the link lookup) is required once any page file
//   exists, and must match schema/pages-by-id.schema.json. Every English row
//   id must have an entry; every value must be an existing page id; every
//   page id must map to itself.
// - The note and example rules below also apply on a page (an English
//   entry's note is judged against that entry's word and meaning).
// - A page lists its English words as entries ({ "word": ..., "meaning": ...,
//   and optionally "id", "note", "register" }). No two entries may share an "id",
//   no entry id may equal a page id, and every entry id must be a key in
//   pages-by-id.json that maps to the page holding the entry.
// - frequency.json and aliases.json must exist.
// - Every row's id must have a matching entry in frequency.json's "rows",
//   and every id listed there must belong to a real row or to an English
//   entry on a page (a page-only word needs no word file). Each of those
//   entries carries an integer "order".
// - Every word's term must have a rank in frequency.json's "words", and
//   every term listed there must be some page entry's word or a legacy word
//   file's term.
// - Every term used as a key in aliases.json must likewise be some page
//   entry's word or a legacy word file's term.
// - pictures.json (hand-picked photos) must exist and match
//   schema/pictures.schema.json: each key is a page id, each value the page's
//   photos in display order. A photo is either a Wikimedia Commons file (its
//   id, its license, one of the free licenses the schema lists, and its author,
//   which every "CC BY" license requires) or a Pexels photo (its id, its file
//   name on images.pexels.com and its photographer). Every key must be a page
//   file's own id (an old id that pages-by-id.json maps to a page is not
//   enough), and no page may list the same photo twice.
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
// page.schema.json, pages-by-id.schema.json, frequency.schema.json, aliases.schema.json, pictures.schema.json). This file loads those schemas
// and reports whatever they flag, on top of the checks above that only make
// sense by comparing files to each other.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Ajv2020 } from 'ajv/dist/2020.js'
import type { ValidateFunction } from 'ajv'
import { checkCorpus } from './corpus.ts'
import { formatSchemaError } from './schema-errors.ts'
import { listPageFiles, listWordFiles } from './repo.ts'
import { noteProblems, placeholderLetters } from './shown-text.ts'
import {
  ID_PATTERN,
  pageNameProblem,
  pagePath,
  wordPath,
  type AliasesFile,
  type FrequencyFile,
  type PageFile,
  type PageLookup,
  type PicturesFile,
  type WordFile,
} from './types.ts'
import wordSchema from '../schema/word.schema.json' with { type: 'json' }
import pageSchema from '../schema/page.schema.json' with { type: 'json' }
import frequencySchema from '../schema/frequency.schema.json' with { type: 'json' }
import aliasesSchema from '../schema/aliases.schema.json' with { type: 'json' }
import pageLookupSchema from '../schema/pages-by-id.schema.json' with { type: 'json' }
import picturesSchema from '../schema/pictures.schema.json' with { type: 'json' }

const ajv = new Ajv2020({ allErrors: true })
const validateWord = ajv.compile(wordSchema)
const validatePage = ajv.compile(pageSchema)
/** The allowed `partOfSpeech` values, read from the page schema so the list lives in one place. */
// The schema's list also holds null (a page with no English word), which is no part of speech.
const ALLOWED_PARTS_OF_SPEECH: readonly string[] = pageSchema.properties.partOfSpeech.enum.filter(
  value => value !== null,
)
const validateFrequency = ajv.compile(frequencySchema)
const validateAliases = ajv.compile(aliasesSchema)
const validatePageLookup = ajv.compile(pageLookupSchema)
const validatePictures = ajv.compile(picturesSchema)

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isFilled = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''

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
  /** The ids of its English entries, read even when the page fails the schema; empty when the file is not JSON. */
  entryIds: string[]
  /** The English words of its entries, read the same way. */
  entryWords: string[]
}

/** English words of entries in a parsed page, ignoring anything of the wrong shape (the schema reports those). */
function rawEntryWords(json: unknown): string[] {
  if (!isObject(json) || !Array.isArray(json.english)) return []
  const words: string[] = []
  for (const entry of json.english) if (isObject(entry) && isFilled(entry.word)) words.push(entry.word)
  return words
}

/** Ids of English entries in a parsed page, ignoring anything of the wrong shape (the schema reports those). */
function rawEntryIds(json: unknown): string[] {
  if (!isObject(json) || !Array.isArray(json.english)) return []
  const ids: string[] = []
  for (const entry of json.english)
    if (isObject(entry) && typeof entry.id === 'string' && ID_PATTERN.test(entry.id)) ids.push(entry.id)
  return ids
}

/**
 * One message per sentence id used a second time anywhere in the repo, naming the page that used it
 * first. Pages that failed the schema are skipped (a missing or malformed id is reported there). Ids
 * are unique across all pages, not just one: a deleted page's id is redirected to another page, so a
 * sentence picked on the old page must never find an unrelated sentence holding the same id there.
 */
function checkSentenceIds(pages: CheckedPage[], errors: string[]): void {
  const firstSeen = new Map<string, string>()
  for (const page of pages) {
    if (!page.file) continue
    for (const entry of page.file.english)
      for (const sentence of entry.exampleSentences) {
        if (sentence.id === undefined) continue
        const earlier = firstSeen.get(sentence.id)
        if (earlier === undefined) firstSeen.set(sentence.id, page.path)
        else errors.push(`${page.path}: example sentence id "${sentence.id}" is already used in ${earlier}`)
      }
  }
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
      pages.push({ path, id: null, file: null, valid: false, entryIds: [], entryWords: [] })
      continue
    }
    const valid = runSchema(path, json, validatePage, errors)
    let nameOk = true
    // An id of the wrong shape is already reported by the schema and cannot
    // be a key in the lookup, so it counts as no usable id.
    const id = isObject(json) && isFilled(json.id) && ID_PATTERN.test(json.id) ? json.id : null
    // A partOfSpeech outside the allowed list is already reported by the
    // schema; a file-name message for it would ask for a name that fails too.
    if (
      isObject(json) &&
      isFilled(json.traditional) &&
      (json.partOfSpeech === null ||
        (isFilled(json.partOfSpeech) && ALLOWED_PARTS_OF_SPEECH.includes(json.partOfSpeech)))
    ) {
      const traditional = json.traditional
      const partOfSpeech = json.partOfSpeech as string | null
      const problem = pageNameProblem(traditional, partOfSpeech)
      const named = [traditional, partOfSpeech, id].filter(part => part !== null).join(' ')
      if (problem) errors.push(`${path}: ${problem}`)
      else if (id !== null && pagePath(traditional, partOfSpeech, id) !== path)
        errors.push(`${path}: file name does not match ${named} (expected ${pagePath(traditional, partOfSpeech, id)})`)
      nameOk = !problem && id !== null && pagePath(traditional, partOfSpeech, id) === path
    }
    // A page's English type is its English word's: none exactly when no entry has a word, so a page is never half
    // English (one word and one entry without).
    if (isObject(json) && Array.isArray(json.english) && json.english.length > 0 && json.english.every(isObject)) {
      const wordless = json.english.filter(entry => entry.word === null).length
      const consistent = json.partOfSpeech === null ? wordless === json.english.length : wordless === 0
      if (!consistent)
        errors.push(
          `${path}: partOfSpeech is the English word's, so it must be null exactly when no English entry has a word`,
        )
    }
    // A spelling the page already is would make search find the page twice by one word.
    if (isObject(json) && Array.isArray(json.variants) && json.variants.includes(json.traditional))
      errors.push(`${path}: variant "${json.traditional}" is the page's own word`)
    names.push({ path, nameOk })
    pages.push({
      path,
      id,
      file: valid ? (json as unknown as PageFile) : null,
      valid,
      entryIds: rawEntryIds(json),
      entryWords: rawEntryWords(json),
    })
  }
  errors.push(...casePathDuplicates(names))
  return pages
}

/**
 * No two pages are the same word, part of speech, reading, and English words with their meanings (in any order). Only
 * pages that passed the schema are judged. Readings are compared exactly as stored.
 */
function checkPageReadings(pages: CheckedPage[], errors: string[]): void {
  const firstPath = new Map<string, string>()
  for (const { path, file } of pages) {
    if (!file) continue
    const senses = file.english.map(entry => `${entry.word}: ${entry.meaning}`).sort()
    const key = JSON.stringify([file.traditional, file.partOfSpeech, file.jyutping, senses])
    const earlier = firstPath.get(key)
    if (earlier)
      errors.push(
        `${path}: same word, part of speech, reading, English words and meanings (${file.traditional} ${file.partOfSpeech} ${file.jyutping} ${senses.join(' · ')}) as ${earlier}`,
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
    for (const id of entryIds) {
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
function checkPageLookup(root: string, pages: CheckedPage[], words: CheckedWord[], errors: string[]): void {
  if (pages.length === 0) return
  const lookup = readTopLevelFile(root, 'pages-by-id.json', validatePageLookup, errors) as PageLookup | null
  if (!lookup) return
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
    for (const entryId of entryIds) {
      if (!Object.hasOwn(lookup, entryId))
        errors.push(`pages-by-id.json: English entry "${entryId}" (${path}) has no entry`)
      else if (id !== null && lookup[entryId] !== id)
        errors.push(
          `pages-by-id.json: English entry "${entryId}" (${path}) maps to "${lookup[entryId]}", not to its page "${id}"`,
        )
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

function checkFrequency(
  root: string,
  words: CheckedWord[],
  pages: CheckedPage[],
  errors: string[],
): FrequencyFile | null {
  const json = readTopLevelFile(root, 'frequency.json', validateFrequency, errors) as FrequencyFile | null
  if (!json) return null

  const idPath = new Map<string, string>()
  for (const { path, rowIds } of words) for (const id of rowIds) idPath.set(id, path)
  for (const { path, rowIds } of words) {
    for (const id of rowIds)
      if (!Object.hasOwn(json.rows, id)) errors.push(`frequency.json: no entry for id "${id}" (${path})`)
  }
  const entryIds = new Set(pages.flatMap(page => page.entryIds))
  for (const id of Object.keys(json.rows))
    if (!idPath.has(id) && !entryIds.has(id)) errors.push(`frequency.json: id "${id}" is in no page entry or word file`)

  const termPath = new Map(words.map(({ term, path }) => [term, path]))
  for (const { term, path } of words)
    if (!Object.hasOwn(json.words, term)) errors.push(`frequency.json: no rank for "${term}" (${path})`)
  const entryWords = new Set(pages.flatMap(page => page.entryWords))
  for (const term of Object.keys(json.words))
    if (!termPath.has(term) && !entryWords.has(term))
      errors.push(`frequency.json: "${term}" is no page entry's word and has no word file`)

  return json
}

function checkAliases(root: string, words: CheckedWord[], pages: CheckedPage[], errors: string[]): void {
  const json = readTopLevelFile(root, 'aliases.json', validateAliases, errors) as AliasesFile | null
  if (!json) return
  const terms = new Set([...words.map(word => word.term), ...pages.flatMap(page => page.entryWords)])
  for (const term of Object.keys(json))
    if (!terms.has(term)) errors.push(`aliases.json: "${term}" is no page entry's word and has no word file`)
}

/**
 * Every pictures.json key is a page file's own id, and no page lists one photo twice. As in
 * checkPageLookup, while a page without a usable id exists (already reported) the "not a page id"
 * rule stays quiet, since that page's id cannot be known.
 */
function checkPictures(root: string, pages: CheckedPage[], errors: string[]): void {
  const json = readTopLevelFile(root, 'pictures.json', validatePictures, errors) as PicturesFile | null
  if (!json) return
  const pageIds = new Set(pages.flatMap(({ id }) => (id === null ? [] : [id])))
  const someIdUnknown = pages.some(({ id }) => id === null)
  for (const [pageId, photos] of Object.entries(json)) {
    if (!someIdUnknown && !pageIds.has(pageId)) errors.push(`pictures.json: "${pageId}" is not a page id`)
    const seen = new Set<string>()
    for (const photo of photos) {
      const name = 'commons' in photo ? `Commons file ${photo.commons}` : `Pexels photo ${photo.pexels}`
      if (seen.has(name)) errors.push(`pictures.json: page "${pageId}" lists ${name} twice`)
      seen.add(name)
    }
  }
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
    for (const entry of file.english) {
      if (entry.note !== undefined)
        for (const problem of noteProblems(entry.note, entry.word ?? '', entry.meaning))
          errors.push(`${path}: English entry "${entry.word ?? entry.meaning}" ${problem}`)
      entry.exampleSentences.forEach((example, exampleIndex) => {
        const letters = placeholderLetters(example.english)
        if (letters.length)
          errors.push(
            `${path}: English entry "${entry.word ?? entry.meaning}" sentence ${exampleIndex + 1} english has a placeholder letter (${letters.join(', ')})`,
          )
      })
    }
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
  checkSentenceIds(pages, errors)
  checkPageLookup(root, pages, words, errors)
  const beforeFrequency = errors.length
  const frequency = checkFrequency(root, words, pages, errors)
  const frequencyClean = errors.length === beforeFrequency
  checkAliases(root, words, pages, errors)
  checkPictures(root, pages, errors)
  // meaningShare compares rows via the ids frequency.json maps them by, so it
  // only runs once that map is known complete (no missing/orphaned entries) —
  // otherwise a row whose id has no frequency.json entry, or a duplicate id
  // that resolves to the wrong entry, would report an incidental, misleading
  // mismatch on top of the real problem already reported above.
  checkMeaningShare(words, frequencyClean ? frequency : null, errors)
  checkShownText(words, errors)
  checkPageShownText(pages, errors)
  errors.push(...checkCorpus(root))
  return errors
}

if (import.meta.main) {
  const errors = checkRepo(process.cwd())
  for (const error of errors) console.error(error)
  console.log(errors.length ? `${errors.length} problem(s)` : 'OK')
  process.exit(errors.length ? 1 : 0)
}
