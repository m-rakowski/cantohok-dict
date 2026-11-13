// One-off migration: moves each page's flat `examples` list inside the English
// entry that owns each sentence (`exampleSentences`). Run it once with
// `node scripts/nest-sentences.ts`; it rewrites every page file and prints each
// page where a sentence did not stay with the word at its own position.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { listPageFiles } from './repo.ts'
import type { Example, PageFile } from './types.ts'

interface OldPageFile extends Omit<PageFile, 'english'> {
  english: Array<Omit<PageFile['english'][number], 'exampleSentences'>>
  examples: Example[]
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
const containsWord = (text: string, word: string): boolean =>
  new RegExp(`(^|[^\\p{L}])${escapeRegExp(word)}([^\\p{L}]|$)`, 'iu').test(text)

/** The index of the word that owns a sentence: the word at its position if the sentence names it, else the first word it names, else its position's word; past the last word, the last word. */
export function ownerIndex(sentenceEnglish: string, words: string[], position: number): number {
  const own = Math.min(position, words.length - 1)
  if (containsWord(sentenceEnglish, words[own])) return own
  const first = words.findIndex(word => containsWord(sentenceEnglish, word))
  return first === -1 ? own : first
}

/** Each word's sentences, in file order: ownership first, then a word left with none gets a copy of the first sentence that names it. */
export function nestSentences<E extends { english: string }>(words: string[], examples: E[]): E[][] {
  const nested: E[][] = words.map(() => [])
  examples.forEach((example, position) => nested[ownerIndex(example.english, words, position)].push(example))
  words.forEach((word, index) => {
    if (nested[index].length > 0) return
    const copy = examples.find(example => containsWord(example.english, word))
    if (copy) nested[index].push(copy)
  })
  return nested
}

/** The page with its sentences inside their words and no page-level `examples`. */
export function nestPage(old: OldPageFile): PageFile {
  const { examples, english, ...rest } = old
  const nested = nestSentences(
    english.map(entry => entry.word),
    examples,
  )
  return { ...rest, english: english.map((entry, index) => ({ ...entry, exampleSentences: nested[index] })) }
}

if (import.meta.main) {
  const root = process.cwd()
  for (const path of listPageFiles(root)) {
    const old = JSON.parse(readFileSync(join(root, path), 'utf8')) as OldPageFile
    const page = nestPage(old)
    const words = old.english.map(entry => entry.word)
    const moved = old.examples.some((example, position) => ownerIndex(example.english, words, position) !== position)
    if (moved) console.log(path)
    writeFileSync(join(root, path), JSON.stringify(page, null, 2) + '\n')
  }
}
