import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dropPageLevelFields, type OldPage } from './drop-page-level-fields.ts'

const base: OldPage = {
  id: 'aaaa1111',
  partOfSpeech: 'adj',
  meaning: 'strange, odd',
  english: [
    { id: 'bbbb2222', word: 'off', meaning: 'strange, odd', note: 'Use it for food.', exampleSentences: [] },
    { id: 'cccc3333', word: 'funny', exampleSentences: [] },
  ],
  traditional: '唔對路',
  jyutping: 'm4 deoi3 lou6',
}

test('deletes the page meaning, and gives it to an entry that has no meaning of its own', () => {
  assert.deepStrictEqual(dropPageLevelFields(base, {}), {
    id: 'aaaa1111',
    partOfSpeech: 'adj',
    english: [
      { id: 'bbbb2222', word: 'off', meaning: 'strange, odd', note: 'Use it for food.', exampleSentences: [] },
      { id: 'cccc3333', word: 'funny', meaning: 'strange, odd', exampleSentences: [] },
    ],
    traditional: '唔對路',
    jyutping: 'm4 deoi3 lou6',
  })
})

test('deletes the page register and note, and appends a carried note to the named entries only', () => {
  const page: OldPage = { ...base, register: 'colloquial', note: 'Say it twice.' }
  const out = dropPageLevelFields(page, { bbbb2222: 'Say it twice.', cccc3333: 'Say it twice.' })
  assert.deepStrictEqual(out, {
    id: 'aaaa1111',
    partOfSpeech: 'adj',
    english: [
      {
        id: 'bbbb2222',
        word: 'off',
        meaning: 'strange, odd',
        note: 'Use it for food. Say it twice.',
        exampleSentences: [],
      },
      { id: 'cccc3333', word: 'funny', meaning: 'strange, odd', note: 'Say it twice.', exampleSentences: [] },
    ],
    traditional: '唔對路',
    jyutping: 'm4 deoi3 lou6',
  })
})

test('an entry that keeps its own meaning, register and note is unchanged', () => {
  const page: OldPage = {
    ...base,
    register: 'colloquial',
    english: [{ id: 'bbbb2222', word: 'off', meaning: 'odd', register: 'vulgar', note: 'n', exampleSentences: [] }],
  }
  assert.deepStrictEqual(dropPageLevelFields(page, {}).english, page.english)
})
