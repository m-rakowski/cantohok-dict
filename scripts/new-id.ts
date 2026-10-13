// Mints a fresh 8-character id for a brand-new row or page, one that no row
// or page in the repo already uses. (Two people working on separate branches could still,
// very rarely, pick the same one; `pnpm run check` catches that.) Run it with `pnpm run new-id`; it prints one id
// to the terminal.
import { randomInt } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { listPageFiles, listWordFiles } from './repo.ts'
import type { WordFile } from './types.ts'

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
 * Every id already used in `root`: each row id in a word file, and each page
 * id in a Cantonese page file, because a page id must never equal a row id. A
 * page file that is not valid JSON, or has no string `id`, is skipped here;
 * `pnpm run check` reports it.
 */
export function collectTakenIds(root: string): Set<string> {
  const taken = new Set<string>()
  for (const path of listWordFiles(root)) {
    const file = JSON.parse(readFileSync(join(root, path), 'utf8')) as WordFile
    for (const row of file.rows) taken.add(row.id)
  }
  for (const path of listPageFiles(root)) {
    let page: unknown
    try {
      page = JSON.parse(readFileSync(join(root, path), 'utf8'))
    } catch {
      continue
    }
    const id = typeof page === 'object' && page !== null ? (page as { id?: unknown }).id : undefined
    if (typeof id === 'string') taken.add(id)
  }
  return taken
}

if (import.meta.main) {
  console.log(newId(collectTakenIds(process.cwd())))
}
