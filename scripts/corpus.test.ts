import { strict as assert } from 'node:assert'
import test from 'node:test'
import { checkCorpus, lineFile } from './corpus.ts'
import { validFixture, writeTree } from './test-helpers.ts'

const TATOEBA = 'corpus/tatoeba/08.jsonl'
const HKCANCOR = 'corpus/hkcancor/49.jsonl'
const HAMBAANGLAANG = 'corpus/hambaanglaang/0a.jsonl'

const parse = (files: Record<string, string>, path: string) => JSON.parse(files[path] as string)
const line = (value: unknown) => `${JSON.stringify(value)}\n`

function checkWith(change: (files: Record<string, string>) => void): string[] {
  const files = validFixture()
  change(files)
  return checkCorpus(writeTree(files))
}

test('the fixture lines pass, a digit-and-Latin HKCanCor line and a Latin Hambaanglaang word included', () => {
  assert.deepEqual(
    checkWith(() => {}),
    [],
  )
})

test('a line in the wrong file', () => {
  assert.deepEqual(
    checkWith(files => {
      files['corpus/tatoeba/ff.jsonl'] = files[TATOEBA] as string
      delete files[TATOEBA]
    }),
    [`corpus/tatoeba/ff.jsonl:1: id 1792543 belongs in corpus/${lineFile('tatoeba', '1792543')}`],
  )
})

test('a line not written in canonical form', () => {
  assert.deepEqual(
    checkWith(files => {
      files[TATOEBA] = `${JSON.stringify(parse(files, TATOEBA), null, 1).replaceAll('\n', '')}\n`
    }),
    ['corpus/tatoeba/08.jsonl:1: not in canonical form (keys sorted, no spaces)'],
  )
})

test('a duplicate id, and ids out of order', () => {
  assert.deepEqual(
    checkWith(files => {
      files[TATOEBA] = `${files[TATOEBA]}${files[TATOEBA]}`
    }),
    [
      'corpus/tatoeba/08.jsonl:2: duplicate id 1792543',
      'corpus/tatoeba/08.jsonl:2: id 1792543 is out of order after 1792543',
    ],
  )
})

test('a Tatoeba line without its author key, and an unknown field', () => {
  assert.deepEqual(
    checkWith(files => {
      const { author: _author, ...rest } = parse(files, TATOEBA)
      files[TATOEBA] = line({ ...rest, audio: 'x.mp3' })
    }),
    [
      "corpus/tatoeba/08.jsonl:1: (root) must have required property 'author'",
      'corpus/tatoeba/08.jsonl:1: (root) must NOT have additional properties "audio"',
    ],
  )
})

test('a generated reading short of the Han characters', () => {
  assert.deepEqual(
    checkWith(files => {
      files[TATOEBA] = line({ ...parse(files, TATOEBA), jyutping: 'ngo5 di1 lung4 hai2 bin1 dou6？' })
    }),
    [
      'corpus/tatoeba/08.jsonl:1: jyutping has 6 syllables for 7 (one per Han character, plus each toned Latin run in the text)',
    ],
  )
})

test('a toned Latin run the text itself contains counts once', () => {
  assert.deepEqual(
    checkWith(files => {
      files[TATOEBA] = line({ ...parse(files, TATOEBA), text: '我住c5。', jyutping: 'ngo5 zyu6 c5。' })
    }),
    [],
  )
})

test('a null reading is allowed', () => {
  assert.deepEqual(
    checkWith(files => {
      files[TATOEBA] = line({ ...parse(files, TATOEBA), jyutping: null })
    }),
    [],
  )
})

test("a corpus reading that is not its words' readings joined", () => {
  assert.deepEqual(
    checkWith(files => {
      const value = parse(files, HKCANCOR)
      files[HKCANCOR] = line({ ...value, jyutping: value.jyutping.replace('daan6 hai6', 'daan6 hai2') })
    }),
    [
      'corpus/hkcancor/49.jsonl:1: jyutping is not its words\' readings joined ("daan6 hai6 go3 nei5 go3 seon4 gou1 bei2 gaau3 cin2 sik1 sam1 et1 et1 siu2 siu2 ngo5 gok3 dak1 ho2 ji5")',
    ],
  )
  assert.deepEqual(
    checkWith(files => {
      const value = parse(files, HAMBAANGLAANG)
      files[HAMBAANGLAANG] = line({ ...value, words: value.words.slice(1) })
    }),
    ['corpus/hambaanglaang/0a.jsonl:1: jyutping is not its words\' readings joined ("dim2 zung1 cin4 cek1 au1 gaa3")'],
  )
})

test('a missing LICENSE, a stray file, and a file without its last newline', () => {
  assert.deepEqual(
    checkWith(files => {
      delete files['corpus/hkcancor/LICENSE']
      files['corpus/hkcancor/notes.txt'] = 'x'
      files[TATOEBA] = (files[TATOEBA] as string).trimEnd()
    }),
    [
      'corpus/tatoeba/08.jsonl: does not end with a newline',
      'corpus/hkcancor/LICENSE: missing',
      'corpus/hkcancor/notes.txt: not a corpus file (expected <two hex digits>.jsonl)',
    ],
  )
})
