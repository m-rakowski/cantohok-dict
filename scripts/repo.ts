// One small job: list every word file in the dictionary (words/**/*.json),
// so the other scripts don't each have to know how to walk that folder.
// Used by check.ts, export.ts and new-id.ts. There's no command to run this
// file by itself.
import { existsSync, readdirSync } from 'node:fs'
import { join, sep } from 'node:path'

/** Every word file, repo-relative with `/` separators, sorted. */
export function listWordFiles(root: string): string[] {
  const dir = join(root, 'words')
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter(name => name.endsWith('.json'))
    .map(name => `words/${name.split(sep).join('/')}`)
    .sort()
}
