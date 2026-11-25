// The sentence reading of a corpus line whose source writes its own Jyutping word by word
// (HKCanCor, Hambaanglaang). It imports nothing, so a tool outside this repository can load it by
// type stripping and write new lines the check accepts.

export interface CorpusReadingLine {
  text: string
  words?: { text: string; jyutping: string }[]
}

// A Private Use code point counts too: HKCanCor writes a fused particle as one.
const SYLLABIC = /[\p{Script=Han}\p{Co}]/u
// What a reading can speak: a Han character, or a run of letters or digits (An, 15, Er).
const SPOKEN = /[\p{Script=Han}\p{Co}]|(?:(?![\p{Script=Han}\p{Co}])[\p{L}\p{N}])+/gu

// The marks a word's own text starts or ends with (Hambaanglaang writes 打波： and 「我哋 as words).
// Marks inside a word (7-11, 1.4) are read by the word's reading, so they are not copied.
const WORD_EDGES = /^([^\p{L}\p{N}\p{M}\p{Co}]*)(.*?)([^\p{L}\p{N}\p{M}\p{Co}]*)$/su

interface Piece {
  text: string
  mark: boolean
  /** The sentence had whitespace right before it. */
  spaced: boolean
}

/** Text no word reads, as pieces: a run of letters or digits, or one mark. */
function textPieces(text: string, spacedBefore: boolean): Piece[] {
  return [...text.matchAll(/(\s*)([\p{L}\p{N}]+|\S)/gu)].map(([, space = '', piece = ''], i) => ({
    text: piece,
    mark: !/[\p{L}\p{N}]/u.test(piece),
    spaced: space !== '' || (i === 0 && spacedBefore),
  }))
}

/**
 * A corpus line's reading: its words' own readings, in order, with whatever the sentence has
 * between them copied in place, by the same rules as a reading we generate: a mark (，。？) sits
 * flush against its neighbors unless the sentence had whitespace before it; a run of letters or
 * digits no word reads is copied as a word of its own, space-separated.
 * Marks at the edges of a word's own text are copied too, unless the word's reading has more
 * syllables than the word has characters and letter runs: then the reading speaks them (15% is
 * sap6 ng5 percent, ○頭 is fing6 tau4).
 * null when the words do not cover every Han character of the text, in order, or a word is all marks.
 */
export function corpusReading(source: string, line: CorpusReadingLine): string | null {
  const pieces: Piece[] = []
  let pos = 0
  for (const word of line.words ?? []) {
    const at = line.text.indexOf(word.text, pos)
    if (word.text === '' || at < 0 || SYLLABIC.test(line.text.slice(pos, at))) return null
    const [, lead = '', core = '', tail = ''] = WORD_EDGES.exec(word.text) ?? []
    if (core === '') return null
    const reading = source === 'hambaanglaang' ? word.jyutping.replaceAll('-', ' ').toLowerCase() : word.jyutping
    const copyEdges = reading.split(/\s+/u).filter(Boolean).length === (core.match(SPOKEN) ?? []).length
    const before = line.text.slice(pos, at) + (copyEdges ? lead : '')
    const gap = textPieces(before, false)
    pieces.push(...gap, { text: reading, mark: false, spaced: /\s$/u.test(before) })
    if (copyEdges) pieces.push(...textPieces(tail, false))
    pos = at + word.text.length
  }
  if (SYLLABIC.test(line.text.slice(pos))) return null
  pieces.push(...textPieces(line.text.slice(pos), false))
  return pieces
    .map((piece, i) => {
      const previous = pieces[i - 1]
      const space = previous !== undefined && (piece.spaced || (!piece.mark && !previous.mark))
      return (space ? ' ' : '') + piece.text
    })
    .join('')
}
