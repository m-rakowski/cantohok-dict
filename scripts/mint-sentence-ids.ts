// One-off: gives every example sentence on every page an id, first key, and leaves sentences that
// already have one alone. Ids come from `newId` against every id in the repo, so `pnpm run new-id`
// keeps minting fresh ones afterwards. Run `node scripts/mint-sentence-ids.ts`, then
// `pnpm run format`. Deleted once run.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { collectTakenIds, newId } from './new-id.ts'
import { listPageFiles } from './repo.ts'

const root = process.cwd()
const taken = collectTakenIds(root)
let minted = 0
for (const path of listPageFiles(root)) {
  const file = join(root, path)
  const page = JSON.parse(readFileSync(file, 'utf8'))
  let changed = false
  for (const entry of page.english)
    entry.exampleSentences = entry.exampleSentences.map((sentence: Record<string, unknown>) => {
      if (typeof sentence.id === 'string') return sentence
      const id = newId(taken)
      taken.add(id)
      minted++
      changed = true
      return { id, ...sentence }
    })
  if (changed) writeFileSync(file, JSON.stringify(page, null, 2) + '\n')
}
console.log(`minted ${minted} sentence ids`)
