// The shape of a pattern headword: a phrase with a slot someone fills, like 同…作對 "to go against
// someone" or 直到…先 "not until". The slot is written "…" (U+2026, one character), between two
// pieces of text, never at an edge: 百分之 rather than 百分之…, because a slot at the edge says
// nothing a phrase does not already say. The reading has a "…" token in the same places.
//
// Slot letters (A, N, V, CL) cannot be told from real Latin (A貨, 卡拉OK) by shape alone, so this
// check refuses only what can be refused mechanically. Run by check.ts on every page.

import { HAN, TONED } from './corpus.ts'

const GAP = '…'

const count = (text: string, pattern: RegExp): number => (text.match(pattern) ?? []).length

/** Why a page's headword and reading break the pattern shape, or null. */
export function patternProblem(traditional: string, jyutping: string): string | null {
  if (/[+＋]/u.test(traditional)) return 'a "+" in the headword: write a slot as "…" and join the rest (同…作對)'
  if (traditional.includes('...') || jyutping.includes('...'))
    return '"..." in the headword or reading: write a slot as one "…" (U+2026)'
  if (/\s/u.test(traditional)) return 'a space in the headword: join its pieces (同…作對)'
  const tokens = jyutping.trim().split(/\s+/u)
  const headwordGaps = count(traditional, /…/gu)
  const readingGaps = tokens.filter(token => token === GAP).length
  if (headwordGaps === 0 && readingGaps === 0) return null
  if (traditional.startsWith(GAP) || traditional.endsWith(GAP))
    return 'a "…" at the start or end of the headword: leave an edge slot out (百分之, not 百分之…)'
  if (traditional.includes(GAP + GAP)) return 'two "…" in a row: one "…" is one slot'
  if (headwordGaps !== readingGaps)
    return `the reading has ${readingGaps} "…" and the headword ${headwordGaps}: put one in the reading where the headword has it`

  const readingPieces = tokens.join(' ').split(GAP)
  for (const [i, piece] of traditional.split(GAP).entries()) {
    const han = count(piece, HAN)
    // A piece holding Latin (做…OK) has no one-syllable-per-character count to check.
    if (han !== [...piece].length) continue
    const syllables = count(readingPieces[i]!, TONED)
    if (syllables !== han)
      return `the piece ${piece} has ${han} Han character${han === 1 ? '' : 's'} and ${syllables} syllable${syllables === 1 ? '' : 's'} in the reading`
  }
  return null
}
