// The corpus example sentences: corpus/<source>/<hh>.jsonl, one sentence per line.
//
// Every line is checked on its own against schema/corpus-<source>.schema.json. On top of that:
// - A line must be written exactly as JSON.stringify writes it with its keys sorted at every
//   level (Prettier does not read .jsonl, so nothing else keeps the form fixed), and every line
//   ends with a newline.
// - A line lives in the file named by the first two hex digits of sha1(id), so adding or removing
//   a sentence never moves another; inside a file, lines are sorted by id (Tatoeba numerically).
// - An id appears once per source.
// - A generated reading (jyutpingBy "picker" or "tojyutping") has one syllable per Han character
//   in the text, plus one for each letter-and-tone run the text itself contains (a chess square
//   written c5 stays c5). A corpus reading ("corpus") is the corpus's own words' readings joined,
//   because these corpora read digits and Latin letters aloud too (323 is saam1 ji6 saam1).
// - Each source folder has a LICENSE file.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Ajv2020 } from 'ajv/dist/2020.js'
import tatoebaSchema from '../schema/corpus-tatoeba.schema.json' with { type: 'json' }
import hkcancorSchema from '../schema/corpus-hkcancor.schema.json' with { type: 'json' }
import hambaanglaangSchema from '../schema/corpus-hambaanglaang.schema.json' with { type: 'json' }
import commonvoiceSchema from '../schema/corpus-commonvoice.schema.json' with { type: 'json' }

export const CORPUS_SOURCES = ['tatoeba', 'hkcancor', 'hambaanglaang', 'commonvoice'] as const
export type CorpusSource = (typeof CORPUS_SOURCES)[number]

interface Word {
  text: string
  jyutping: string
}
interface Line {
  id: string
  text: string
  jyutping: string | null
  jyutpingBy: string
  words?: Word[]
}

const ajv = new Ajv2020({ allErrors: true })
const validators = {
  tatoeba: ajv.compile(tatoebaSchema),
  hkcancor: ajv.compile(hkcancorSchema),
  hambaanglaang: ajv.compile(hambaanglaangSchema),
  commonvoice: ajv.compile(commonvoiceSchema),
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(item => sortKeys(item))
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, sortKeys((value as Record<string, unknown>)[key])]),
  )
}

/** The one accepted form of a line. */
export function canonicalLine(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

/** `<source>/<hh>.jsonl`: the file a line with this id belongs in. */
export function lineFile(source: CorpusSource, id: string): string {
  return `${source}/${createHash('sha1').update(id, 'utf8').digest('hex').slice(0, 2)}.jsonl`
}

function compareIds(source: CorpusSource, a: string, b: string): number {
  if (source === 'tatoeba') return Number(a) - Number(b)
  return a < b ? -1 : a > b ? 1 : 0
}

const HAN = /\p{Script=Han}/gu
const TONED = /[a-z]+[1-6]/giu

/** Why a line's reading is wrong, or null. */
export function readingProblem(source: CorpusSource, line: Line): string | null {
  if (line.jyutping === null) return null
  if (line.jyutpingBy === 'corpus') {
    const words = line.words ?? []
    const joined =
      source === 'hambaanglaang'
        ? words
            .map(word => word.jyutping.replaceAll('-', ' '))
            .join(' ')
            .toLowerCase()
        : words.map(word => word.jyutping).join(' ')
    return joined === line.jyutping ? null : `jyutping is not its words' readings joined ("${joined}")`
  }
  const expected = (line.text.match(HAN) ?? []).length + (line.text.match(TONED) ?? []).length
  const found = (line.jyutping.match(TONED) ?? []).length
  return found === expected
    ? null
    : `jyutping has ${found} syllables for ${expected} (one per Han character, plus each toned Latin run in the text)`
}

/** Every problem in corpus/, as `<path>: <message>` (or `<path>:<line>: <message>`). */
export function checkCorpus(root: string): string[] {
  const errors: string[] = []
  const dir = join(root, 'corpus')
  if (!existsSync(dir)) return ['corpus/: missing']
  for (const source of CORPUS_SOURCES) {
    const sourceDir = join(dir, source)
    if (!existsSync(sourceDir)) {
      errors.push(`corpus/${source}/: missing`)
      continue
    }
    if (!existsSync(join(sourceDir, 'LICENSE'))) errors.push(`corpus/${source}/LICENSE: missing`)
    const seen = new Set<string>()
    for (const name of readdirSync(sourceDir).sort()) {
      if (name === 'LICENSE') continue
      const path = `corpus/${source}/${name}`
      if (!/^[0-9a-f]{2}\.jsonl$/u.test(name)) {
        errors.push(`${path}: not a corpus file (expected <two hex digits>.jsonl)`)
        continue
      }
      const text = readFileSync(join(sourceDir, name), 'utf8')
      if (!text.endsWith('\n')) errors.push(`${path}: does not end with a newline`)
      let previous: string | null = null
      text
        .replace(/\n$/u, '')
        .split('\n')
        .forEach((json, index) => {
          const where = `${path}:${index + 1}`
          let value: unknown
          try {
            value = JSON.parse(json)
          } catch {
            errors.push(`${where}: invalid JSON`)
            return
          }
          const validate = validators[source]
          if (!validate(value)) {
            for (const error of validate.errors ?? []) {
              const extra =
                error.keyword === 'additionalProperties'
                  ? ` "${(error.params as { additionalProperty: string }).additionalProperty}"`
                  : ''
              errors.push(`${where}: ${error.instancePath || '(root)'} ${error.message}${extra}`)
            }
            return
          }
          const line = value as unknown as Line
          if (canonicalLine(line) !== json) errors.push(`${where}: not in canonical form (keys sorted, no spaces)`)
          if (lineFile(source, line.id) !== `${source}/${name}`) {
            errors.push(`${where}: id ${line.id} belongs in corpus/${lineFile(source, line.id)}`)
          }
          if (seen.has(line.id)) errors.push(`${where}: duplicate id ${line.id}`)
          seen.add(line.id)
          if (previous !== null && compareIds(source, previous, line.id) >= 0) {
            errors.push(`${where}: id ${line.id} is out of order after ${previous}`)
          }
          previous = line.id
          const problem = readingProblem(source, line)
          if (problem) errors.push(`${where}: ${problem}`)
        })
    }
  }
  return errors
}
