// Turns the Cantonese page files in cantonese/, frequency.json and aliases.json
// into the finished files people actually download: a spreadsheet (CSV), a
// JSON Lines file, an aliases lookup, and a file formatted for the Pleco
// dictionary app. Run it with `pnpm run export`; the output lands in dist/.
// You don't need to run this yourself to submit a fix — it only matters when
// preparing a release.
//
// The `id` column is the English entry's own id. An entry added in the editor
// has none yet, so its id here is composite, `<page id>:<English word>`
// (unique on its page), and its shares are 0.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { stringify } from 'csv-stringify/sync'
import { checkRepo } from './check.ts'
import { listPageFiles } from './repo.ts'
import { BOM, flat, plecoEntry, plecoHeader, plecoSentence } from './pleco-format.ts'
import type { AliasesFile, Example, FrequencyFile, PageFile, Row, SentenceSource } from './types.ts'

export interface Repo {
  pages: PageFile[]
  frequency: FrequencyFile
  aliases: AliasesFile
}

/** Runs the checks from check.ts (not Prettier's formatting check), throwing if anything is wrong, then loads every file in the repo into memory as one Repo object. */
export function loadValidRepo(root: string): Repo {
  const errors = checkRepo(root)
  if (errors.length) throw new Error(`the repo has problems:\n${errors.join('\n')}`)
  const read = (path: string) => JSON.parse(readFileSync(join(root, path), 'utf8'))
  return {
    pages: listPageFiles(root).map(path => read(path) as PageFile),
    frequency: read('frequency.json') as FrequencyFile,
    aliases: read('aliases.json') as AliasesFile,
  }
}

/** One exported line: a row plus the English word it belongs to. */
interface ExportRow extends Row {
  term: string
  pageId: string
  /** The entry's running place on its page (position in the page's English list), the last tie-break. */
  sequence: number
  /** Every sentence of the entry, in page order. CSV and JSONL show only the first (`example`); Pleco shows all. */
  examples: Example[]
}

/** A word's rank in frequency.json, or undefined when it has none (those words sort after every ranked one). */
const rankOf = (repo: Repo, term: string): number | undefined =>
  Object.hasOwn(repo.frequency.words, term) ? repo.frequency.words[term] : undefined

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

function eachRow(repo: Repo): ExportRow[] {
  const rows: ExportRow[] = []
  for (const page of repo.pages) {
    // The running place on the page is the entry's position in its English list.
    page.english.forEach((entry, position) => {
      // The exports are English → Cantonese: an entry English has no word for (啊) has no line to be found under.
      // A page holding one has no English type either (check.ts), so neither is null below.
      if (entry.word === null || page.partOfSpeech === null) return
      // A sentence's id names it inside the repo only; the exports carry its text and where it came from.
      const examples = entry.exampleSentences.map(({ english, traditional, jyutping, source }) => ({
        english,
        traditional,
        jyutping,
        ...(source ? { source } : {}),
      }))
      const row: ExportRow = {
        id: entry.id ?? `${page.id}:${entry.word}`,
        term: entry.word,
        pageId: page.id,
        sequence: position,
        partOfSpeech: page.partOfSpeech,
        meaning: entry.meaning,
        traditional: page.traditional,
        jyutping: page.jyutping,
        note: entry.note ?? '',
        examples,
      }
      if (entry.register !== undefined) row.register = entry.register
      if (examples[0]) row.example = examples[0]
      rows.push(row)
    })
  }
  const orderOf = (row: ExportRow): number =>
    Object.hasOwn(repo.frequency.rows, row.id) ? repo.frequency.rows[row.id].order : Infinity
  return rows.sort(
    (a, b) =>
      (rankOf(repo, a.term) ?? Infinity) - (rankOf(repo, b.term) ?? Infinity) ||
      byText(a.term, b.term) ||
      (orderOf(a) === orderOf(b) ? 0 : orderOf(a) < orderOf(b) ? -1 : 1) ||
      byText(a.pageId, b.pageId) ||
      a.sequence - b.sequence,
  )
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
  'exampleSource',
]

/** A sentence's source as one CSV cell: its writer or `<corpus> <line>`, then who wrote the English when someone else did. */
function sourceText(source: SentenceSource | undefined): string {
  if (!source) return ''
  const from = 'by' in source ? source.by : `${source.corpus} ${source.line}`
  return source.englishBy ? `${from}; English by ${source.englishBy}` : from
}

/**
 * Builds the dictionary.csv contents: one row per Cantonese word, ordered by each word's rank in frequency.json, then alphabetically.
 * Both CSVs start with a UTF-8 BOM (an invisible marker): without it, Excel guesses a legacy encoding and shows the Chinese as garbled text.
 */
export function toCsv(repo: Repo): string {
  const records = eachRow(repo).map(row => ({
    id: row.id,
    term: row.term,
    partOfSpeech: row.partOfSpeech,
    meaning: row.meaning,
    traditional: row.traditional,
    jyutping: row.jyutping,
    register: row.register ?? '',
    note: row.note,
    exampleEnglish: row.example?.english ?? '',
    exampleTraditional: row.example?.traditional ?? '',
    exampleJyutping: row.example?.jyutping ?? '',
    exampleSource: sourceText(row.example?.source),
  }))
  return stringify(records, { bom: true, header: true, columns: CSV_COLUMNS, record_delimiter: '\n' })
}

/** Builds the dictionary.jsonl contents: one JSON object per Cantonese word (including its rank and shares), one per line. */
export function toJsonl(repo: Repo): string {
  return (
    eachRow(repo)
      .map(row => {
        const shares = Object.hasOwn(repo.frequency.rows, row.id)
          ? repo.frequency.rows[row.id]
          : { meaningShare: 0, share: 0 }
        const out: Record<string, unknown> = {
          id: row.id,
          term: row.term,
          ...(rankOf(repo, row.term) === undefined ? {} : { rank: rankOf(repo, row.term) }),
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

/** Builds the cantohok-en-yue.txt contents: the whole dictionary formatted for the Pleco app to import as a user dictionary. */
export function toPleco(repo: Repo): string {
  const entries = eachRow(repo).map(row => {
    const lines = [plecoHeader(row.traditional, row.jyutping, row.partOfSpeech, row.register), flat(row.meaning)]
    if (row.note) lines.push(flat(row.note))
    for (const example of row.examples) lines.push('', ...plecoSentence(example, row.traditional, row.jyutping))
    return plecoEntry(row.term, lines)
  })
  return BOM + entries.join('\n') + '\n'
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
  const rows = eachRow(repo)
  console.log(`exported ${new Set(rows.map(row => row.term)).size} words, ${rows.length} rows to dist/`)
}
