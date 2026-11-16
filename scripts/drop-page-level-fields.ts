// One-off migration: removes a page's own `meaning`, `register` and `note`, so only
// the English entries carry them. Before deleting, it keeps what an entry would
// otherwise lose: an entry with no `meaning` of its own gets the page's (the
// export already showed the page's meaning for it), and the two page notes no
// entry repeats are appended to the entries they describe (CARRIED_NOTES). Run
// it once with `node scripts/drop-page-level-fields.ts`, then `pnpm format`.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { listPageFiles } from './repo.ts'
import type { EnglishEntry } from './types.ts'

/** A page file as it was before this migration. */
export interface OldPage {
  id: string
  partOfSpeech: string
  meaning: string
  english: EnglishEntry[]
  traditional: string
  jyutping: string
  register?: string
  note?: string
}

const SAY_IT_TWICE = 'Say it twice, once before each of the two actions.'
const SECOND_PART = 'Here it starts the second part of a sentence to say how things turned out.'

/** English entry id → page note text that entry takes on. Only these two page notes say something no entry says. */
export const CARRIED_NOTES: Record<string, string> = {
  hgmfrw9j: SAY_IT_TWICE, // 一路 · continually ("…alongside another action")
  gya3err0: SECOND_PART, // 結果 · conclusion
  '0wpmpkif': SECOND_PART, // 結果 · consequence
  z4e333e1: SECOND_PART, // 結果 · product
  jbcgdzr6: SECOND_PART, // 結果 · fruit
}

/** The page without its own meaning, register and note, with nothing an entry showed lost. */
export function dropPageLevelFields(page: OldPage, carried: Record<string, string>) {
  const { meaning, register: _register, note: _note, ...rest } = page
  const english = page.english.map(entry => {
    const out: EnglishEntry = entry.meaning === undefined ? { ...entry, meaning } : { ...entry }
    const extra = entry.id === undefined ? undefined : carried[entry.id]
    if (extra !== undefined) out.note = out.note === undefined ? extra : `${out.note} ${extra}`
    return out
  })
  return { ...rest, english }
}

if (import.meta.main) {
  const root = process.cwd()
  for (const path of listPageFiles(root)) {
    const before = JSON.parse(readFileSync(join(root, path), 'utf8')) as OldPage
    writeFileSync(join(root, path), JSON.stringify(dropPageLevelFields(before, CARRIED_NOTES), null, 2) + '\n')
  }
}
