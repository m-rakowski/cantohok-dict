// Tests for pleco-format.ts, the Pleco text format. Run with `pnpm run test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { plecoHeader } from './pleco-format.ts'

const B = (text: string) => `\u{EAB2}${text}\u{EAB3}`
const I = (text: string) => `\u{EAB4}${text}\u{EAB5}`

test('plecoHeader names a register, except "neutral", which says nothing', () => {
  assert.deepEqual(
    [
      plecoHeader('好', 'hou2', 'adv', 'neutral'),
      plecoHeader('車頭', 'ce1 tau4', 'noun', 'colloquial'),
      plecoHeader('的士', 'dik1 si2', 'noun'),
    ],
    [
      `${B('好')}  hou²  ${I('adv.')}`,
      `${B('車頭')}  ce¹ tau⁴  ${I('n., colloquial')}`,
      `${B('的士')}  dik¹ si²  ${I('n.')}`,
    ],
  )
})
