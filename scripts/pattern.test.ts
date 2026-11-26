// Tests for pattern.ts: the shape of a pattern headword, attack list first. Run with `pnpm run test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { patternProblem } from './pattern.ts'

const PLUS = 'a "+" in the headword: write a slot as "…" and join the rest (同…作對)'
const DOTS = '"..." in the headword or reading: write a slot as one "…" (U+2026)'
const EDGE = 'a "…" at the start or end of the headword: leave an edge slot out (百分之, not 百分之…)'
const DOUBLE = 'two "…" in a row: one "…" is one slot'
const SPACE = 'a space in the headword: join its pieces (同…作對)'

test('every shape a pattern headword must not have is refused', () => {
  const cases: [string, string, string][] = [
    ['唔再 + V', 'm4 zoi3 V', PLUS],
    ['一＋跳', 'jat1 tiu3', PLUS],
    ['邊個…都...', 'bin1 go3 … dou1', DOTS],
    ['邊個…都', 'bin1 go3 … dou1 ...', DOTS],
    ['…先', '… sin1', EDGE],
    ['直到…', 'zik6 dou3 …', EDGE],
    ['直到……先', 'zik6 dou3 … … sin1', DOUBLE],
    ['直到 …先', 'zik6 dou3 … sin1', SPACE],
    ['的士 嘅', 'dik1 si2 ge3', SPACE],
    [
      '直到…先',
      'zik6 dou3 sin1',
      'the reading has 0 "…" and the headword 1: put one in the reading where the headword has it',
    ],
    ['直到…先', 'zik6 … dou3 sin1', 'the piece 直到 has 2 Han characters and 1 syllable in the reading'],
    ['直到…先', 'zik6 dou3 … sin1 sin1', 'the piece 先 has 1 Han character and 2 syllables in the reading'],
    [
      '直到先',
      'zik6 dou3 … sin1',
      'the reading has 1 "…" and the headword 0: put one in the reading where the headword has it',
    ],
  ]
  assert.deepStrictEqual(
    cases.map(([traditional, jyutping]) => [traditional, jyutping, patternProblem(traditional, jyutping)]),
    cases,
  )
})

test('a pattern headword, a plain one and real Latin letters pass', () => {
  const cases: [string, string][] = [
    ['直到…先', 'zik6 dou3 … sin1'],
    ['同…一齊…嘅', 'tung4 … jat1 cai4 … ge3'],
    ['百分之', 'baak3 fan6 zi1'],
    // Latin in a headword is real data; the syllable count is only checked on gapped headwords.
    ['卡拉OK', 'kaa1 laa1 ou1 kei1'],
    ['A貨', 'A fo3'],
    ['3D打印機', 'saam1 di1 daa2 jan3 gei1'],
    // A gapped piece holding Latin has no count to check.
    ['做…OK', 'zou6 … ou1 kei1'],
  ]
  assert.deepStrictEqual(
    cases.map(([traditional, jyutping]) => patternProblem(traditional, jyutping)),
    cases.map(() => null),
  )
})
