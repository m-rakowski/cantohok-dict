// Pleco's text format: one entry per line, headword and body separated by a tab, and the
// body's formatting written with private-use characters. Kept in a file with no imports so
// that another repo (CantoHok's own Pleco file, built from the app's data) can load it from
// a checkout of this one with no node_modules, as it loads shown-text.ts.

/** The parts of a sentence the Pleco file prints. */
export interface PlecoSentence {
  english: string
  traditional: string
  jyutping: string
}

// Pleco's private-use formatting characters. Only the line break is documented by
// Pleco; bold and italic come from its forum and were verified on an iPhone on 2026-09-27.
export const NL = '\u{EAB1}'
export const BOLD = (text: string) => `\u{EAB2}${text}\u{EAB3}`
export const ITALIC = (text: string) => `\u{EAB4}${text}\u{EAB5}`
export const BOM = '\u{FEFF}'
const POS_ABBREVIATION: Record<string, string> = {
  noun: 'n.',
  verb: 'v.',
  adj: 'adj.',
  adv: 'adv.',
  prep: 'prep.',
  conj: 'conj.',
  pron: 'pron.',
  det: 'det.',
  intj: 'interj.',
  num: 'num.',
  particle: 'part.',
  article: 'art.',
  postp: 'postp.',
  name: 'name',
}
const SUPERSCRIPT: Record<string, string> = { 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶' }
export const toneMarks = (jyutping: string): string =>
  jyutping.replace(/([a-z])([1-6])\b/gu, (_, letter: string, tone: string) => letter + SUPERSCRIPT[tone])
// A tab or newline inside a value would end the Pleco field or entry.
export const flat = (value: string): string => value.replace(/[\t\r\n]+/gu, ' ').trim()

/**
 * A sentence with the entry's word in bold, in its text and in its reading, the way the
 * CantoHok card shows it. The reading is bolded only when the text contains the word, so a
 * sentence that merely has the same sounds (的死 for 的士) stays plain. Only the first copy is
 * bolded: nothing says which copy is the word (in 呢套戲好好睇 only the first 好 means "very").
 */
function boldWord(example: PlecoSentence, word: string, reading: string): PlecoSentence {
  const at = example.traditional.indexOf(word)
  if (word === '' || at === -1) return example
  return {
    english: example.english,
    traditional: example.traditional.slice(0, at) + BOLD(word) + example.traditional.slice(at + word.length),
    jyutping: boldReading(example, at, word, reading),
  }
}

const hanCount = (text: string): number => [...text].filter(char => /\p{Script=Han}/u.test(char)).length
const SYLLABLE = /[a-z]+[1-6]/gu

/**
 * The sentence's reading with the word's syllables in bold. When every Chinese character has
 * exactly one syllable, the syllables at the word's own position are bolded, so a homophone
 * earlier in the sentence (汽 before 氣, both hei3) stays plain. Otherwise the positions cannot
 * be lined up, and the first run of syllables that sounds like the word is bolded.
 */
function boldReading(example: PlecoSentence, at: number, word: string, reading: string): string {
  const sentence = [...example.jyutping.matchAll(SYLLABLE)]
  const own = reading.match(SYLLABLE) ?? []
  if (own.length === 0) return example.jyutping
  let first: number
  if (sentence.length === hanCount(example.traditional) && own.length === hanCount(word)) {
    first = hanCount(example.traditional.slice(0, at))
  } else {
    first = sentence.findIndex((_, i) => own.every((syllable, k) => sentence[i + k]?.[0] === syllable))
    if (first === -1) return example.jyutping
  }
  const from = sentence[first].index
  const last = sentence[first + own.length - 1]
  const to = last.index + last[0].length
  return example.jyutping.slice(0, from) + BOLD(example.jyutping.slice(from, to)) + example.jyutping.slice(to)
}

/** The first line of an entry: the word in bold, its reading with tone marks, and its part of speech (and register) in italics. */
export function plecoHeader(traditional: string, jyutping: string, partOfSpeech: string, register?: string): string {
  const pos = POS_ABBREVIATION[partOfSpeech] ?? partOfSpeech
  const label = register ? `${pos}, ${register}` : pos
  return `${BOLD(flat(traditional))}  ${toneMarks(flat(jyutping))}  ${ITALIC(label)}`
}

/** A sentence as three lines (text, reading, English in italics), the entry's word in bold. */
export function plecoSentence(sentence: PlecoSentence, word: string, reading: string): string[] {
  const shown = boldWord(
    { english: flat(sentence.english), traditional: flat(sentence.traditional), jyutping: flat(sentence.jyutping) },
    flat(word),
    flat(reading),
  )
  return [shown.traditional, toneMarks(shown.jyutping), ITALIC(shown.english)]
}

/** One entry: the headword, a tab, and the body lines joined with Pleco's line break. */
export const plecoEntry = (term: string, lines: string[]): string => `${flat(term)}\t${lines.join(NL)}`
