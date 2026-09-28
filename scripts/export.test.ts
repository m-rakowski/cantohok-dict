// Tests for export.ts: builds the fixture repo and checks the exact bytes of
// each exported file (CSV, JSONL, aliases CSV, Pleco text). Run with
// `pnpm run test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadValidRepo, toAliasesCsv, toCsv, toJsonl, toPleco } from './export.ts'
import { validFixture, writeTree } from './test-helpers.ts'

const repo = () => loadValidRepo(writeTree(validFixture()))

test('loadValidRepo refuses an invalid repo', () => {
  const files = validFixture()
  files['words/c/cab.json'] = '{ nope'
  assert.throws(() => loadValidRepo(writeTree(files)), /words\/c\/cab\.json: invalid JSON/)
})

test('toCsv: header, rank order, quoting', () => {
  assert.equal(
    toCsv(repo()),
    [
      'id,term,partOfSpeech,meaning,traditional,jyutping,register,note,exampleEnglish,exampleTraditional,exampleJyutping',
      'bbbbbbb1,Thursday,noun,day of the week,星期四,sing1 kei4 sei3,,This is the all-purpose word for Thursday.,,,',
      'aaaaaaa1,cab,noun,taxi,的士,dik1 si2,,This is the all-purpose Cantonese noun for a taxi or cab.,We called a cab to the airport.,我哋叫咗部的士去機場。,ngo5 dei6 giu3 zo2 bou6 dik1 si2 heoi3 gei1 coeng4',
      'aaaaaaa2,cab,noun,taxi,車頭,ce1 tau4,colloquial,Use this colloquial term for the cab or front section of a truck.,,,',
      '',
    ].join('\n'),
  )
})

test('toCsv quotes commas, quotes and newlines', () => {
  const files = validFixture()
  files['words/t/Thursday.json'] = files['words/t/Thursday.json'].replace(
    '"This is the all-purpose word for Thursday."',
    '"Say \\"Thursday\\", then stop."',
  )
  const csv = toCsv(loadValidRepo(writeTree(files)))
  assert.match(csv, /,"Say ""Thursday"", then stop\.",/)
})

test('toCsv quotes a newline inside a note', () => {
  const files = validFixture()
  files['words/t/Thursday.json'] = files['words/t/Thursday.json'].replace(
    '"This is the all-purpose word for Thursday."',
    '"Line one.\\nLine two."',
  )
  const csv = toCsv(loadValidRepo(writeTree(files)))
  assert.match(csv, /,"Line one\.\nLine two\.",/)
})

test('toJsonl: one object per row with term, rank and shares', () => {
  const lines = toJsonl(repo())
    .trimEnd()
    .split('\n')
    .map(line => JSON.parse(line))
  assert.deepEqual(lines, [
    {
      id: 'bbbbbbb1',
      term: 'Thursday',
      rank: 900,
      partOfSpeech: 'noun',
      meaning: 'day of the week',
      meaningShare: 100,
      traditional: '星期四',
      jyutping: 'sing1 kei4 sei3',
      share: 100,
      note: 'This is the all-purpose word for Thursday.',
    },
    {
      id: 'aaaaaaa1',
      term: 'cab',
      rank: 2000,
      partOfSpeech: 'noun',
      meaning: 'taxi',
      meaningShare: 80,
      traditional: '的士',
      jyutping: 'dik1 si2',
      share: 70,
      note: 'This is the all-purpose Cantonese noun for a taxi or cab.',
      example: {
        english: 'We called a cab to the airport.',
        traditional: '我哋叫咗部的士去機場。',
        jyutping: 'ngo5 dei6 giu3 zo2 bou6 dik1 si2 heoi3 gei1 coeng4',
      },
    },
    {
      id: 'aaaaaaa2',
      term: 'cab',
      rank: 2000,
      partOfSpeech: 'noun',
      meaning: 'taxi',
      meaningShare: 80,
      traditional: '車頭',
      jyutping: 'ce1 tau4',
      share: 30,
      register: 'colloquial',
      note: 'Use this colloquial term for the cab or front section of a truck.',
    },
  ])
})

test('toAliasesCsv', () => {
  assert.equal(toAliasesCsv(repo()), 'alias,term\nthursdays,Thursday\n')
})

test('toPleco: BOM, one entry per row, Pleco line breaks and formatting', () => {
  const NL = '\u{EAB1}'
  const B = (s: string) => `\u{EAB2}${s}\u{EAB3}`
  const I = (s: string) => `\u{EAB4}${s}\u{EAB5}`
  assert.equal(
    toPleco(repo()),
    '\u{FEFF}' +
      [
        `Thursday\t${B('星期四')}  sing¹ kei⁴ sei³  ${I('n.')}${NL}This is the all-purpose word for Thursday.`,
        `cab\t${B('的士')}  dik¹ si²  ${I('n.')}${NL}This is the all-purpose Cantonese noun for a taxi or cab.${NL}${NL}我哋叫咗部的士去機場。${NL}ngo⁵ dei⁶ giu³ zo² bou⁶ dik¹ si² heoi³ gei¹ coeng⁴${NL}${I('We called a cab to the airport.')}`,
        `cab\t${B('車頭')}  ce¹ tau⁴  ${I('n., colloquial')}${NL}Use this colloquial term for the cab or front section of a truck.`,
        '',
      ].join('\n'),
  )
})

test('toPleco flattens a tab inside a note to a space', () => {
  const files = validFixture()
  files['words/t/Thursday.json'] = files['words/t/Thursday.json'].replace(
    '"This is the all-purpose word for Thursday."',
    '"This is the all-purpose\\tword for Thursday."',
  )
  const pleco = toPleco(loadValidRepo(writeTree(files)))
  const thursdayLine = pleco.slice(1).split('\n')[0]
  assert.equal(thursdayLine.split('\t').length, 2, "the note's tab must not add a second tab to the line")
  assert.match(thursdayLine, /This is the all-purpose word for Thursday\./)
})
