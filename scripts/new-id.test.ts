// Tests for new-id.ts: checks a fresh id has the right shape, and that a
// collision with an already-used id makes it try again. Run with
// `pnpm run test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectTakenIds, newId } from './new-id.ts'
import { writeTree } from './test-helpers.ts'
import { ID_PATTERN } from './types.ts'

test('newId returns an 8-character [a-z0-9] id', () => {
  const id = newId(new Set())
  assert.match(id, ID_PATTERN)
})

test('newId re-rolls when the injected random source produces a taken id first', () => {
  // 8 calls spell "aaaaaaaa" (index 0 every time) — taken, must be rejected —
  // then 8 more spell "bbbbbbbb" (index 1 every time) — fresh, must be returned.
  const sequence = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1]
  let i = 0
  const random = (max: number) => {
    assert.equal(max, 36)
    return sequence[i++]
  }
  const id = newId(new Set(['aaaaaaaa']), random)
  assert.equal(id, 'bbbbbbbb')
  assert.equal(i, sequence.length)
})

test('collectTakenIds includes page ids', () => {
  const root = writeTree({
    'words/c/cab.json': JSON.stringify({ term: 'cab', rows: [{ id: 'aaaaaaa1' }] }),
    'cantonese/的士_noun.json': JSON.stringify({
      id: 'cccccccc',
      traditional: '的士',
      partOfSpeech: 'noun',
      boxes: [],
    }),
  })
  assert.deepEqual(collectTakenIds(root), new Set(['aaaaaaa1', 'cccccccc']))
})

test('collectTakenIds skips a page file that is not valid JSON, or has no string id', () => {
  const root = writeTree({
    'words/c/cab.json': JSON.stringify({ term: 'cab', rows: [{ id: 'aaaaaaa1' }] }),
    'cantonese/壞.json': '{ not json',
    'cantonese/冇.json': JSON.stringify({ traditional: '冇' }),
    'cantonese/空.json': 'null',
  })
  assert.deepEqual(collectTakenIds(root), new Set(['aaaaaaa1']))
})
