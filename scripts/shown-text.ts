// The rules for text a learner sees, kept in a file with no imports so that
// another repo (the dictionary generator) can load it directly under Node's
// type stripping, with no node_modules, and apply the exact same rules that
// `pnpm run check` enforces here. scripts/check.ts calls these two functions.
//
// - A note must read on its own. It must not point at the generator's
//   numbered senses ("sense 2", "the second sense", "a stage work (39)"),
//   which a learner never sees, and it may say "slice" only on a row whose
//   own term or meaning is about slices; anywhere else "slice" was generator
//   talk for "part of a meaning" ("the colloquial slice"). For the same
//   reason it must not call itself one part of a meaning ("the formal side
//   of the sense", "the excitement side of the figurative sense", "the
//   willingness part of the meaning"), and it must not point at "the
//   example", which was the generator's own example rather than the one the
//   learner sees.
// - An English example must name real people and things, not a placeholder
//   letter ("please A", "B's car"). A capital letter on its own is allowed
//   only as "I", as the article "A" starting a sentence ("A dog barked."), or
//   after a word that takes a letter ("Plan B", "vitamin C", "grade A"). A
//   letter joined to another letter or digit ("Q&A", "T-shirt", "U.S.",
//   "X-ray", "O'Brien") is part of a word, not on its own. One gap is left
//   open on purpose: "A agreed to help." looks exactly like "A dog barked."
//   to a rule, so a placeholder "A" at the start of a sentence still passes.

// "sense 2", "senses 1 and 2", "sense #3", "the second sense". "sixth" is
// left out on purpose: "a sixth sense" is ordinary English.
const SENSE_NUMBER =
  /\bsenses?\s*(?:#\s*)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b|\b(?:first|second|third|fourth|fifth|seventh|eighth|ninth|tenth|\d+(?:st|nd|rd|th))\s+senses?\b/i
// A sense number on its own in brackets: "a stage work (39)". A number with a
// comma or words beside it ("(1,000 dollars)") is ordinary English.
const BRACKETED_NUMBER = /\(\s*\d+\s*\)/
const SLICE = /\bslices?\b/i
// Up to two describing words may sit before "sense": "side of the figurative
// sense".
const PART_OF_MEANING = /\b(?:aspect|part|side)s? of (?:the|this|that)\s+(?:[\w-]+\s+){0,2}(?:sense|meaning)s?\b/i
const THE_EXAMPLE = /\bthe (?:[\w-]+ )?example\b/i
// A capital letter with no letter or digit touching it, directly or across
// one joining character (&, ., - or an apostrophe). A possessive "'s" does
// not join: "B's car" still has a lone B.
const LONE_CAPITAL = /(?<![\p{L}\p{N}]|[\p{L}\p{N}][&.'’-])\p{Lu}(?![\p{L}\p{N}]|[&.-][\p{L}\p{N}]|['’](?!s\b)\p{L})/gu
// Start of the text, or just after a sentence end (but not the dot of "Mr."
// and the like), a colon, a dash, or an opening quote/bracket.
const SENTENCE_START = /(?:^|(?<!\b(?:Mr|Mrs|Ms|Dr|Prof|St))[.!?]\s+|:\s+|[—–]\s*|["“‘'(]\s*)$/
// Words that are normally followed by a single letter.
const TAKES_A_LETTER = /\b(?:plan|vitamin|grade|type|class)\s$/i

/** What is wrong with a row's `note`, as phrases that complete "row <id> ..." (empty means the note is fine). `term` and `meaning` are the row's own, which decide whether "slice" is allowed. */
export function noteProblems(note: string, term: string, meaning: string): string[] {
  const problems: string[] = []
  const sense = note.match(SENSE_NUMBER) ?? note.match(BRACKETED_NUMBER)
  if (sense) problems.push(`note points at a numbered sense ("${sense[0]}")`)
  if (SLICE.test(note) && !SLICE.test(`${term} ${meaning}`))
    problems.push(`note says "slice" on a row that is not about slices`)
  const part = note.match(PART_OF_MEANING)
  if (part) problems.push(`note calls itself part of a meaning ("${part[0]}")`)
  const example = note.match(THE_EXAMPLE)
  if (example) problems.push(`note points at the generator's example ("${example[0]}")`)
  return problems
}

/** The capital letters in `english` that stand alone, other than "I", a sentence-initial article "A", and "Plan B"-style letters. */
export function placeholderLetters(english: string): string[] {
  const found: string[] = []
  for (const match of english.matchAll(LONE_CAPITAL)) {
    const letter = match[0]
    if (letter === 'I') continue
    const before = english.slice(0, match.index)
    const after = english.slice(match.index + 1)
    if (letter === 'A' && SENTENCE_START.test(before) && /^ [\p{L}\p{N}]/u.test(after)) continue
    if (TAKES_A_LETTER.test(before)) continue
    found.push(letter)
  }
  return found
}
