// Mints a fresh 8-character id for a brand-new row, one that no row in the
// repo already uses. (Two people working on separate branches could still,
// very rarely, pick the same one; `pnpm run check` catches that.) Run it with `pnpm run new-id`; it prints one id
// to the terminal.
import { randomInt } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { listWordFiles } from './repo.ts'
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

/** Every row id already used by a word file in `root`. */
function collectTakenIds(root: string): Set<string> {
  const taken = new Set<string>()
  for (const path of listWordFiles(root)) {
    const file = JSON.parse(readFileSync(join(root, path), 'utf8')) as WordFile
    for (const row of file.rows) taken.add(row.id)
  }
  return taken
}

if (import.meta.main) {
  console.log(newId(collectTakenIds(process.cwd())))
}
