// One-off: gives every page sentence its `source` (page.schema.json), from this repo's own history.
// A sentence's writer is the writer of the first commit on main whose page or words/ files hold its exact
// Chinese text; its English's writer, that of the first commit holding its exact Chinese and English together.
// WRITERS below names each such commit's writer, from its message and Co-Authored-By trailer. When the two
// differ, `englishBy` names the English's. A sentence copied from a corpus line (COPIED below) names that line
// instead, with `englishBy` unless its English is the line's own by a person. Refuses, writing nothing, when any
// sentence's first commit is in neither table. Deleted once it has run.
//
// Usage, from the repository root: node scripts/add-sentence-sources.ts [--dry-run]
import { execFileSync, spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CORPUS_SOURCES, type CorpusSource } from './corpus.ts'
import { listPageFiles } from './repo.ts'
import type { PageFile, SentenceSource } from './types.ts'

const WRITERS: Record<string, string> = {
  // Initial import: the generator's sentences, written with gpt-5.6-luna.
  f828e0bbd2b0b5b6fd67cb07f8a10b03800329b0: 'gpt-5.6-luna',
  // "Add 136 CEFR phrases and 4 missing words": "gpt-5.6-luna partition".
  a1f60627d52e5b83de4abb9ab857a9ae8efc149c: 'gpt-5.6-luna',
  // "Add 44 beginner words": "Drafted by a local Cantonese model (CantoneseLLM v2.0 30B)".
  c56716ca15c36119ecc9812f91ccd39fb3b3bcc2: 'cantonesellm-v2.0-30b',
  // Written in Claude Opus 5.5 sessions (Co-Authored-By: Claude Opus 5.5).
  '8d3b99e6f5867d02ee0d9084cbf6791e9f1356aa': 'claude-opus-5.5',
  '0a159ff683bbafa2966e3db8fc44fda608d8e2f6': 'claude-opus-5.5',
  c8feb31c59fd33a687c21fbbc33da9553844426b: 'claude-opus-5.5',
  f2a8c6bce9f0f9a0fd84acb17ef89e4f26550339: 'claude-opus-5.5',
  // #21: its squashed commits are Co-Authored-By Claude Opus 5.5.
  c64b8714a8e95f976f2ab7b77c39e79adcb0f41a: 'claude-opus-5.5',
  // #22: Co-Authored-By "Claude", with no model named.
  bfe7d754fec8435c0162b2e669010231136d5f36: 'claude',
  // English rewritten in Claude Opus 5.5 sessions, the Chinese kept.
  a9f2e9c74538a5805926064a14effe84d36f36a5: 'claude-opus-5.5',
  d4cec5d2d1eda93bed7a82d7879d06b486203062: 'claude-opus-5.5',
  '035241d5e0360a7b98c1aceb1888f1168cec1c95': 'claude-opus-5.5',
  '89e4c7f1306b5491004e70b5744e34654ed86331': 'claude-opus-5.5',
  cc01ad9d1964ddb3fc19c191aab023f219a55ffa: 'claude-opus-5.5',
  bbdde222783a2eaee8be0b6885cd802fddce481e: 'claude-opus-5.5',
  // "safe example no longer says hotel": rewritten in a Claude Opus 5.5 session.
  '19bafcb1f0bab01fa2812fef3fbe8d6e7779c266': 'claude-opus-5.5',
  // #13: the maintainer rewrote two sentences' English, with no model credited.
  '5932150e46bb87da2569b2403bbe6cca1f0015d7': 'contributor',
  // "Apply reviewed suggestions": sentences readers suggested.
  b78928648dc251dff33660b955d1a545777944c2: 'contributor',
}
// Commits whose new sentences are copied from corpus/ lines: the line is found by its text.
const COPIED = new Set(['04435a5c5d2fe70813eb6db326af194464e9f120'])
// A corpus line's English whose `by` is "machine" was translated with this model when the corpus was added.
const MACHINE_ENGLISH = 'gpt-5.6-luna'

const dryRun = process.argv.includes('--dry-run')
const git = (...args: string[]): string =>
  execFileSync('git', ['-c', 'core.quotepath=false', ...args], { maxBuffer: 1 << 30 }).toString()

// `git cat-file --batch`, one blob at a time.
const cat = spawn('git', ['cat-file', '--batch'])
let pending = Buffer.alloc(0)
const waiting: ((body: string | null) => void)[] = []
cat.stdout.on('data', (chunk: Buffer) => {
  pending = Buffer.concat([pending, chunk])
  while (waiting.length) {
    const newline = pending.indexOf(10)
    if (newline < 0) return
    const head = pending.subarray(0, newline).toString()
    if (head.endsWith(' missing')) {
      pending = pending.subarray(newline + 1)
      waiting.shift()!(null)
      continue
    }
    const size = Number(head.split(' ')[2])
    if (pending.length < newline + 2 + size) return
    const body = pending.subarray(newline + 1, newline + 1 + size).toString()
    pending = pending.subarray(newline + 2 + size)
    waiting.shift()!(body)
  }
})
const blob = (spec: string): Promise<string | null> =>
  new Promise(resolve => {
    waiting.push(resolve)
    cat.stdin.write(`${spec}\n`)
  })

/** Every sentence in a page or word file of any past shape (`example`, page-level `examples`, `exampleSentences`). */
function sentencesIn(json: string): { traditional: string; english: string }[] {
  const found: { traditional: string; english: string }[] = []
  const take = (value: unknown) => {
    const { traditional, english } = (value ?? {}) as { traditional?: unknown; english?: unknown }
    if (typeof traditional === 'string')
      found.push({ traditional, english: typeof english === 'string' ? english : '' })
  }
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(walk)
    else if (value && typeof value === 'object')
      for (const [key, child] of Object.entries(value)) {
        if (key === 'example') take(child)
        else if ((key === 'examples' || key === 'exampleSentences') && Array.isArray(child)) child.forEach(take)
        else walk(child)
      }
  }
  try {
    walk(JSON.parse(json))
  } catch {
    // A file that was not valid JSON at some commit holds no sentence we can read.
  }
  return found
}
const pairKey = (traditional: string, english: string) => `${traditional}\u0000${english}`

const firstCommit = new Map<string, string>() // Chinese text -> the first commit holding it
const firstPairCommit = new Map<string, string>() // Chinese and English together -> the first commit holding them
const commits = git('log', '--reverse', '--format=%H', 'origin/main', '--', 'cantonese', 'words').trim().split('\n')
for (const [index, commit] of commits.entries()) {
  const changed =
    index === 0
      ? git('ls-tree', '-r', '--name-only', commit, 'cantonese', 'words')
      : git('diff', '--name-only', '--diff-filter=AM', `${commit}^`, commit, '--', 'cantonese', 'words')
  for (const path of changed
    .trim()
    .split('\n')
    .filter(name => name.endsWith('.json'))) {
    const body = await blob(`${commit}:${path}`)
    if (body)
      for (const { traditional, english } of sentencesIn(body)) {
        if (!firstCommit.has(traditional)) firstCommit.set(traditional, commit)
        if (!firstPairCommit.has(pairKey(traditional, english)))
          firstPairCommit.set(pairKey(traditional, english), commit)
      }
  }
}
cat.stdin.end()

// Each corpus line by its text, for the copied sentences.
const corpusLines = new Map<string, { corpus: CorpusSource; id: string; english: { by: string; text: string }[] }>()
for (const corpus of CORPUS_SOURCES)
  for (const name of git('ls-tree', '--name-only', `HEAD:corpus/${corpus}`).trim().split('\n'))
    if (name.endsWith('.jsonl'))
      for (const json of readFileSync(join('corpus', corpus, name), 'utf8').split('\n'))
        if (json) {
          const line = JSON.parse(json)
          corpusLines.set(line.text, { corpus, id: line.id, english: line.english })
        }

const refused: string[] = []
const counts = new Map<string, number>()
const writerOf = (commit: string | undefined): string | undefined =>
  commit === undefined ? undefined : WRITERS[commit]
const sourceOf = (
  path: string,
  sentence: { id: string; traditional: string; english: string },
): SentenceSource | null => {
  const where = `${path}: sentence "${sentence.id}" (${sentence.traditional})`
  const commit = firstCommit.get(sentence.traditional)
  const englishCommit = firstPairCommit.get(pairKey(sentence.traditional, sentence.english))
  if (commit === undefined || englishCommit === undefined) {
    refused.push(`${where} is in no commit on main`)
    return null
  }
  const englishWriter = writerOf(englishCommit)
  if (COPIED.has(commit)) {
    const line = corpusLines.get(sentence.traditional)
    if (!line) {
      refused.push(`${where} came with copied sentences, but no corpus line has its text`)
      return null
    }
    const own = line.english?.find(english => english.text === sentence.english)
    const englishBy = own ? (own.by === 'machine' ? MACHINE_ENGLISH : undefined) : englishWriter
    if (!own && englishBy === undefined) {
      refused.push(`${where}: its English first appears in ${englishCommit.slice(0, 9)}, which names no writer here`)
      return null
    }
    return { corpus: line.corpus, line: line.id, ...(englishBy ? { englishBy } : {}) }
  }
  const writer = writerOf(commit)
  if (writer === undefined || englishWriter === undefined) {
    refused.push(
      `${where} first appears in ${(writer === undefined ? commit : englishCommit).slice(0, 9)}, which names no writer here`,
    )
    return null
  }
  return { by: writer, ...(englishWriter === writer ? {} : { englishBy: englishWriter }) }
}

const written: [string, PageFile][] = []
for (const path of listPageFiles(process.cwd())) {
  const page = JSON.parse(readFileSync(path, 'utf8')) as PageFile
  for (const entry of page.english)
    entry.exampleSentences = entry.exampleSentences.map(sentence => {
      const { source: _old, ...rest } = sentence
      const source = sentenceSource(path, sentence)
      return source ? { ...rest, source } : sentence
    })
  written.push([path, page])
}
function sentenceSource(
  path: string,
  sentence: { id?: string; traditional: string; english: string },
): SentenceSource | null {
  const source = sourceOf(path, { id: sentence.id ?? '', traditional: sentence.traditional, english: sentence.english })
  if (source) {
    const key = `${'by' in source ? source.by : source.corpus}${source.englishBy ? `, English by ${source.englishBy}` : ''}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return source
}

for (const [key, count] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`${count}\t${key}`)
if (refused.length) {
  console.error(`${refused.length} sentence(s) have no source, nothing written:\n${refused.join('\n')}`)
  process.exit(1)
}
if (!dryRun) for (const [path, page] of written) writeFileSync(path, `${JSON.stringify(page, null, 2)}\n`)
