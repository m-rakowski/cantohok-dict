// Tests for apply-suggestion.ts: a whole accepted suggestion is applied, or
// nothing is touched. Run with `pnpm run test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { applyEdits, type RowEdit } from './apply-suggestion.ts'
import { listWordFiles } from './repo.ts'
import { validFixture, writeTree } from './test-helpers.ts'

const read = (root: string, path: string) => readFileSync(join(root, path), 'utf8')
const readFileJson = (root: string, path: string) => JSON.parse(read(root, path))
/** Every word file's bytes, to prove a refusal changed nothing. */
const snapshot = (root: string) => Object.fromEntries(listWordFiles(root).map(p => [p, read(root, p)]))

const CAB_ROW_1 = {
  id: 'aaaaaaa1',
  partOfSpeech: 'noun',
  meaning: 'taxi',
  traditional: '的士',
  jyutping: 'dik1 si2',
  note: 'This is the all-purpose Cantonese noun for a taxi or cab.',
  example: {
    english: 'We called a cab to the airport.',
    traditional: '我哋叫咗部的士去機場。',
    jyutping: 'ngo5 dei6 giu3 zo2 bou6 dik1 si2 heoi3 gei1 coeng4',
  },
}
const CAB_ROW_2 = {
  id: 'aaaaaaa2',
  partOfSpeech: 'noun',
  meaning: 'taxi',
  traditional: '車頭',
  jyutping: 'ce1 tau4',
  register: 'colloquial',
  note: 'Use this colloquial term for the cab or front section of a truck.',
}
const THURSDAY_ROW = {
  id: 'bbbbbbb1',
  partOfSpeech: 'noun',
  meaning: 'day of the week',
  traditional: '星期四',
  jyutping: 'sing1 kei4 sei3',
  note: 'This is the all-purpose word for Thursday.',
}
const rowsOf = (root: string, path: string) => readFileJson(root, path).rows

function expectRefused(edits: unknown, problems: string[], files: Record<string, string> = validFixture()) {
  const root = writeTree(files)
  const before = snapshot(root)
  assert.deepStrictEqual(applyEdits(root, edits), { ok: false, problems })
  assert.deepStrictEqual(snapshot(root), before)
}

test('applies a meaning edit and changes nothing else', () => {
  const root = writeTree(validFixture())
  const result = applyEdits(root, [{ id: 'aaaaaaa1', word: 'cab', field: 'meaning', from: 'taxi', to: 'taxicab' }])
  assert.deepStrictEqual(result, { ok: true, files: ['words/c/cab.json'] })
  assert.deepStrictEqual(rowsOf(root, 'words/c/cab.json'), [{ ...CAB_ROW_1, meaning: 'taxicab' }, CAB_ROW_2])
  assert.deepStrictEqual(rowsOf(root, 'words/t/Thursday.json'), [THURSDAY_ROW])
  assert.ok(read(root, 'words/c/cab.json').endsWith('}\n'))
})

test('applies six jyutping edits across six files', () => {
  const files: Record<string, string> = {}
  const edits: RowEdit[] = []
  const terms = ['ant', 'bee', 'cat', 'dog', 'eel', 'fox']
  const rowFor = (i: number, jyutping: string) => ({
    id: `zzzzzzz${i}`,
    partOfSpeech: 'noun',
    meaning: terms[i],
    traditional: '字',
    jyutping,
    note: 'n',
  })
  for (const [i, term] of terms.entries()) {
    files[`words/${term[0]}/${term}.json`] = JSON.stringify({ term, rows: [rowFor(i, 'old')] })
    edits.push({ id: `zzzzzzz${i}`, word: term, field: 'jyutping', from: 'old', to: `new${i}` })
  }
  const root = writeTree(files)
  assert.deepStrictEqual(applyEdits(root, edits), { ok: true, files: Object.keys(files).sort() })
  for (const [i, term] of terms.entries()) {
    assert.deepStrictEqual(readFileJson(root, `words/${term[0]}/${term}.json`), {
      term,
      rows: [rowFor(i, `new${i}`)],
    })
  }
})

test('a stale from refuses everything, naming id and field', () => {
  expectRefused(
    [
      { id: 'bbbbbbb1', word: 'Thursday', field: 'meaning', from: 'day', to: 'weekday' },
      { id: 'aaaaaaa1', word: 'cab', field: 'meaning', from: 'taxi', to: 'taxicab' },
    ],
    ['bbbbbbb1 (Thursday) meaning: expected "day" but the row has "day of the week"'],
  )
})

test('an unknown id is refused', () => {
  expectRefused(
    [{ id: 'nope0000', word: 'cab', field: 'meaning', from: 'a', to: 'b' }],
    ['nope0000 (cab) meaning: no row with this id'],
  )
})

test('an id that matches more than one row is refused, naming both files', () => {
  const files = validFixture()
  files['words/d/dup.json'] = JSON.stringify({ term: 'dup', rows: [{ ...THURSDAY_ROW }] })
  expectRefused(
    [{ id: 'bbbbbbb1', word: 'Thursday', field: 'meaning', from: 'day of the week', to: 'x' }],
    ['bbbbbbb1 (Thursday) meaning: id matches 2 rows (words/d/dup.json, words/t/Thursday.json)'],
    files,
  )
})

test('a note edit with from "" sets a note where the key is absent', () => {
  const fixture = validFixture()
  fixture['words/t/Thursday.json'] = JSON.stringify({
    term: 'Thursday',
    rows: [{ ...THURSDAY_ROW, note: undefined }],
  })
  const root = writeTree(fixture)
  const result = applyEdits(root, [{ id: 'bbbbbbb1', word: 'Thursday', field: 'note', from: '', to: 'A note.' }])
  assert.deepStrictEqual(result, { ok: true, files: ['words/t/Thursday.json'] })
  assert.deepStrictEqual(rowsOf(root, 'words/t/Thursday.json'), [{ ...THURSDAY_ROW, note: 'A note.' }])
})

test('a note edit with to "" deletes the note key', () => {
  const root = writeTree(validFixture())
  const result = applyEdits(root, [{ id: 'aaaaaaa2', word: 'cab', field: 'note', from: CAB_ROW_2.note, to: '' }])
  assert.deepStrictEqual(result, { ok: true, files: ['words/c/cab.json'] })
  const { note: _removed, ...withoutNote } = CAB_ROW_2
  assert.deepStrictEqual(rowsOf(root, 'words/c/cab.json'), [CAB_ROW_1, withoutNote])
})

test('example.english alone on a row with no example is refused', () => {
  expectRefused(
    [{ id: 'aaaaaaa2', word: 'cab', field: 'example.english', from: '', to: 'A cab.' }],
    ['aaaaaaa2 (cab): example needs traditional, jyutping and english'],
  )
})

test('all three example parts create an example on a row that has none', () => {
  const root = writeTree(validFixture())
  const result = applyEdits(root, [
    { id: 'aaaaaaa2', word: 'cab', field: 'example.english', from: '', to: 'A cab.' },
    { id: 'aaaaaaa2', word: 'cab', field: 'example.traditional', from: '', to: '的士。' },
    { id: 'aaaaaaa2', word: 'cab', field: 'example.jyutping', from: '', to: 'dik1 si2' },
  ])
  assert.deepStrictEqual(result, { ok: true, files: ['words/c/cab.json'] })
  assert.deepStrictEqual(rowsOf(root, 'words/c/cab.json'), [
    CAB_ROW_1,
    { ...CAB_ROW_2, example: { english: 'A cab.', traditional: '的士。', jyutping: 'dik1 si2' } },
  ])
})

test('one example part edited on a row that has an example keeps the other two', () => {
  const root = writeTree(validFixture())
  const result = applyEdits(root, [
    { id: 'aaaaaaa1', word: 'cab', field: 'example.english', from: CAB_ROW_1.example.english, to: 'New.' },
  ])
  assert.deepStrictEqual(result, { ok: true, files: ['words/c/cab.json'] })
  assert.deepStrictEqual(rowsOf(root, 'words/c/cab.json'), [
    { ...CAB_ROW_1, example: { ...CAB_ROW_1.example, english: 'New.' } },
    CAB_ROW_2,
  ])
})

test('a field outside the allow-list is refused', () => {
  expectRefused(
    [{ id: 'aaaaaaa1', word: 'cab', field: 'id' as never, from: 'aaaaaaa1', to: 'hacked00' }],
    ['aaaaaaa1 (cab) id: field is not editable'],
  )
})

test('two edits to the same field of the same row are refused', () => {
  expectRefused(
    [
      { id: 'aaaaaaa1', word: 'cab', field: 'meaning', from: 'taxi', to: 'a' },
      { id: 'aaaaaaa1', word: 'cab', field: 'meaning', from: 'taxi', to: 'b' },
    ],
    ['aaaaaaa1 (cab) meaning: edited more than once'],
  )
})

for (const field of [
  'traditional',
  'jyutping',
  'meaning',
  'example.traditional',
  'example.jyutping',
  'example.english',
] as const) {
  test(`to "  " is refused for ${field}`, () => {
    const from = field.startsWith('example.')
      ? CAB_ROW_1.example[field.slice(8) as 'english']
      : CAB_ROW_1[field as 'meaning']
    expectRefused(
      [{ id: 'aaaaaaa1', word: 'cab', field, from, to: '  ' }],
      [`aaaaaaa1 (cab) ${field}: new value must not be empty`],
    )
  })
}

test('input that is not an array of exact string edits is refused, not thrown on', () => {
  const shapeMsg = (i: number) => `edit ${i}: must be an object with exactly string id, word, field, from, to`
  expectRefused({ id: 'aaaaaaa1' }, ['input must be a JSON array of edits'])
  expectRefused(null, ['input must be a JSON array of edits'])
  expectRefused(
    [
      null,
      'x',
      { id: 'aaaaaaa1', word: 'cab', field: 'meaning', from: 'taxi' },
      { id: 'aaaaaaa1', word: 'cab', field: 'meaning', from: 'taxi', to: 'a', extra: 'x' },
      { id: 'aaaaaaa1', word: 'cab', field: 'meaning', from: 'taxi', to: 5 },
    ],
    [0, 1, 2, 3, 4].map(i => shapeMsg(i)),
  )
})
