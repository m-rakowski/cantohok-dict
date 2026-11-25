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

test("a corpus reading that is not its words' readings with the sentence's marks", () => {
  assert.deepEqual(
    checkWith(files => {
      const value = parse(files, HKCANCOR)
      files[HKCANCOR] = line({ ...value, jyutping: value.jyutping.replace('daan6 hai6', 'daan6 hai2') })
    }),
    [
      'corpus/hkcancor/49.jsonl:1: jyutping is not its words\' readings with the sentence\'s marks ("daan6 hai6 go3，nei5 go3 seon4 gou1 bei2 gaau3 cin2 sik1，sam1 et1 et1 siu2 siu2，ngo5 gok3 dak1 ho2 ji5。")',
    ],
  )
  assert.deepEqual(
    checkWith(files => {
      const value = parse(files, HAMBAANGLAANG)
      files[HAMBAANGLAANG] = line({ ...value, words: value.words.slice(1) })
    }),
    ["corpus/hambaanglaang/0a.jsonl:1: words do not cover the text's Han characters, in order"],
  )
})

test("a corpus reading without the sentence's marks, as the source wrote it, is refused", () => {
  assert.deepEqual(
    checkWith(files => {
      files[HAMBAANGLAANG] = line({
        ...parse(files, HAMBAANGLAANG),
        jyutping: 'sap6 ji6 dim2 zung1 cin4 cek1 au1 gaa3',
      })
    }),
    [
      'corpus/hambaanglaang/0a.jsonl:1: jyutping is not its words\' readings with the sentence\'s marks ("sap6 ji6 dim2 zung1 cin4 cek1 au1 gaa3。")',
    ],
  )
})

test('a mark between two words sits flush; a Latin run no word reads is copied as a word', () => {
  assert.deepEqual(
    checkWith(files => {
      const value = parse(files, HAMBAANGLAANG)
      files[HAMBAANGLAANG] = line({
        ...value,
        text: '（十二）點鐘BB前checkout㗎！',
        jyutping: '（sap6 ji6）dim2 zung1 BB cin4 cek1 au1 gaa3！',
      })
    }),
    [],
  )
})

test("marks at the edges of a word's own text are copied too; marks inside it are the word's reading", () => {
  assert.deepEqual(
    checkWith(files => {
      const value = parse(files, HAMBAANGLAANG)
      files[HAMBAANGLAANG] = line({
        ...value,
        text: '打波：「7-11前。」',
        jyutping: 'daa2 bo1：「caat1 sap6 jat1 cin4。」',
        words: [
          { jyutping: 'daa2-bo1', text: '打波：' },
          { jyutping: 'caat1-sap6-jat1', text: '「7-11' },
          { jyutping: 'cin4', text: '前。」' },
        ],
      })
    }),
    [],
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

test('keys out of order are refused even with no spaces', () => {
  assert.deepEqual(
    checkWith(files => {
      const { id, text, ...rest } = parse(files, TATOEBA)
      files[TATOEBA] = `${JSON.stringify({ text, id, ...rest })}\n`
    }),
    ['corpus/tatoeba/08.jsonl:1: not in canonical form (keys sorted, no spaces)'],
  )
})

test('Tatoeba ids sort numerically: 9 before 10 passes, 10 before 9 does not', () => {
  const two = (first: string, second: string) =>
    checkWith(files => {
      const value = parse(files, TATOEBA)
      delete files[TATOEBA]
      files['corpus/tatoeba/aa.jsonl'] = `${line({ ...value, id: first })}${line({ ...value, id: second })}`
    }).filter(error => !error.includes('belongs in'))
  assert.deepEqual(two('9', '10'), [])
  assert.deepEqual(two('10', '9'), ['corpus/tatoeba/aa.jsonl:2: id 9 is out of order after 10'])
})

test('a corpus reading cannot be emptied to null', () => {
  assert.deepEqual(
    checkWith(files => {
      files[HKCANCOR] = line({ ...parse(files, HKCANCOR), jyutping: null })
    }),
    ['corpus/hkcancor/49.jsonl:1: /jyutping must be string'],
  )
})

test('an uppercase syllable is not counted as one', () => {
  assert.deepEqual(
    checkWith(files => {
      files[TATOEBA] = line({ ...parse(files, TATOEBA), jyutping: 'NGO5 DI1 LUNG4 HAI2 BIN1 DOU6 AA3？' })
    }),
    [
      'corpus/tatoeba/08.jsonl:1: jyutping has 0 syllables for 7 (one per Han character, plus each toned Latin run in the text)',
    ],
  )
})

test('an unknown folder under corpus/, a folder inside a source, and an empty English list', () => {
  assert.deepEqual(
    checkWith(files => {
      files['corpus/wiki/00.jsonl'] = 'garbage\n'
      files['corpus/tatoeba/0b.jsonl/x'] = 'x'
      files[TATOEBA] = line({ ...parse(files, TATOEBA), english: [] })
    }),
    [
      'corpus/wiki: not a corpus source (expected README.md or one of tatoeba, hkcancor, hambaanglaang, commonvoice)',
      'corpus/tatoeba/08.jsonl:1: /english must NOT have fewer than 1 items',
      'corpus/tatoeba/0b.jsonl: not a corpus file (expected <two hex digits>.jsonl)',
    ],
  )
})

test('a Hambaanglaang line keeps its gloss and may add one machine translation, and nothing else', () => {
  const withEnglish = (english: { by: string; text: string }[]) => (files: Record<string, string>) => {
    files[HAMBAANGLAANG] = line({ ...parse(files, HAMBAANGLAANG), english })
  }
  const gloss = { by: 'word by word', text: "twelve / o'clock / before / check / out / (particle)" }
  const machine = { by: 'machine', text: "Check out before twelve o'clock." }
  assert.deepEqual(
    [
      checkWith(withEnglish([gloss, machine])),
      checkWith(withEnglish([gloss, { by: 'sadhen', text: 'Check out by noon.' }])),
      checkWith(withEnglish([machine])),
      checkWith(withEnglish([gloss, machine, machine])),
    ],
    [
      [],
      [
        'corpus/hambaanglaang/0a.jsonl:1: /english/1/by must be equal to constant',
        'corpus/hambaanglaang/0a.jsonl:1: /english/1/by must be equal to constant',
        'corpus/hambaanglaang/0a.jsonl:1: /english/1 must match exactly one schema in oneOf',
      ],
      [
        'corpus/hambaanglaang/0a.jsonl:1: /english/0/by must be equal to constant',
        'corpus/hambaanglaang/0a.jsonl:1: /english must contain at least 1 and no more than 1 valid item(s)',
      ],
      ['corpus/hambaanglaang/0a.jsonl:1: /english must NOT have more than 2 items'],
    ],
  )
})
