// One-off migration: gives every English entry that has no `id` a fresh one (as
// the entry's first key) and adds a line for it to pages-by-id.json. Run it once
// with `node scripts/mint-missing-ids.ts`; it rewrites the page files that
// changed and prints one line per changed page.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { collectTakenIds, newId } from './new-id.ts'
import { listPageFiles } from './repo.ts'
import type { PageFile, PageLookup } from './types.ts'

/** The page with an id on every entry (new ids first in the entry, added to `taken`), and the ids minted, in entry order. */
export function mintMissingIds(
  page: PageFile,
  taken: Set<string>,
  random?: (max: number) => number,
): { page: PageFile; minted: string[] } {
  const minted: string[] = []
  const english = page.english.map(entry => {
    if (entry.id !== undefined) return entry
    const id = newId(taken, random)
    taken.add(id)
    minted.push(id)
    return { id, ...entry }
  })
  return { page: minted.length === 0 ? page : { ...page, english }, minted }
}

if (import.meta.main) {
  const root = process.cwd()
  const taken = collectTakenIds(root)
  const lookupPath = join(root, 'pages-by-id.json')
  const lookup = JSON.parse(readFileSync(lookupPath, 'utf8')) as PageLookup
  for (const path of listPageFiles(root)) {
    const before = JSON.parse(readFileSync(join(root, path), 'utf8')) as PageFile
    const { page, minted } = mintMissingIds(before, taken)
    if (minted.length === 0) continue
    writeFileSync(join(root, path), JSON.stringify(page, null, 2) + '\n')
    const words = page.english
      .filter(entry => minted.includes(entry.id ?? ''))
      .map(entry => `${entry.word} → ${entry.id}`)
    for (const id of minted) lookup[id] = page.id
    console.log(`${path}: ${words.join(', ')}`)
  }
  writeFileSync(lookupPath, JSON.stringify(lookup, null, 2) + '\n')
}
