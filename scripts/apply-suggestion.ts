// Applies an accepted "Suggest a change" to the dictionary: a JSON list of
// field edits, each naming a row by id, the field, the value it must
// currently have (`from`) and the new value (`to`). Everything is checked
// first; if any edit is refused, no file is written. Run it with
// `pnpm run apply-suggestion edits.json` (or pipe the JSON on stdin), then
// `pnpm run format && pnpm run check`.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { listWordFiles } from './repo.ts'
import type { Example, Row, WordFile } from './types.ts'

export type RowEditField =
  'traditional' | 'jyutping' | 'meaning' | 'note' | 'example.traditional' | 'example.jyutping' | 'example.english'

export interface RowEdit {
  id: string
  /** Informational only; rows are found by id. */
  word: string
  field: RowEditField
  from: string
  to: string
}

export type ApplyResult = { ok: true; files: string[] } | { ok: false; problems: string[] }

const ROW_FIELDS = ['traditional', 'jyutping', 'meaning', 'note'] as const
const EXAMPLE_FIELDS = ['traditional', 'jyutping', 'english'] as const

function isAllowedField(field: string): field is RowEditField {
  return (
    (ROW_FIELDS as readonly string[]).includes(field) ||
    (EXAMPLE_FIELDS as readonly string[]).some(part => field === `example.${part}`)
  )
}

/** Validates every edit, then writes each touched file. Writes nothing on refusal. */
export function applyEdits(root: string, edits: RowEdit[]): ApplyResult {
  const files = new Map<string, WordFile>()
  const rowsById = new Map<string, { path: string; row: Row }>()
  for (const path of listWordFiles(root)) {
    const file = JSON.parse(readFileSync(join(root, path), 'utf8')) as WordFile
    files.set(path, file)
    for (const row of file.rows) rowsById.set(row.id, { path, row })
  }

  const problems: string[] = []
  const seen = new Set<string>()
  const byRow = new Map<string, RowEdit[]>()
  for (const edit of edits) {
    const label = `${edit.id} (${edit.word}) ${edit.field}`
    if (!isAllowedField(edit.field)) {
      problems.push(`${label}: field is not editable`)
      continue
    }
    if (!rowsById.has(edit.id)) {
      problems.push(`${label}: no row with this id`)
      continue
    }
    if (seen.has(`${edit.id}\0${edit.field}`)) {
      problems.push(`${label}: edited more than once`)
      continue
    }
    seen.add(`${edit.id}\0${edit.field}`)
    byRow.set(edit.id, [...(byRow.get(edit.id) ?? []), edit])
  }

  const touched = new Set<string>()
  for (const [id, rowEdits] of byRow) {
    const { path, row } = rowsById.get(id)!
    const exampleEdits = rowEdits.filter(e => e.field.startsWith('example.'))
    if (!row.example && exampleEdits.length > 0 && exampleEdits.length < EXAMPLE_FIELDS.length) {
      problems.push(`${id} (${rowEdits[0].word}): example needs traditional, jyutping and english`)
      continue
    }
    const rowProblems: string[] = []
    for (const edit of rowEdits) {
      const current = currentValue(row, edit.field)
      if (current !== edit.from) {
        rowProblems.push(
          `${edit.id} (${edit.word}) ${edit.field}: expected ${JSON.stringify(edit.from)} but the row has ${JSON.stringify(current)}`,
        )
      }
    }
    if (rowProblems.length > 0) {
      problems.push(...rowProblems)
      continue
    }
    for (const edit of rowEdits) setValue(row, edit.field, edit.to)
    touched.add(path)
  }

  if (problems.length > 0) return { ok: false, problems }

  const written = [...touched].sort()
  for (const path of written) {
    writeFileSync(join(root, path), JSON.stringify(files.get(path), null, 2) + '\n')
  }
  return { ok: true, files: written }
}

/** The field's current value; an absent note or example part counts as "". */
function currentValue(row: Row, field: RowEditField): string {
  if (field.startsWith('example.')) {
    return row.example?.[field.slice('example.'.length) as keyof Example] ?? ''
  }
  return (row[field as (typeof ROW_FIELDS)[number]] as string | undefined) ?? ''
}

function setValue(row: Row, field: RowEditField, value: string): void {
  if (field.startsWith('example.')) {
    row.example ??= { english: '', traditional: '', jyutping: '' }
    row.example[field.slice('example.'.length) as keyof Example] = value
  } else {
    row[field as (typeof ROW_FIELDS)[number]] = value
  }
}

if (import.meta.main) {
  const arg = process.argv[2]
  const edits = JSON.parse(readFileSync(arg ?? 0, 'utf8')) as RowEdit[]
  const result = applyEdits(process.cwd(), edits)
  if (!result.ok) {
    console.error('Refused; nothing was changed:')
    for (const problem of result.problems) console.error(`- ${problem}`)
    process.exit(1)
  }
  console.log(`Updated ${result.files.length} file(s):`)
  for (const file of result.files) console.log(`- ${file}`)
  console.log('Next: pnpm run format && pnpm run check')
}
