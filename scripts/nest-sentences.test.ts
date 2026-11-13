import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nestPage, nestSentences, ownerIndex } from './nest-sentences.ts'

const ex = (english: string, traditional = '例', jyutping = 'lai6') => ({ english, traditional, jyutping })
const oldPage = (words: string[], examples: ReturnType<typeof ex>[]) => ({
  id: 'ppppppp1',
  partOfSpeech: 'noun',
  meaning: 'm',
  english: words.map(word => ({ word })),
  traditional: '字',
  jyutping: 'zi6',
  examples,
})

test('ownerIndex: own position wins, then the first word it contains, then its position, then the last word', () => {
  assert.equal(ownerIndex('A cab ride', ['taxi', 'cab'], 1), 1)
  assert.equal(ownerIndex('A cab ride', ['cab', 'taxi'], 1), 0)
  assert.equal(ownerIndex('Nothing here', ['cab', 'taxi'], 1), 1)
  assert.equal(ownerIndex('Nothing here', ['cab', 'taxi'], 5), 1)
  assert.equal(ownerIndex('The CAB.', ['cab'], 0), 0)
  assert.equal(ownerIndex('A cabbage', ['cab'], 0), 0)
})

test('唔對路: funny owns the sentence; off and strange have none', () => {
  const sentence = ex(
    'That smell seems funny.',
    '嗰陣味聞落有啲唔對路。',
    'go2 zan6 mei6 man4 lok6 jau5 di1 m4 deoi3 lou6',
  )
  const page = nestPage(oldPage(['off', 'funny', 'strange'], [sentence]))
  assert.deepStrictEqual(page, {
    id: 'ppppppp1',
    partOfSpeech: 'noun',
    meaning: 'm',
    english: [
      { word: 'off', exampleSentences: [] },
      { word: 'funny', exampleSentences: [sentence] },
      { word: 'strange', exampleSentences: [] },
    ],
    traditional: '字',
    jyutping: 'zi6',
  })
})

test('大麻: each word owns the sentence that names it; weed gets a copy of the marijuana (weed) one', () => {
  const herb = ex('Someone was secretly smoking herb in the back alley.')
  const marijuana = ex('In Hong Kong, marijuana (weed) is an illegal drug.')
  const pot = ex('They tried pot at the party.')
  const page = nestPage(oldPage(['marijuana', 'herb', 'weed', 'pot'], [herb, marijuana, pot]))
  assert.deepStrictEqual(
    page.english.map(entry => entry.exampleSentences),
    [[marijuana], [herb], [marijuana], [pot]],
  )
})

test('賓周: willy owns both sentences, in file order', () => {
  const first = ex('He got kicked in the willy and can not stand up straight.')
  const second = ex('He got hit in the willy by the ball.')
  const page = nestPage(oldPage(['willy'], [first, second]))
  assert.deepStrictEqual(page.english, [{ word: 'willy', exampleSentences: [first, second] }])
})

test('好: word i owns sentence i for every one of 26 words', () => {
  const words = Array.from({ length: 26 }, (_, i) => `w${String.fromCharCode(97 + i)}`)
  const sentences = words.map(word => ex(`This sentence has ${word} in it.`))
  const page = nestPage(oldPage(words, sentences))
  assert.deepStrictEqual(
    page.english.map(entry => entry.exampleSentences),
    sentences.map(sentence => [sentence]),
  )
})

test('3D打印機: no sentences gives an empty list on the word and no examples key', () => {
  const page = nestPage(oldPage(['printer'], []))
  assert.deepStrictEqual(page.english, [{ word: 'printer', exampleSentences: [] }])
  assert.equal('examples' in page, false)
})

test('安全套: condom owns the sentence and rubber gets a copy', () => {
  const sentence = ex('Before doing that, remember to wear a condom (a rubber).')
  assert.deepStrictEqual(nestSentences(['condom', 'rubber'], [sentence]), [[sentence], [sentence]])
})

test('a word that no sentence names stays empty', () => {
  const sentence = ex('That smell seems funny.')
  assert.deepStrictEqual(nestSentences(['off', 'funny'], [sentence]), [[], [sentence]])
})

test('a sentence past the last word goes to the last word', () => {
  const first = ex('One willy.')
  const second = ex('Second sentence without it.')
  assert.deepStrictEqual(nestSentences(['willy'], [first, second]), [[first, second]])
})
