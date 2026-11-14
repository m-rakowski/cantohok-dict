import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mintMissingIds } from './mint-missing-ids.ts'
import type { PageFile } from './types.ts'

const salty: PageFile = {
  id: '1775uj8d',
  partOfSpeech: 'noun',
  meaning: 'fried dumpling filled with pork (dim sum)',
  english: [
    { word: 'fried dumpling', meaning: 'fried dumpling filled with pork (dim sum)', exampleSentences: [] },
    { word: 'ham sui gok', meaning: 'fried dumpling filled with pork (dim sum)', exampleSentences: [] },
  ],
  traditional: '鹹水角',
  jyutping: 'haam4 seoi2 gok3',
}

test('gives each id-less entry an id as its first key and leaves the rest alone', () => {
  const taken = new Set(['1775uj8d'])
  const { page, minted } = mintMissingIds(salty, taken)
  assert.equal(minted.length, 2)
  assert.deepStrictEqual(page, {
    ...salty,
    english: [
      { id: minted[0], ...salty.english[0] },
      { id: minted[1], ...salty.english[1] },
    ],
  })
  page.english.forEach(entry => assert.equal(Object.keys(entry)[0], 'id'))
  assert.deepStrictEqual(taken, new Set(['1775uj8d', ...minted]))
})

test('a page whose entries all have ids comes back unchanged', () => {
  const full: PageFile = { ...salty, english: salty.english.map((e, i) => ({ id: `abcdefg${i}`, ...e })) }
  const taken = new Set(['1775uj8d', 'abcdefg0', 'abcdefg1'])
  assert.deepStrictEqual(mintMissingIds(full, taken), { page: full, minted: [] })
  assert.equal(taken.size, 3)
})

test('re-rolls an id that is already taken', () => {
  let calls = 0
  const random = (): number => (calls++ < 8 ? 0 : 1)
  const one: PageFile = { ...salty, english: [salty.english[0]] }
  const { minted } = mintMissingIds(one, new Set(['aaaaaaaa']), random)
  assert.deepStrictEqual(minted, ['bbbbbbbb'])
})
