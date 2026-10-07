// Tests for shown-text.ts: the note and placeholder-letter rules on their own,
// with whole arrays asserted. Run with `pnpm run test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { noteProblems, placeholderLetters } from './shown-text.ts'

test('a clean note has no problems', () => {
  assert.deepStrictEqual(noteProblems('Used when you agree to something.', 'accept', 'agree to'), [])
})

test('"slice" on a row not about slices is a problem', () => {
  assert.deepStrictEqual(
    noteProblems('Use it for the slice of accept meaning believe that something is true.', 'accept', 'believe'),
    [`note says "slice" on a row that is not about slices`],
  )
})

test('"slice" is allowed when the term is about slices', () => {
  assert.deepStrictEqual(noteProblems('A slice of bread.', 'slice', 'a thin piece'), [])
})

test('a numbered sense is a problem', () => {
  assert.deepStrictEqual(
    noteProblems('This is the servile side of sense 2 rather than the plain one.', 'serve', 'work for'),
    [`note points at a numbered sense ("sense 2")`],
  )
})

test('calling itself part of a meaning is a problem', () => {
  assert.deepStrictEqual(noteProblems('This is the formal side of the sense.', 'accept', 'agree to'), [
    `note calls itself part of a meaning ("side of the sense")`,
  ])
})

test("pointing at the generator's example is a problem", () => {
  assert.deepStrictEqual(noteProblems('Used as in the example.', 'accept', 'agree to'), [
    `note points at the generator's example ("the example")`,
  ])
})

test('placeholder letters are found', () => {
  assert.deepStrictEqual(placeholderLetters('Please A, help B.'), ['A', 'B'])
})

test('a sentence-initial article "A" is not a placeholder', () => {
  assert.deepStrictEqual(placeholderLetters('A dog barked.'), [])
})

test('a letter after a word that takes one is not a placeholder', () => {
  assert.deepStrictEqual(placeholderLetters('I like plan B.'), [])
})
