// The sentence reading of a corpus line whose source writes its own Jyutping word by word
// (HKCanCor, Hambaanglaang). It imports nothing, so a tool outside this repository can load it by
// type stripping and write new lines the check accepts.

export interface CorpusReadingLine {
  text: string
  words?: { text: string; jyutping: string }[]
}

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u
// A Private Use code point counts too: HKCanCor writes a fused particle as one.
const SYLLABIC = /[\p{Script=Han}\p{Co}]/u

// The marks a word's own text starts or ends with (Hambaanglaang writes 打波： and 「我哋 as words).
// Marks inside a word (7-11, 1.4) are read by the word's reading, so they are not copied.
const WORD_EDGES = /^([^\p{L}\p{N}\p{M}\p{Co}]*)(.*?)([^\p{L}\p{N}\p{M}\p{Co}]*)$/su

/** Gap text split into pieces: a run of letters or digits, or one mark. Whitespace only splits. */
function gapPieces(gap: string): { text: string; mark: boolean }[] {
  return (gap.match(/[\p{L}\p{N}]+|\S/gu) ?? []).map(text => ({ text, mark: !LETTER_OR_DIGIT.test(text) }))
}

/**
 * A corpus line's reading: its words' own readings, in order, with whatever the sentence has
 * between them, and at the edges of a word's own text, copied in place. A mark (，。？) sits flush against its neighbors; a run of letters
 * or digits no word reads is copied as a word of its own, space-separated. Whitespace is dropped.
 * null when the words do not cover every Han character of the text, in order, or a word is all marks.
 */
export function corpusReading(source: string, line: CorpusReadingLine): string | null {
  const pieces: { text: string; mark: boolean }[] = []
  let pos = 0
  for (const word of line.words ?? []) {
    const at = line.text.indexOf(word.text, pos)
    if (word.text === '' || at < 0 || SYLLABIC.test(line.text.slice(pos, at))) return null
    const [, lead = '', core = '', tail = ''] = WORD_EDGES.exec(word.text) ?? []
    if (core === '') return null
    pieces.push(...gapPieces(line.text.slice(pos, at) + lead))
    const reading = source === 'hambaanglaang' ? word.jyutping.replaceAll('-', ' ').toLowerCase() : word.jyutping
    pieces.push({ text: reading, mark: false }, ...gapPieces(tail))
    pos = at + word.text.length
  }
  if (SYLLABIC.test(line.text.slice(pos))) return null
  pieces.push(...gapPieces(line.text.slice(pos)))
  return pieces.map((piece, i) => (i === 0 || piece.mark || pieces[i - 1]?.mark ? '' : ' ') + piece.text).join('')
}
