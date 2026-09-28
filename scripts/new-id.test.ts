// Tests for new-id.ts: checks a fresh id has the right shape, and that a
// collision with an already-used id makes it try again. Run with
// `pnpm run test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newId } from './new-id.ts'
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
