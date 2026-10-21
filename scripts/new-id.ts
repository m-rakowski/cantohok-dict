// Mints a fresh 8-character id for a brand-new English entry or page, one that no
// entry or page in the repo already uses. (Two people working on separate branches could still,
// very rarely, pick the same one; `pnpm run check` catches that.) Run it with `pnpm run new-id`; it prints one id
// to the terminal.
import { randomInt } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { listPageFiles } from './repo.ts'
import type { PageFile, PageLookup } from './types.ts'

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

/**
 * A fresh 8-character `[a-z0-9]` id that is not in `taken`. `random(max)`
 * returns a random integer in `[0, max)`; it defaults to `crypto.randomInt`
 * and is otherwise only for tests, to make an id collision (and the re-roll
 * it forces) deterministic.
 */
export function newId(taken: Set<string>, random: (max: number) => number = randomInt): string {
  let id: string
  do {
    id = Array.from({ length: 8 }, () => ALPHABET[random(ALPHABET.length)]).join('')
  } while (taken.has(id))
  return id
}

/**
 * Every id already used in `root`: each page id, each English entry id on a
 * page, and each key of pages-by-id.json, because a page id must never equal
 * an entry id. A page file that is not valid JSON, or has no string `id`, is
 * skipped here; `pnpm run check` reports it. Word files in the legacy words/
 * folder do not count.
 */
export function collectTakenIds(root: string): Set<string> {
  const taken = new Set<string>()
  const lookup = join(root, 'pages-by-id.json')
  if (existsSync(lookup)) {
    try {
      for (const id of Object.keys(JSON.parse(readFileSync(lookup, 'utf8')) as PageLookup)) taken.add(id)
    } catch {
      // pnpm run check reports an unreadable lookup
    }
  }
  for (const path of listPageFiles(root)) {
    let page: Partial<PageFile> | null
    try {
      page = JSON.parse(readFileSync(join(root, path), 'utf8'))
    } catch {
      continue
    }
    if (typeof page !== 'object' || page === null) continue
    if (typeof page.id === 'string') taken.add(page.id)
    if (!Array.isArray(page.boxes)) continue
    for (const box of page.boxes)
      for (const entry of Array.isArray(box?.english) ? box.english : [])
        if (typeof entry?.id === 'string') taken.add(entry.id)
  }
  return taken
}

if (import.meta.main) {
  console.log(newId(collectTakenIds(process.cwd())))
}
