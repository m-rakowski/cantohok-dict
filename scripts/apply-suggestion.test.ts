// Tests for apply-suggestion.ts: a whole accepted suggestion is applied, or
// nothing is touched. Run with `pnpm run test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { applyEdits, type RowEdit } from './apply-suggestion.ts'
import { validFixture, writeTree } from './test-helpers.ts'

const read = (root: string, path: string) => readFileSync(join(root, path), 'utf8')
const readRow = (root: string, path: string, id: string) =>
  JSON.parse(read(root, path)).rows.find((r: { id: string }) => r.id === id)

test('applies a meaning edit and changes nothing else on the row', () => {
  const root = writeTree(validFixture())
  const edit: RowEdit = { id: 'aaaaaaa1', word: 'cab', field: 'meaning', from: 'taxi', to: 'taxicab' }
  const result = applyEdits(root, [edit])
  assert.deepStrictEqual(result, { ok: true, files: ['words/c/cab.json'] })
  assert.deepStrictEqual(readRow(root, 'words/c/cab.json', 'aaaaaaa1'), {
    id: 'aaaaaaa1',
    partOfSpeech: 'noun',
    meaning: 'taxicab',
    traditional: '的士',
    jyutping: 'dik1 si2',
    note: 'This is the all-purpose Cantonese noun for a taxi or cab.',
    example: {
      english: 'We called a cab to the airport.',
      traditional: '我哋叫咗部的士去機場。',
      jyutping: 'ngo5 dei6 giu3 zo2 bou6 dik1 si2 heoi3 gei1 coeng4',
    },
  })
  assert.equal(readRow(root, 'words/c/cab.json', 'aaaaaaa2').meaning, 'taxi')
  assert.ok(read(root, 'words/c/cab.json').endsWith('}\n'))
})

test('applies six jyutping edits across six files', () => {
  const files: Record<string, string> = {}
  const edits: RowEdit[] = []
  for (const [i, term] of ['ant', 'bee', 'cat', 'dog', 'eel', 'fox'].entries()) {
    const id = `zzzzzzz${i}`
    files[`words/${term[0]}/${term}.json`] = JSON.stringify({
      term,
      rows: [{ id, partOfSpeech: 'noun', meaning: term, traditional: '字', jyutping: 'old', note: 'n' }],
    })
    edits.push({ id, word: term, field: 'jyutping', from: 'old', to: `new${i}` })
  }
  const root = writeTree(files)
  const result = applyEdits(root, edits)
  assert.deepStrictEqual(result, { ok: true, files: Object.keys(files).sort() })
  for (const [i, term] of ['ant', 'bee', 'cat', 'dog', 'eel', 'fox'].entries()) {
    assert.equal(readRow(root, `words/${term[0]}/${term}.json`, `zzzzzzz${i}`).jyutping, `new${i}`)
  }
})

test('a stale from refuses everything, names id and field, and leaves every file byte-identical', () => {
  const root = writeTree(validFixture())
  const before = [read(root, 'words/c/cab.json'), read(root, 'words/t/Thursday.json')]
  const result = applyEdits(root, [
    { id: 'bbbbbbb1', word: 'Thursday', field: 'meaning', from: 'day', to: 'weekday' },
    { id: 'aaaaaaa1', word: 'cab', field: 'meaning', from: 'taxi', to: 'taxicab' },
  ])
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.problems.length, 1)
  assert.match(result.problems[0], /bbbbbbb1/)
  assert.match(result.problems[0], /meaning/)
  assert.deepStrictEqual([read(root, 'words/c/cab.json'), read(root, 'words/t/Thursday.json')], before)
})

test('an unknown id is refused', () => {
  const root = writeTree(validFixture())
  const result = applyEdits(root, [{ id: 'nope0000', word: 'cab', field: 'meaning', from: 'a', to: 'b' }])
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.match(result.problems[0], /nope0000/)
})

test('a note edit with from "" sets a note on a row where the key is absent', () => {
  const fixture = validFixture()
  fixture['words/t/Thursday.json'] = fixture['words/t/Thursday.json'].replace(/,\n\s+"note": "[^"]*"/, '')
  const root = writeTree(fixture)
  assert.equal('note' in readRow(root, 'words/t/Thursday.json', 'bbbbbbb1'), false)
  const result = applyEdits(root, [{ id: 'bbbbbbb1', word: 'Thursday', field: 'note', from: '', to: 'A note.' }])
  assert.equal(result.ok, true)
  assert.equal(readRow(root, 'words/t/Thursday.json', 'bbbbbbb1').note, 'A note.')
})

test('example.english on a row with no example, without the other two parts, is refused', () => {
  const root = writeTree(validFixture())
  const before = read(root, 'words/c/cab.json')
  const result = applyEdits(root, [{ id: 'aaaaaaa2', word: 'cab', field: 'example.english', from: '', to: 'A cab.' }])
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.match(result.problems[0], /example needs traditional, jyutping and english/)
  assert.equal(read(root, 'words/c/cab.json'), before)
})

test('all three example parts create an example on a row that has none', () => {
  const root = writeTree(validFixture())
  const result = applyEdits(root, [
    { id: 'aaaaaaa2', word: 'cab', field: 'example.english', from: '', to: 'A cab.' },
    { id: 'aaaaaaa2', word: 'cab', field: 'example.traditional', from: '', to: '的士。' },
    { id: 'aaaaaaa2', word: 'cab', field: 'example.jyutping', from: '', to: 'dik1 si2' },
  ])
  assert.equal(result.ok, true)
  assert.deepStrictEqual(readRow(root, 'words/c/cab.json', 'aaaaaaa2').example, {
    english: 'A cab.',
    traditional: '的士。',
    jyutping: 'dik1 si2',
  })
})

test('a field outside the allow-list is refused', () => {
  const root = writeTree(validFixture())
  const result = applyEdits(root, [
    { id: 'aaaaaaa1', word: 'cab', field: 'id' as never, from: 'aaaaaaa1', to: 'hacked00' },
  ])
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.match(result.problems[0], /id/)
  assert.equal(readRow(root, 'words/c/cab.json', 'aaaaaaa1').id, 'aaaaaaa1')
})

test('two edits to the same field of the same row are refused', () => {
  const root = writeTree(validFixture())
  const result = applyEdits(root, [
    { id: 'aaaaaaa1', word: 'cab', field: 'meaning', from: 'taxi', to: 'a' },
    { id: 'aaaaaaa1', word: 'cab', field: 'meaning', from: 'taxi', to: 'b' },
  ])
  assert.equal(result.ok, false)
})
