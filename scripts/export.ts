// Turns everything in words/, frequency.json and aliases.json into the
// finished files people actually download: a spreadsheet (CSV), a JSON Lines
// file, an aliases lookup, and a file formatted for the Pleco dictionary
// app. Run it with `pnpm run export`; the output lands in dist/. You don't
// need to run this yourself to submit a fix — it only matters when
// preparing a release.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { stringify } from 'csv-stringify/sync'
import { checkRepo } from './check.ts'
import { listWordFiles } from './repo.ts'
import type { AliasesFile, FrequencyFile, Row, WordFile } from './types.ts'

export interface Repo {
  words: WordFile[]
  frequency: FrequencyFile
  aliases: AliasesFile
}

/** Runs the checks from check.ts (not Prettier's formatting check), throwing if anything is wrong, then loads every file in the repo into memory as one Repo object. */
export function loadValidRepo(root: string): Repo {
  const errors = checkRepo(root)
  if (errors.length) throw new Error(`the repo has problems:\n${errors.join('\n')}`)
  const read = (path: string) => JSON.parse(readFileSync(join(root, path), 'utf8'))
  return {
    words: listWordFiles(root).map(path => read(path) as WordFile),
    frequency: read('frequency.json') as FrequencyFile,
    aliases: read('aliases.json') as AliasesFile,
  }
}

function orderedWords(repo: Repo): WordFile[] {
  return [...repo.words].sort(
    (a, b) =>
      repo.frequency.words[a.term] - repo.frequency.words[b.term] || (a.term < b.term ? -1 : a.term > b.term ? 1 : 0),
  )
}

function eachRow(repo: Repo): Array<{ word: WordFile; row: Row }> {
  return orderedWords(repo).flatMap(word => word.rows.map(row => ({ word, row })))
}

const CSV_COLUMNS = [
  'id',
  'term',
  'partOfSpeech',
  'meaning',
  'traditional',
  'jyutping',
  'register',
  'note',
  'exampleEnglish',
  'exampleTraditional',
  'exampleJyutping',
]

/**
 * Builds the dictionary.csv contents: one row per Cantonese word, ordered by each word's rank in frequency.json, then alphabetically.
 * Both CSVs start with a UTF-8 BOM (an invisible marker): without it, Excel guesses a legacy encoding and shows the Chinese as garbled text.
 */
export function toCsv(repo: Repo): string {
  const records = eachRow(repo).map(({ word, row }) => ({
    id: row.id,
    term: word.term,
    partOfSpeech: row.partOfSpeech,
    meaning: row.meaning,
    traditional: row.traditional,
    jyutping: row.jyutping,
    register: row.register ?? '',
    note: row.note,
    exampleEnglish: row.example?.english ?? '',
    exampleTraditional: row.example?.traditional ?? '',
    exampleJyutping: row.example?.jyutping ?? '',
  }))
  return stringify(records, { bom: true, header: true, columns: CSV_COLUMNS, record_delimiter: '\n' })
}

/** Builds the dictionary.jsonl contents: one JSON object per Cantonese word (including its rank and shares), one per line. */
export function toJsonl(repo: Repo): string {
  return (
    eachRow(repo)
      .map(({ word, row }) => {
        const shares = repo.frequency.rows[row.id]
        const out: Record<string, unknown> = {
          id: row.id,
          term: word.term,
          rank: repo.frequency.words[word.term],
          partOfSpeech: row.partOfSpeech,
          meaning: row.meaning,
          meaningShare: shares.meaningShare,
          traditional: row.traditional,
          jyutping: row.jyutping,
          share: shares.share,
        }
        if (row.register) out.register = row.register
        out.note = row.note
        if (row.example) out.example = row.example
        return JSON.stringify(out)
      })
      .join('\n') + '\n'
  )
}

/** Builds aliases.csv: a lookup from a word form like "children" to the English word it belongs to, like "child". */
export function toAliasesCsv(repo: Repo): string {
  const pairs = Object.entries(repo.aliases).flatMap(([term, aliases]) => aliases.map(alias => ({ alias, term })))
  pairs.sort((a, b) =>
    a.alias < b.alias ? -1 : a.alias > b.alias ? 1 : a.term < b.term ? -1 : a.term > b.term ? 1 : 0,
  )
  return stringify(pairs, { bom: true, header: true, columns: ['alias', 'term'], record_delimiter: '\n' })
}

// Pleco's private-use formatting characters. Only the line break is documented by
// Pleco; bold and italic come from its forum and were verified on an iPhone on 2026-09-27.
const NL = '\u{EAB1}'
const BOLD = (text: string) => `\u{EAB2}${text}\u{EAB3}`
const ITALIC = (text: string) => `\u{EAB4}${text}\u{EAB5}`
const BOM = '\u{FEFF}'
const POS_ABBREVIATION: Record<string, string> = {
  noun: 'n.',
  verb: 'v.',
  adj: 'adj.',
  adv: 'adv.',
  prep: 'prep.',
  conj: 'conj.',
  pron: 'pron.',
  det: 'det.',
  intj: 'interj.',
  num: 'num.',
  particle: 'part.',
  article: 'art.',
  postp: 'postp.',
  name: 'name',
}
const SUPERSCRIPT: Record<string, string> = { 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶' }
const toneMarks = (jyutping: string): string =>
  jyutping.replace(/([a-z])([1-6])\b/gu, (_, letter: string, tone: string) => letter + SUPERSCRIPT[tone])
// A tab or newline inside a value would end the Pleco field or entry.
const flat = (value: string): string => value.replace(/[\t\r\n]+/gu, ' ').trim()

/** Builds the cantohok-en-yue.txt contents: the whole dictionary formatted for the Pleco app to import as a user dictionary. */
export function toPleco(repo: Repo): string {
  const lines = eachRow(repo).map(({ word, row }) => {
    const pos = POS_ABBREVIATION[row.partOfSpeech] ?? row.partOfSpeech
    const label = row.register ? `${pos}, ${row.register}` : pos
    const parts = [`${BOLD(flat(row.traditional))}  ${toneMarks(flat(row.jyutping))}  ${ITALIC(label)}`, flat(row.note)]
    if (row.example) {
      parts.push(
        '',
        flat(row.example.traditional),
        toneMarks(flat(row.example.jyutping)),
        ITALIC(flat(row.example.english)),
      )
    }
    return `${flat(word.term)}\t${parts.join(NL)}`
  })
  return BOM + lines.join('\n') + '\n'
}

if (import.meta.main) {
  const root = process.cwd()
  const repo = loadValidRepo(root)
  mkdirSync(join(root, 'dist'), { recursive: true })
  const outputs: Array<[string, string]> = [
    ['dictionary.csv', toCsv(repo)],
    ['dictionary.jsonl', toJsonl(repo)],
    ['aliases.csv', toAliasesCsv(repo)],
    ['cantohok-en-yue.txt', toPleco(repo)],
  ]
  for (const [name, contents] of outputs) writeFileSync(join(root, 'dist', name), contents)
  const rows = repo.words.reduce((sum, word) => sum + word.rows.length, 0)
  console.log(`exported ${repo.words.length} words, ${rows} rows to dist/`)
}
