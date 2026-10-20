// Tests for check.ts: takes the valid two-word fixture, breaks one thing at
// a time, and checks the exact error message check.ts reports. Run with
// `pnpm run test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { format } from 'prettier'
import { casePathDuplicates, checkRepo } from './check.ts'
import { pageNameProblem, pagePath } from './types.ts'
import { validFixture, writeTree } from './test-helpers.ts'

const CAB = 'words/c/cab.json'
const THURSDAY = 'words/t/Thursday.json'
const CAB_PAGE = 'cantonese/的士_noun_ppppppp1.json'
const THURSDAY_PAGE = 'cantonese/星期四_noun_ppppppp3.json'
const CAB_PAGE_2 = 'cantonese/車頭_noun_ppppppp2.json'

const repoRoot = join(import.meta.dirname, '..')
const prettierConfig = JSON.parse(readFileSync(join(repoRoot, '.prettierrc.json'), 'utf8'))

/** Runs the check on the valid fixture with `change` applied to a copy. */
function checkWith(change: (files: Record<string, string>) => void): string[] {
  const files = validFixture()
  change(files)
  return checkRepo(writeTree(files))
}

/** The page-form of a row's text: pages write "／" where a row has "/". */
const pageForm = (text: string): string => text.replaceAll('/', '／')

/** Parses CAB, lets `edit` mutate the object, writes it back (use `editCabRaw` to leave the pages' copies alone). */
function editCabRaw(edit: (cab: any) => void): (files: Record<string, string>) => void {
  return files => {
    const cab = JSON.parse(files[CAB])
    edit(cab)
    files[CAB] = JSON.stringify(cab, null, 2) + '\n'
  }
}

/** Like `editCabRaw`, then copies each CAB row's word, meaning, note and register onto the page entry with its id, so the edit changes the row and the page together. */
function editCab(edit: (cab: any) => void): (files: Record<string, string>) => void {
  return files => {
    editCabRaw(edit)(files)
    const cab = JSON.parse(files[CAB])
    for (const path of [CAB_PAGE, CAB_PAGE_2]) {
      const page = JSON.parse(files[path])
      for (const entry of page.boxes[0].english) {
        const row = cab.rows.find((candidate: any) => candidate.id === entry.id)
        if (!row) continue
        entry.word = cab.term
        entry.meaning = row.meaning
        entry.note = row.note
        if (row.example) page.boxes[0].examples[page.boxes[0].english.indexOf(entry)] = row.example
        if (row.register === undefined) delete entry.register
        else entry.register = row.register
      }
      files[path] = JSON.stringify(page, null, 2) + '\n'
    }
  }
}

/** The text of the first cab page with its English entries' ids removed, for tests that make a second page like it. */
function cabPageCopy(files: Record<string, string>): string {
  const page = JSON.parse(files[CAB_PAGE])
  for (const entry of page.boxes[0].english) delete entry.id
  return JSON.stringify(page, null, 2) + '\n'
}

/** Parses the page file at `path`, lets `edit` mutate the object, writes it back. */
function editPage(path: string, edit: (page: any) => void): (files: Record<string, string>) => void {
  return files => {
    const page = JSON.parse(files[path])
    edit(page)
    files[path] = JSON.stringify(page, null, 2) + '\n'
  }
}

/** Parses pages-by-id.json, lets `edit` mutate the object, writes it back. */
function editLookup(edit: (lookup: any) => void): (files: Record<string, string>) => void {
  return files => {
    const lookup = JSON.parse(files['pages-by-id.json'])
    edit(lookup)
    files['pages-by-id.json'] = JSON.stringify(lookup, null, 2) + '\n'
  }
}

/**
 * Puts the English row `id` (found in one of the word files in `files`) on a page, as a conversion would, so a
 * test that adds a row stays valid: the entry is added to the page with the row's characters, part of speech and
 * reading, or to a new page (id "q" plus the rest of the row id) when there is none. The lookup maps the row to it.
 */
function mapRowToPage(files: Record<string, string>, id: string): void {
  const path = Object.keys(files).find(
    key => key.startsWith('words/') && JSON.parse(files[key]).rows.some((row: any) => row.id === id),
  )!
  const word = JSON.parse(files[path])
  const row = word.rows.find((candidate: any) => candidate.id === id)
  const entry: any = { id, word: word.term, meaning: row.meaning }
  if (row.register !== undefined) entry.register = row.register
  entry.note = row.note
  const traditional = pageForm(row.traditional)
  const partOfSpeech = pageForm(row.partOfSpeech)
  const jyutping = pageForm(row.jyutping)
  const existing = Object.keys(files).find(key => {
    if (!key.startsWith('cantonese/')) return false
    const page = JSON.parse(files[key])
    return page.traditional === traditional && page.partOfSpeech === partOfSpeech && page.jyutping === jyutping
  })
  const page = existing
    ? JSON.parse(files[existing])
    : {
        id: `q${id.slice(1)}`,
        partOfSpeech,
        traditional,
        jyutping,
        boxes: [{ meaning: row.meaning, english: [], examples: [] }],
      }
  page.boxes[0].english.push(entry)
  files[existing ?? pagePath(traditional, partOfSpeech, page.id)] = JSON.stringify(page, null, 2) + '\n'
  const pageId: string = page.id
  editLookup(lookup => {
    lookup[id] = pageId
    lookup[pageId] = pageId
  })(files)
}

/** Parses frequency.json, lets `edit` mutate the object, writes it back. */
function editFrequency(edit: (freq: any) => void): (files: Record<string, string>) => void {
  return files => {
    const freq = JSON.parse(files['frequency.json'])
    edit(freq)
    files['frequency.json'] = JSON.stringify(freq, null, 2) + '\n'
  }
}

test('the valid fixture passes', () => {
  assert.deepEqual(
    checkWith(() => {}),
    [],
  )
})

// The fixture files are hand-written literals; this proves they are already
// byte-for-byte what `pnpm run format` (Prettier + prettier-plugin-sort-json)
// would produce, so every test above is exercising the same layout the real
// repo is checked against, not one this file quietly drifted from.
test("every fixture file is already in Prettier's canonical layout", async () => {
  const files = validFixture()
  for (const [path, contents] of Object.entries(files)) {
    const formatted = await format(contents, { ...prettierConfig, filepath: path })
    assert.equal(formatted, contents, path)
  }
})

test('invalid JSON', () => {
  assert.deepEqual(
    checkWith(files => {
      files[CAB] = '{ nope'
    }),
    [
      `${CAB}: invalid JSON`,
      'frequency.json: id "aaaaaaa1" is in no word file',
      'frequency.json: id "aaaaaaa2" is in no word file',
      'frequency.json: "cab" has no word file',
    ],
  )
})

test('unknown field on a row', () => {
  assert.deepEqual(
    checkWith(
      editCab(cab => {
        cab.rows[0].color = 'red'
      }),
    ),
    [`${CAB}: /rows/0 must NOT have additional properties "color"`],
  )
})

test('unknown field on the word', () => {
  assert.deepEqual(
    checkWith(
      editCab(cab => {
        cab.extra = 1
      }),
    ),
    [`${CAB}: (root) must NOT have additional properties "extra"`],
  )
})

// A blank term must not reach `wordPath(term)` — chunk 1 guarded this with
// `if (!isFilled(json.term)) continue`; a version that only checked
// `typeof json.term === 'string'` would pass `''` through to
// `term[0].toLowerCase()` and throw instead of reporting the schema error.
test('blank term ("")', () => {
  assert.deepEqual(
    checkWith(
      editCabRaw(cab => {
        cab.term = ''
      }),
    ),
    [
      `${CAB}: /term must match pattern "\\S"`,
      'frequency.json: id "aaaaaaa1" is in no word file',
      'frequency.json: id "aaaaaaa2" is in no word file',
      'frequency.json: "cab" has no word file',
    ],
  )
})

test('blank term (whitespace only)', () => {
  assert.deepEqual(
    checkWith(
      editCabRaw(cab => {
        cab.term = ' '
      }),
    ),
    [
      `${CAB}: /term must match pattern "\\S"`,
      'frequency.json: id "aaaaaaa1" is in no word file',
      'frequency.json: id "aaaaaaa2" is in no word file',
      'frequency.json: "cab" has no word file',
    ],
  )
})

test('missing required field', () => {
  assert.deepEqual(
    checkWith(
      editCab(cab => {
        delete cab.rows[1].note
      }),
    ),
    [`${CAB}: /rows/1 must have required property 'note'`],
  )
})

test('empty required field', () => {
  assert.deepEqual(
    checkWith(
      editCab(cab => {
        cab.rows[0].jyutping = ' '
      }),
    ),
    [`${CAB}: /rows/0/jyutping must match pattern "\\S"`],
  )
})

test('empty register', () => {
  assert.deepEqual(
    checkWith(
      editCabRaw(cab => {
        cab.rows[1].register = ''
      }),
    ),
    [`${CAB}: /rows/1/register must match pattern "\\S"`],
  )
})

test('example missing a field', () => {
  assert.deepEqual(
    checkWith(
      editCabRaw(cab => {
        delete cab.rows[0].example.jyutping
      }),
    ),
    [`${CAB}: /rows/0/example must have required property 'jyutping'`],
  )
})

test('bad id shape', () => {
  assert.deepEqual(
    checkWith(files => {
      editCab(cab => {
        cab.rows[0].id = 'ABC'
      })(files)
      editFrequency(freq => {
        freq.rows.ABC = freq.rows.aaaaaaa1
        delete freq.rows.aaaaaaa1
      })(files)
    }),
    [
      `${CAB}: /rows/0/id must match pattern "^[a-z0-9]{8}$"`,
      `${CAB_PAGE}: English entry "aaaaaaa1" is not a row in words/`,
    ],
  )
})

test('duplicate id across files', () => {
  assert.deepEqual(
    checkWith(
      editCab(cab => {
        cab.rows[1].id = 'bbbbbbb1'
      }),
    ),
    [
      `duplicate id "bbbbbbb1" in ${CAB} and ${THURSDAY}`,
      `${CAB_PAGE_2}: English entry "aaaaaaa2" is not a row in words/`,
      'frequency.json: id "aaaaaaa2" is in no word file',
    ],
  )
})

test('file name does not match term', () => {
  assert.deepEqual(
    checkWith(files => {
      files['words/c/taxi.json'] = files[CAB]
      delete files[CAB]
    }),
    ['words/c/taxi.json: file name does not match term "cab" (expected words/c/cab.json)'],
  )
})

// words/t/thursday.json and words/t/Thursday.json are the same file on macOS's
// case-insensitive disk, so the clash is staged under a third name. That is also
// why the rule exists: such a pair would silently overwrite itself on a Mac clone.
test('terms that differ only by case', () => {
  const errors = checkWith(files => {
    files['words/t/thursday-copy.json'] = files[THURSDAY].replace('"Thursday"', '"thursday"').replace(
      'bbbbbbb1',
      'bbbbbbb2',
    )
    mapRowToPage(files, 'bbbbbbb2')
    editFrequency(freq => {
      freq.rows.bbbbbbb2 = { meaningShare: 100, share: 100, order: 0 }
      freq.words.thursday = 901
    })(files)
  })
  assert.deepEqual(errors, [
    'words/t/thursday-copy.json: file name does not match term "thursday" (expected words/t/thursday.json)',
    `words/t/thursday-copy.json: term "thursday" duplicates ${THURSDAY}`,
  ])
})

test('empty rows', () => {
  assert.deepEqual(
    checkWith(
      editCab(cab => {
        cab.rows = []
      }),
    ),
    [
      `${CAB}: /rows must NOT have fewer than 1 items`,
      `${CAB_PAGE}: English entry "aaaaaaa1" is not a row in words/`,
      `${CAB_PAGE_2}: English entry "aaaaaaa2" is not a row in words/`,
      'frequency.json: id "aaaaaaa1" is in no word file',
      'frequency.json: id "aaaaaaa2" is in no word file',
    ],
  )
})

test('row id missing from frequency.json', () => {
  assert.deepEqual(
    checkWith(
      editFrequency(freq => {
        delete freq.rows.aaaaaaa2
      }),
    ),
    [`frequency.json: no entry for id "aaaaaaa2" (${CAB})`],
  )
})

test('frequency.json entry for an id in no word file', () => {
  assert.deepEqual(
    checkWith(
      editFrequency(freq => {
        freq.rows.zzzzzzz9 = { meaningShare: 1, share: 1, order: 0 }
      }),
    ),
    ['frequency.json: id "zzzzzzz9" is in no word file'],
  )
})

test('unknown field on a frequency.json rows entry', () => {
  assert.deepEqual(
    checkWith(
      editFrequency(freq => {
        freq.rows.aaaaaaa1.extra = 1
      }),
    ),
    ['frequency.json: /rows/aaaaaaa1 must NOT have additional properties "extra"'],
  )
})

test('bad share value', () => {
  assert.deepEqual(
    checkWith(
      editFrequency(freq => {
        freq.rows.aaaaaaa1.share = 170
      }),
    ),
    ['frequency.json: /rows/aaaaaaa1/share must be <= 100'],
  )
})

test('word missing from frequency.json', () => {
  assert.deepEqual(
    checkWith(
      editFrequency(freq => {
        delete freq.words.cab
      }),
    ),
    [`frequency.json: no rank for "cab" (${CAB})`],
  )
})

test('frequency.json rank for a term with no word file', () => {
  assert.deepEqual(
    checkWith(
      editFrequency(freq => {
        freq.words.bus = 5
      }),
    ),
    ['frequency.json: "bus" has no word file'],
  )
})

test('bad rank', () => {
  assert.deepEqual(
    checkWith(
      editFrequency(freq => {
        freq.words.cab = 0
      }),
    ),
    ['frequency.json: /words/cab must be >= 1'],
  )
})

test('rows of one meaning disagree on meaningShare', () => {
  assert.deepEqual(
    checkWith(
      editFrequency(freq => {
        freq.rows.aaaaaaa2.meaningShare = 50
      }),
    ),
    [`${CAB}: meaning "noun · taxi" has rows with different meaningShare (80, 50)`],
  )
})

test('missing frequency.json', () => {
  assert.deepEqual(
    checkWith(files => {
      delete files['frequency.json']
    }),
    ['frequency.json: missing'],
  )
})

test('missing aliases.json', () => {
  assert.deepEqual(
    checkWith(files => {
      delete files['aliases.json']
    }),
    ['aliases.json: missing'],
  )
})

test('aliases.json key with no word file', () => {
  assert.deepEqual(
    checkWith(files => {
      const aliases = JSON.parse(files['aliases.json'])
      aliases.bus = ['taxi-like-thing']
      files['aliases.json'] = JSON.stringify(aliases, null, 2) + '\n'
    }),
    ['aliases.json: "bus" has no word file'],
  )
})

test('empty aliases array', () => {
  assert.deepEqual(
    checkWith(files => {
      const aliases = JSON.parse(files['aliases.json'])
      aliases.cab = []
      files['aliases.json'] = JSON.stringify(aliases, null, 2) + '\n'
    }),
    ['aliases.json: /cab must NOT have fewer than 1 items'],
  )
})

// "constructor" is an inherited property of every plain object, so `term in
// frequency.json.words` sees it even with no own entry. Object.hasOwn is what makes this fail.
test('missing frequency.json rank for a word named after a built-in property', () => {
  assert.deepEqual(
    checkWith(files => {
      files['words/c/constructor.json'] = `{
  "term": "constructor",
  "rows": [
    {
      "id": "ccccccc1",
      "partOfSpeech": "noun",
      "meaning": "the function that builds an object",
      "traditional": "建構函式",
      "jyutping": "gin3 kau3 haam4 sik1",
      "note": "Borrowed technical term used in programming contexts."
    }
  ]
}
`
      mapRowToPage(files, 'ccccccc1')
      editFrequency(freq => {
        freq.rows.ccccccc1 = { meaningShare: 100, share: 100, order: 0 }
      })(files)
    }),
    ['frequency.json: no rank for "constructor" (words/c/constructor.json)'],
  )
})

// "aux" is a reserved device name on Windows (CON, PRN, AUX, NUL, COM1-9,
// LPT1-9); Git for Windows refuses to check out a path with that base name,
// so those words are stored with a trailing "_" before the extension.
function withAuxWord(path: string): (files: Record<string, string>) => void {
  return files => {
    files[path] = `{
  "term": "aux",
  "rows": [
    {
      "id": "ccccccc7",
      "partOfSpeech": "noun",
      "meaning": "a helper device or process",
      "traditional": "輔助",
      "jyutping": "fu6 zo6",
      "note": "This is the all-purpose word for something auxiliary or supporting."
    }
  ]
}
`
    mapRowToPage(files, 'ccccccc7')
    editFrequency(freq => {
      freq.rows.ccccccc7 = { meaningShare: 100, share: 100, order: 0 }
      freq.words.aux = 999999
    })(files)
  }
}

test('reserved Windows device name stored with a trailing underscore passes', () => {
  assert.deepEqual(checkWith(withAuxWord('words/a/aux_.json')), [])
})

test('reserved Windows device name without the trailing underscore fails', () => {
  assert.deepEqual(checkWith(withAuxWord('words/a/aux.json')), [
    'words/a/aux.json: file name does not match term "aux" (expected words/a/aux_.json)',
  ])
})

test('note that points at a numbered sense', () => {
  for (const [note, pointer] of [
    ['Use this for the formal side of sense 2.', 'sense 2'],
    ['Use this for the second sense of cab.', 'second sense'],
    ['Use this for senses 1 and 2.', 'senses 1'],
    ['Use this for sense #3.', 'sense #3'],
  ])
    assert.deepEqual(
      checkWith(
        editCab(cab => {
          cab.rows[0].note = note
        }),
      ),
      [
        `${CAB}: row "aaaaaaa1" note points at a numbered sense ("${pointer}")`,
        `${CAB_PAGE}: box 1 English entry "cab" note points at a numbered sense ("${pointer}")`,
      ],
      note,
    )
})

test('note that gives a sense number in brackets', () => {
  assert.deepEqual(
    checkWith(
      editCab(cab => {
        cab.rows[0].note = 'Use this for a hired car (39) or a taxi ride (40).'
      }),
    ),
    [
      `${CAB}: row "aaaaaaa1" note points at a numbered sense ("(39)")`,
      `${CAB_PAGE}: box 1 English entry "cab" note points at a numbered sense ("(39)")`,
    ],
  )
})

test('note may put words or a long number in brackets', () => {
  for (const note of ['Use this for a cab (a taxi).', 'Use this when the fare is high (1,000 dollars or more).'])
    assert.deepEqual(
      checkWith(
        editCab(cab => {
          cab.rows[0].note = note
        }),
      ),
      [],
      note,
    )
})

test('note may mention "a sixth sense"', () => {
  assert.deepEqual(
    checkWith(
      editCab(cab => {
        cab.rows[0].note = 'Use this when a driver seems to have a sixth sense for traffic.'
      }),
    ),
    [],
  )
})

test('note that says "slice" on a row not about slices', () => {
  assert.deepEqual(
    checkWith(
      editCab(cab => {
        cab.rows[0].note = 'Use this for the colloquial slice of cab.'
      }),
    ),
    [
      `${CAB}: row "aaaaaaa1" note says "slice" on a row that is not about slices`,
      `${CAB_PAGE}: box 1 English entry "cab" note says "slice" on a row that is not about slices`,
    ],
  )
})

test('note may say "slice" on a row whose meaning is about slices', () => {
  assert.deepEqual(
    checkWith(
      editCab(cab => {
        cab.rows[0].meaning = 'slice of bread'
        cab.rows[1].meaning = 'slice of bread'
        cab.rows[0].note = 'Use this for a thin slice of bread.'
      }),
    ),
    [],
  )
})

test('English example with a placeholder letter', () => {
  assert.deepEqual(
    checkWith(
      editCab(cab => {
        cab.rows[0].example.english = 'We called a cab for A, not for B.'
      }),
    ),
    [
      `${CAB}: row "aaaaaaa1" example.english has a placeholder letter (A, B)`,
      `${CAB_PAGE}: box 1 example 1 english has a placeholder letter (A, B)`,
    ],
  )
})

test('English example letters that are not placeholders', () => {
  for (const english of [
    'I called a cab.',
    'A cab came. A driver waved.',
    '“A cab is here,” she said.',
    'The cab driver hosted a Q&A in a T-shirt after an X-ray in the U.S.',
  ])
    assert.deepEqual(
      checkWith(
        editCab(cab => {
          cab.rows[0].example.english = english
        }),
      ),
      [],
      english,
    )
})

test('note may say "slice" when the word itself is about slices', () => {
  assert.deepEqual(
    checkWith(files => {
      files['words/s/slice.json'] = `{
  "term": "slice",
  "rows": [
    {
      "id": "ccccccc1",
      "partOfSpeech": "noun",
      "meaning": "thin piece",
      "traditional": "片",
      "jyutping": "pin3",
      "note": "This is the all-purpose word for a thin slice of something."
    }
  ]
}
`
      mapRowToPage(files, 'ccccccc1')
      editFrequency(freq => {
        freq.rows.ccccccc1 = { meaningShare: 100, share: 100, order: 0 }
        freq.words.slice = 3000
      })(files)
    }),
    [],
  )
})

test('note that calls itself part of a meaning', () => {
  assert.deepEqual(
    checkWith(
      editCab(cab => {
        cab.rows[0].note = 'Use this for the formal side of the meaning.'
      }),
    ),
    [
      `${CAB}: row "aaaaaaa1" note calls itself part of a meaning ("side of the meaning")`,
      `${CAB_PAGE}: box 1 English entry "cab" note calls itself part of a meaning ("side of the meaning")`,
    ],
  )
})

test('note that calls itself part of a meaning, with a describing word in between', () => {
  for (const [note, part] of [
    ['Use this for the enthusiasm side of the figurative sense.', 'side of the figurative sense'],
    ['Use this for the sacred aspect of the religious sense.', 'aspect of the religious sense'],
    ['Use this for the weak part of the physical sense.', 'part of the physical sense'],
  ])
    assert.deepEqual(
      checkWith(
        editCab(cab => {
          cab.rows[0].note = note
        }),
      ),
      [
        `${CAB}: row "aaaaaaa1" note calls itself part of a meaning ("${part}")`,
        `${CAB_PAGE}: box 1 English entry "cab" note calls itself part of a meaning ("${part}")`,
      ],
      note,
    )
})

test('note that points at the generator’s example', () => {
  assert.deepEqual(
    checkWith(
      editCab(cab => {
        cab.rows[0].note = 'This is the standard choice for the default example “call a cab”.'
      }),
    ),
    [
      `${CAB}: row "aaaaaaa1" note points at the generator's example ("the default example")`,
      `${CAB_PAGE}: box 1 English entry "cab" note points at the generator's example ("the default example")`,
    ],
  )
})

test('placeholder letters that look like part of a word', () => {
  for (const [english, letter] of [
    ["We took B's cab.", 'B'],
    ['We took B’s cab.', 'B'],
    ['Mr. A called a cab.', 'A'],
    // Only the article "A" may start a sentence, and only when a word follows it.
    ['B called a cab.', 'B'],
    ["A's cab came.", 'A'],
    ['A, call a cab.', 'A'],
  ])
    assert.deepEqual(
      checkWith(
        editCab(cab => {
          cab.rows[0].example.english = english
        }),
      ),
      [
        `${CAB}: row "aaaaaaa1" example.english has a placeholder letter (${letter})`,
        `${CAB_PAGE}: box 1 example 1 english has a placeholder letter (${letter})`,
      ],
      english,
    )
})

test('more English example letters that are not placeholders', () => {
  for (const english of [
    "'A cab is here,' she said.",
    'We waited — A cab came at last.',
    'A 10-minute cab ride took us there.',
    "Plan B was to call O'Brien's cab for a grade A driver with vitamin C.",
  ])
    assert.deepEqual(
      checkWith(
        editCab(cab => {
          cab.rows[0].example.english = english
        }),
      ),
      [],
      english,
    )
})

test('unknown field on a box', () => {
  assert.deepEqual(
    checkWith(
      editPage(CAB_PAGE, page => {
        page.boxes[0].id = 'ccccccc1'
      }),
    ),
    [`${CAB_PAGE}: /boxes/0 must NOT have additional properties "id"`],
  )
})

test('page with no boxes', () => {
  assert.deepEqual(
    checkWith(
      editPage(CAB_PAGE, page => {
        page.boxes = []
      }),
    ),
    [`${CAB_PAGE}: /boxes must NOT have fewer than 1 items`, `${CAB}: row "aaaaaaa1" is on no page entry`],
  )
})

test('box with no English word', () => {
  assert.deepEqual(
    checkWith(
      editPage(CAB_PAGE, page => {
        page.boxes[0].english = []
      }),
    ),
    [`${CAB_PAGE}: /boxes/0/english must NOT have fewer than 1 items`, `${CAB}: row "aaaaaaa1" is on no page entry`],
  )
})

test('page file under the wrong name', () => {
  assert.deepEqual(
    checkWith(files => {
      files['cantonese/星期五_noun_ppppppp3.json'] = files[THURSDAY_PAGE]
      delete files[THURSDAY_PAGE]
    }),
    [
      'cantonese/星期五_noun_ppppppp3.json: file name does not match 星期四 noun ppppppp3 (expected cantonese/星期四_noun_ppppppp3.json)',
    ],
  )
})

test('page file named with another page id', () => {
  assert.deepEqual(
    checkWith(files => {
      files['cantonese/的士_noun_abcd1234.json'] = files[CAB_PAGE]
      delete files[CAB_PAGE]
    }),
    [
      'cantonese/的士_noun_abcd1234.json: file name does not match 的士 noun ppppppp1 (expected cantonese/的士_noun_ppppppp1.json)',
    ],
  )
})

test('page file with no id in its name', () => {
  assert.deepEqual(
    checkWith(files => {
      files['cantonese/的士_noun.json'] = files[CAB_PAGE]
      delete files[CAB_PAGE]
    }),
    [
      'cantonese/的士_noun.json: file name does not match 的士 noun ppppppp1 (expected cantonese/的士_noun_ppppppp1.json)',
    ],
  )
})

test('a page whose id is unusable reports the schema error and no file name error', () => {
  assert.deepEqual(
    checkWith(
      editPage(THURSDAY_PAGE, page => {
        page.id = 'BAD'
      }),
    ),
    [`${THURSDAY_PAGE}: /id must match pattern "^[a-z0-9]{8}$"`],
  )
})

test('a box with its own jyutping is refused by the schema', () => {
  assert.deepEqual(
    checkWith(
      editPage(CAB_PAGE, page => {
        page.boxes[0].jyutping = 'dik1 si6'
      }),
    ),
    [`${CAB_PAGE}: /boxes/0 must NOT have additional properties "jyutping"`],
  )
})

test('a page with no jyutping is refused by the schema', () => {
  assert.deepEqual(
    checkWith(
      editPage(CAB_PAGE, page => {
        delete page.jyutping
      }),
    ),
    [`${CAB_PAGE}: (root) must have required property 'jyutping'`],
  )
})

test('a page with a blank jyutping is refused by the schema', () => {
  assert.deepEqual(
    checkWith(
      editPage(CAB_PAGE, page => {
        page.jyutping = ' '
      }),
    ),
    [`${CAB_PAGE}: /jyutping must match pattern "\\S"`],
  )
})

test('two pages with the same word, part of speech and reading', () => {
  const copy = 'cantonese/的士_noun_wxyz5678.json'
  assert.deepEqual(
    checkWith(files => {
      files[copy] = cabPageCopy(files).replace('ppppppp1', 'wxyz5678')
      editLookup(lookup => {
        lookup.wxyz5678 = 'wxyz5678'
      })(files)
    }),
    [`${copy}: same word, part of speech and reading (的士 noun dik1 si2) as ${CAB_PAGE}`],
  )
})

test('readings that differ only by a trailing space are not duplicates', () => {
  assert.deepEqual(
    checkWith(files => {
      files['cantonese/的士_noun_wxyz5678.json'] = cabPageCopy(files)
        .replace('ppppppp1', 'wxyz5678')
        .replace('"dik1 si2"', '"dik1 si2 "')
      editLookup(lookup => {
        lookup.wxyz5678 = 'wxyz5678'
      })(files)
    }),
    [],
  )
})

test('same word and part of speech with a different reading is a different page', () => {
  assert.deepEqual(
    checkWith(files => {
      files['cantonese/的士_noun_wxyz5678.json'] = cabPageCopy(files)
        .replace('ppppppp1', 'wxyz5678')
        .replace('"dik1 si2"', '"dik1 si6"')
      editLookup(lookup => {
        lookup.wxyz5678 = 'wxyz5678'
      })(files)
    }),
    [],
  )
})

test('different words with the same part of speech and reading are different pages', () => {
  assert.deepEqual(
    checkWith(files => {
      files['cantonese/的到_noun_wxyz5678.json'] = cabPageCopy(files)
        .replace('ppppppp1', 'wxyz5678')
        .replace('"traditional": "的士"', '"traditional": "的到"')
      editLookup(lookup => {
        lookup.wxyz5678 = 'wxyz5678'
      })(files)
    }),
    [],
  )
})

const SLASH_MESSAGE =
  'characters "a/b" contain "/", which cannot appear in a file name; write "／" (U+FF0F, fullwidth slash) instead'

test('characters that cannot be a file name', () => {
  const path = 'cantonese/x_noun.json'
  const problem = pageNameProblem('a/b', 'noun')
  assert.equal(problem, SLASH_MESSAGE)
  assert.deepEqual(
    checkWith(files => {
      files[path] = files[CAB_PAGE]
      delete files[CAB_PAGE]
      editPage(path, page => {
        page.traditional = 'a/b'
      })(files)
    }),
    [`${path}: ${problem}`, `${path}: English entry "aaaaaaa1" traditional "a/b" differs from ${CAB} ("的士")`],
  )
})

test('part of speech that cannot be a file name', () => {
  assert.equal(
    pageNameProblem('的士', 'no?un'),
    'part of speech "no?un" contains "?", which cannot appear in a file name',
  )
})

test('a name ending in a dot or a space is fine; a control character is not', () => {
  // The file name continues with _<id>.json after the part of speech, and with _<partOfSpeech>_<id>.json after the characters.
  assert.equal(pageNameProblem('的士', 'noun.'), null)
  assert.equal(pageNameProblem('的士', 'noun '), null)
  assert.equal(pageNameProblem('的士.', 'noun'), null)
  assert.equal(pageNameProblem('的士 ', 'noun'), null)
  assert.equal(pageNameProblem('啱啱 + V + 就...', 'phrase'), null)
  assert.equal(
    pageNameProblem('的\u0007士', 'noun'),
    'characters "的\u0007士" contain a control character, which cannot appear in a file name',
  )
  assert.equal(pageNameProblem('的士', 'noun'), null)
})

test('a page whose characters end in "..." is a valid file name', () => {
  const path = 'cantonese/啱啱 + V + 就..._phrase_ppppppp4.json'
  assert.deepEqual(
    checkWith(files => {
      files[path] = cabPageCopy(files)
        .replace('ppppppp1', 'ppppppp4')
        .replace('的士', '啱啱 + V + 就...')
        .replace('"noun"', '"phrase"')
      editLookup(lookup => {
        lookup.ppppppp4 = 'ppppppp4'
      })(files)
    }),
    [],
  )
})

test('invalid JSON in a page file', () => {
  assert.deepEqual(
    checkWith(files => {
      files[CAB_PAGE] = '{ nope'
    }),
    [`${CAB_PAGE}: invalid JSON`],
  )
})

test('two pages for one word, different part of speech', () => {
  assert.deepEqual(
    checkWith(files => {
      files['cantonese/的士_verb_ppppppp4.json'] = cabPageCopy(files)
        .replace('ppppppp1', 'ppppppp4')
        .replace('noun', 'verb')
      editLookup(lookup => {
        lookup.ppppppp4 = 'ppppppp4'
      })(files)
    }),
    [],
  )
})

test('a page file inside a subfolder of cantonese/', () => {
  assert.deepEqual(
    checkWith(files => {
      files['cantonese/的/的士_noun_ppppppp1.json'] = files[CAB_PAGE]
    }),
    ['cantonese/的/的士_noun_ppppppp1.json: page files live directly in cantonese/'],
  )
})

/** True when the temp disk holds `a` and `A` as two files (false on default macOS and Windows). */
function diskIsCaseSensitive(): boolean {
  const dir = mkdtempSync(join(tmpdir(), 'case-'))
  writeFileSync(join(dir, 'a'), '')
  writeFileSync(join(dir, 'A'), '')
  return readdirSync(dir).length === 2
}

// Needs a disk that can hold both spellings, so it is skipped on macOS and Windows.
test('two page paths that differ only in letter case', { skip: !diskIsCaseSensitive() }, () => {
  assert.deepEqual(
    checkWith(files => {
      // Ids are lowercase, so two paths can differ only in case just when the id is the same too. The copy carries no entry ids, so the English entry rules stay quiet.
      files['cantonese/的士_Noun_ppppppp1.json'] = cabPageCopy(files).replace('"noun"', '"Noun"')
    }),
    // Paths are sorted, and "N" sorts before "n". The two files hold one id, so that is reported too.
    [
      'cantonese/的士_noun_ppppppp1.json: duplicates cantonese/的士_Noun_ppppppp1.json when letter case is ignored',
      'duplicate page id "ppppppp1" in cantonese/的士_Noun_ppppppp1.json and cantonese/的士_noun_ppppppp1.json',
    ],
  )
})

test('case-only path clash, on in-memory paths', () => {
  const upper = 'cantonese/的士_Noun_ppppppp1.json'
  const lower = 'cantonese/的士_noun_ppppppp1.json'
  assert.deepEqual(
    casePathDuplicates([
      { path: upper, nameOk: true },
      { path: lower, nameOk: true },
    ]),
    [`${lower}: duplicates ${upper} when letter case is ignored`],
  )
  assert.deepEqual(
    casePathDuplicates([
      { path: upper, nameOk: true },
      { path: lower, nameOk: false },
    ]),
    [],
  )
})

test('a page that names another page path reports the file name once', () => {
  assert.deepEqual(
    checkWith(
      editPage('cantonese/車頭_noun_ppppppp2.json', page => {
        page.traditional = '的士'
      }),
    ),
    [
      'cantonese/車頭_noun_ppppppp2.json: file name does not match 的士 noun ppppppp2 (expected cantonese/的士_noun_ppppppp2.json)',
      `${CAB_PAGE_2}: English entry "aaaaaaa2" traditional "的士" differs from ${CAB} ("車頭")`,
    ],
  )
})

test('a page id of the wrong shape reports once', () => {
  assert.deepEqual(
    checkWith(
      editPage('cantonese/車頭_noun_ppppppp2.json', page => {
        page.id = 'BAD'
      }),
    ),
    ['cantonese/車頭_noun_ppppppp2.json: /id must match pattern "^[a-z0-9]{8}$"'],
  )
})

test('a schema-invalid page with a changed well-formed id still reports its lookup errors', () => {
  assert.deepEqual(
    checkWith(
      editPage('cantonese/車頭_noun_ppppppp2.json', page => {
        page.id = 'ppppppp9'
        page.boxes = []
      }),
    ),
    [
      'cantonese/車頭_noun_ppppppp2.json: /boxes must NOT have fewer than 1 items',
      'cantonese/車頭_noun_ppppppp2.json: file name does not match 車頭 noun ppppppp9 (expected cantonese/車頭_noun_ppppppp9.json)',
      'pages-by-id.json: "aaaaaaa2" points at "ppppppp2", which is not a page id',
      'pages-by-id.json: "ppppppp2" points at "ppppppp2", which is not a page id',
      'pages-by-id.json: page "ppppppp9" (cantonese/車頭_noun_ppppppp2.json) does not map to itself',
      `${CAB}: row "aaaaaaa2" is on no page entry`,
    ],
  )
})

test('two pages share an id', () => {
  assert.deepEqual(
    checkWith(files => {
      editPage('cantonese/車頭_noun_ppppppp2.json', page => {
        page.id = 'ppppppp1'
      })(files)
      editLookup(lookup => {
        delete lookup.ppppppp2
        lookup.aaaaaaa2 = 'ppppppp1'
      })(files)
    }),
    [
      'cantonese/車頭_noun_ppppppp2.json: file name does not match 車頭 noun ppppppp1 (expected cantonese/車頭_noun_ppppppp1.json)',
      'duplicate page id "ppppppp1" in cantonese/的士_noun_ppppppp1.json and cantonese/車頭_noun_ppppppp2.json',
    ],
  )
})

test('page id equals an English row id', () => {
  assert.deepEqual(
    checkWith(files => {
      editPage(THURSDAY_PAGE, page => {
        page.id = 'aaaaaaa1'
      })(files)
      editLookup(lookup => {
        delete lookup.ppppppp3
        lookup.aaaaaaa1 = 'aaaaaaa1'
        lookup.bbbbbbb1 = 'aaaaaaa1'
      })(files)
    }),
    [
      'cantonese/星期四_noun_ppppppp3.json: file name does not match 星期四 noun aaaaaaa1 (expected cantonese/星期四_noun_aaaaaaa1.json)',
      'cantonese/星期四_noun_ppppppp3.json: page id "aaaaaaa1" is also an English row id (words/c/cab.json)',
      `${CAB_PAGE}: English entry id "aaaaaaa1" is also a page id`,
      `pages-by-id.json: English entry "aaaaaaa1" (${CAB_PAGE}) maps to "aaaaaaa1", not to its page "ppppppp1"`,
    ],
  )
})

test('no lookup while pages exist', () => {
  assert.deepEqual(
    checkWith(files => {
      delete files['pages-by-id.json']
    }),
    ['pages-by-id.json: missing'],
  )
})

test('no pages and no lookup', () => {
  assert.deepEqual(
    checkWith(files => {
      delete files['pages-by-id.json']
      for (const path of [CAB_PAGE, 'cantonese/車頭_noun_ppppppp2.json', THURSDAY_PAGE]) delete files[path]
    }),
    [
      `${CAB}: row "aaaaaaa1" is on no page entry`,
      `${CAB}: row "aaaaaaa2" is on no page entry`,
      `${THURSDAY}: row "bbbbbbb1" is on no page entry`,
    ],
  )
})

test('lookup that is not an object of 8-character ids', () => {
  assert.deepEqual(
    checkWith(
      editLookup(lookup => {
        lookup.aaaaaaa2 = 'nope'
      }),
    ),
    ['pages-by-id.json: /aaaaaaa2 must match pattern "^[a-z0-9]{8}$"'],
  )
})

test('row missing from the lookup', () => {
  assert.deepEqual(
    checkWith(
      editLookup(lookup => {
        delete lookup.bbbbbbb1
      }),
    ),
    [
      'pages-by-id.json: row "bbbbbbb1" (words/t/Thursday.json) has no page',
      `pages-by-id.json: English entry "bbbbbbb1" (${THURSDAY_PAGE}) has no entry`,
    ],
  )
})

test('lookup points at something that is not a page', () => {
  assert.deepEqual(
    checkWith(
      editLookup(lookup => {
        lookup.aaaaaaa2 = 'aaaaaaa1'
      }),
    ),
    [
      'pages-by-id.json: "aaaaaaa2" points at "aaaaaaa1", which is not a page id',
      `pages-by-id.json: English entry "aaaaaaa2" (${CAB_PAGE_2}) maps to "aaaaaaa1", not to its page "ppppppp2"`,
    ],
  )
})

test('page id missing from the lookup', () => {
  assert.deepEqual(
    checkWith(
      editLookup(lookup => {
        delete lookup.ppppppp3
      }),
    ),
    ['pages-by-id.json: page "ppppppp3" (cantonese/星期四_noun_ppppppp3.json) does not map to itself'],
  )
})

test('page id mapped elsewhere', () => {
  assert.deepEqual(
    checkWith(
      editLookup(lookup => {
        lookup.ppppppp3 = 'ppppppp1'
      }),
    ),
    ['pages-by-id.json: page "ppppppp3" (cantonese/星期四_noun_ppppppp3.json) does not map to itself'],
  )
})

test('a broken page file reports once', () => {
  assert.deepEqual(
    checkWith(files => {
      files['cantonese/車頭_noun_ppppppp2.json'] = '{ nope'
    }),
    ['cantonese/車頭_noun_ppppppp2.json: invalid JSON'],
  )
})

test('a page file that fails its schema reports once', () => {
  assert.deepEqual(
    checkWith(
      editPage('cantonese/車頭_noun_ppppppp2.json', page => {
        delete page.id
      }),
    ),
    ["cantonese/車頭_noun_ppppppp2.json: (root) must have required property 'id'"],
  )
})

test('note rules apply inside boxes', () => {
  assert.deepEqual(
    checkWith(
      editPage(THURSDAY_PAGE, page => {
        page.boxes[0].note = 'See sense 2.'
      }),
    ),
    ['cantonese/星期四_noun_ppppppp3.json: box 1 note points at a numbered sense ("sense 2")'],
  )
})

test('note rule sees every English word in the box', () => {
  assert.deepEqual(
    checkWith(
      editPage(CAB_PAGE, page => {
        page.boxes[0].english.push({ word: 'cab' }, { word: 'slice' })
        page.boxes[0].note = 'Say it for a slice of the fare.'
      }),
    ),
    [],
  )
})

test('placeholder letter in a box example', () => {
  assert.deepEqual(
    checkWith(
      editPage(CAB_PAGE, page => {
        page.boxes[0].examples[0].english = 'A met B at the airport.'
      }),
    ),
    [
      `${CAB_PAGE}: English entry "aaaaaaa1" example differs from ${CAB} (example 1 of the box differs in english)`,
      `${CAB_PAGE}: box 1 example 1 english has a placeholder letter (B)`,
    ],
  )
})

// English entries: each English word in a box is an object, and the ones that
// carry an id are copies of rows in words/ that the check keeps exact.
test('English entry ids are unique across pages', () => {
  const errors = checkWith(files => {
    editPage(CAB_PAGE, page => {
      page.boxes[0].english.push({ word: 'taxi', id: 'ddddddd1' })
    })(files)
    editPage(THURSDAY_PAGE, page => {
      page.boxes[0].english.push({ word: 'taxi', id: 'ddddddd1' })
    })(files)
    editLookup(lookup => {
      lookup.ddddddd1 = 'ppppppp1'
    })(files)
  })
  assert.deepEqual(errors, [
    `duplicate English entry id "ddddddd1" in ${THURSDAY_PAGE} and ${CAB_PAGE}`,
    `pages-by-id.json: English entry "ddddddd1" (${THURSDAY_PAGE}) maps to "ppppppp1", not to its page "ppppppp3"`,
    `${THURSDAY_PAGE}: English entry "ddddddd1" is not a row in words/`,
    `${CAB_PAGE}: English entry "ddddddd1" is not a row in words/`,
  ])
})

test('English entry id equal to a page id', () => {
  assert.deepEqual(
    checkWith(
      editPage(CAB_PAGE, page => {
        page.boxes[0].english.push({ word: 'taxi', id: 'ppppppp2' })
      }),
    ),
    [
      `${CAB_PAGE}: English entry id "ppppppp2" is also a page id`,
      `pages-by-id.json: English entry "ppppppp2" (${CAB_PAGE}) maps to "ppppppp2", not to its page "ppppppp1"`,
      `${CAB_PAGE}: English entry "ppppppp2" is not a row in words/`,
    ],
  )
})

test('English entry id missing from the lookup', () => {
  assert.deepEqual(
    checkWith(
      editLookup(lookup => {
        delete lookup.aaaaaaa1
      }),
    ),
    [
      `pages-by-id.json: row "aaaaaaa1" (${CAB}) has no page`,
      `pages-by-id.json: English entry "aaaaaaa1" (${CAB_PAGE}) has no entry`,
    ],
  )
})

test('English entry id mapped to another page', () => {
  assert.deepEqual(
    checkWith(
      editLookup(lookup => {
        lookup.aaaaaaa1 = 'ppppppp2'
      }),
    ),
    [`pages-by-id.json: English entry "aaaaaaa1" (${CAB_PAGE}) maps to "ppppppp2", not to its page "ppppppp1"`],
  )
})

test('a row that no page entry carries', () => {
  assert.deepEqual(
    checkWith(
      editPage(CAB_PAGE_2, page => {
        page.boxes[0].english = [{ word: 'cab' }]
      }),
    ),
    [`${CAB}: row "aaaaaaa2" is on no page entry`],
  )
})

test('an entry id that is not a row', () => {
  assert.deepEqual(
    checkWith(files => {
      editPage(THURSDAY_PAGE, page => {
        page.boxes[0].english[0].id = 'bbbbbbb9'
      })(files)
      editLookup(lookup => {
        lookup.bbbbbbb9 = 'ppppppp3'
      })(files)
    }),
    [
      `${THURSDAY}: row "bbbbbbb1" is on no page entry`,
      `${THURSDAY_PAGE}: English entry "bbbbbbb9" is not a row in words/`,
    ],
  )
})

test('an entry with only a word sits beside a full entry', () => {
  assert.deepEqual(
    checkWith(
      editPage(CAB_PAGE, page => {
        page.boxes[0].english.push({ word: 'taxi' })
      }),
    ),
    [],
  )
})

test('an entry that differs from its row, field by field', () => {
  assert.deepEqual(
    checkWith(
      editPage(CAB_PAGE, page => {
        page.boxes[0].english[0].word = 'taxicab'
        page.boxes[0].english[0].meaning = 'a car for hire'
        delete page.boxes[0].english[0].note
        page.boxes[0].english[0].register = 'formal'
        page.jyutping = 'dik1 si3'
      }),
    ),
    [
      `${CAB_PAGE}: English entry "aaaaaaa1" word "taxicab" differs from ${CAB} ("cab")`,
      `${CAB_PAGE}: English entry "aaaaaaa1" meaning "a car for hire" differs from ${CAB} ("taxi")`,
      `${CAB_PAGE}: English entry "aaaaaaa1" note "" differs from ${CAB} ("This is the all-purpose Cantonese noun for a taxi or cab.")`,
      `${CAB_PAGE}: English entry "aaaaaaa1" register "formal" differs from ${CAB} ("")`,
      `${CAB_PAGE}: English entry "aaaaaaa1" jyutping "dik1 si3" differs from ${CAB} ("dik1 si2")`,
    ],
  )
})

test('an entry whose page has another part of speech or characters than its row', () => {
  assert.deepEqual(
    checkWith(
      editCabRaw(cab => {
        cab.rows[0].partOfSpeech = 'verb'
        cab.rows[0].traditional = '德士'
      }),
    ),
    [
      `${CAB_PAGE}: English entry "aaaaaaa1" partOfSpeech "noun" differs from ${CAB} ("verb")`,
      `${CAB_PAGE}: English entry "aaaaaaa1" traditional "的士" differs from ${CAB} ("德士")`,
    ],
  )
})

test('a row part of speech with a slash matches a page with a fullwidth slash', () => {
  assert.deepEqual(
    checkWith(files => {
      files[THURSDAY] = files[THURSDAY].replace('"partOfSpeech": "noun"', '"partOfSpeech": "N/V"')
      const page = JSON.parse(files[THURSDAY_PAGE])
      page.partOfSpeech = 'N／V'
      delete files[THURSDAY_PAGE]
      files['cantonese/星期四_N／V_ppppppp3.json'] = JSON.stringify(page, null, 2) + '\n'
    }),
    [],
  )
})

test('entry-to-row rules stay quiet when there are no word files', () => {
  assert.deepEqual(
    checkWith(files => {
      delete files[CAB]
      delete files[THURSDAY]
    }),
    [
      'frequency.json: id "aaaaaaa1" is in no word file',
      'frequency.json: id "aaaaaaa2" is in no word file',
      'frequency.json: id "bbbbbbb1" is in no word file',
      'frequency.json: "Thursday" has no word file',
      'frequency.json: "cab" has no word file',
      'aliases.json: "Thursday" has no word file',
    ],
  )
})

test('frequency.json order must be the index of the row in its word file', () => {
  assert.deepEqual(
    checkWith(
      editFrequency(freq => {
        freq.rows.aaaaaaa2.order = 0
      }),
    ),
    [`frequency.json: row "aaaaaaa2" order 0 but it is row 1 of ${CAB}`],
  )
})

test('frequency.json row without an order, or with a negative one', () => {
  assert.deepEqual(
    checkWith(
      editFrequency(freq => {
        delete freq.rows.bbbbbbb1.order
      }),
    ),
    ["frequency.json: /rows/bbbbbbb1 must have required property 'order'"],
  )
  assert.deepEqual(
    checkWith(
      editFrequency(freq => {
        freq.rows.bbbbbbb1.order = -1
      }),
    ),
    ['frequency.json: /rows/bbbbbbb1/order must be >= 0'],
  )
})

test('an English entry note is held to the note rules', () => {
  assert.deepEqual(
    checkWith(
      editPage(CAB_PAGE, page => {
        page.boxes[0].english.push({ word: 'taxi', note: 'See sense 2.' })
      }),
    ),
    [`${CAB_PAGE}: box 1 English entry "taxi" note points at a numbered sense ("sense 2")`],
  )
})

test('an English entry with an unknown field is refused by the schema', () => {
  assert.deepEqual(
    checkWith(
      editPage(THURSDAY_PAGE, page => {
        page.boxes[0].english.push({ word: 'Thu', color: 'red' })
      }),
    ),
    [`${THURSDAY_PAGE}: /boxes/0/english/1 must NOT have additional properties "color"`],
  )
})

test('an English word written as a bare string is refused by the schema', () => {
  assert.deepEqual(
    checkWith(
      editPage(THURSDAY_PAGE, page => {
        page.boxes[0].english.push('Thu')
      }),
    ),
    [`${THURSDAY_PAGE}: /boxes/0/english/1 must be object`],
  )
})

/** Changes the page at `from` (to `to`) and the row's reading or characters, as a test of the slash mapping needs. */
function moveThursdayPage(files: Record<string, string>, to: string, edit: (page: any) => void): void {
  const page = JSON.parse(files[THURSDAY_PAGE])
  edit(page)
  delete files[THURSDAY_PAGE]
  files[to] = JSON.stringify(page, null, 2) + '\n'
}

test('a row character string with a slash matches a page with a fullwidth slash', () => {
  assert.deepEqual(
    checkWith(files => {
      files[THURSDAY] = files[THURSDAY].replace('"星期四"', '"星/期四"')
      moveThursdayPage(files, 'cantonese/星／期四_noun_ppppppp3.json', page => {
        page.traditional = '星／期四'
      })
    }),
    [],
  )
})

test('a reading is compared exactly, slash included', () => {
  const reading = 'sing1 kei4 sei3/sing1'
  assert.deepEqual(
    checkWith(files => {
      files[THURSDAY] = files[THURSDAY].replace('"sing1 kei4 sei3"', `"${reading}"`)
      moveThursdayPage(files, THURSDAY_PAGE, page => {
        page.jyutping = reading
      })
    }),
    [],
  )
  assert.deepEqual(
    checkWith(files => {
      files[THURSDAY] = files[THURSDAY].replace('"sing1 kei4 sei3"', `"${reading}"`)
      moveThursdayPage(files, THURSDAY_PAGE, page => {
        page.jyutping = reading.replace('/', '／')
      })
    }),
    [
      `${THURSDAY_PAGE}: English entry "bbbbbbb1" jyutping "sing1 kei4 sei3／sing1" differs from ${THURSDAY} ("${reading}")`,
    ],
  )
})

test('a row with a register whose entry lacks it', () => {
  assert.deepEqual(
    checkWith(
      editPage(CAB_PAGE_2, page => {
        delete page.boxes[0].english[0].register
      }),
    ),
    [`${CAB_PAGE_2}: English entry "aaaaaaa2" register "" differs from ${CAB} ("colloquial")`],
  )
})

test('one broken page hides only its own rows from "row is on no page entry"', () => {
  assert.deepEqual(
    checkWith(files => {
      files[CAB_PAGE] = '{ nope'
      editPage(THURSDAY_PAGE, page => {
        page.boxes[0].english[0] = { word: 'Thursday' }
      })(files)
    }),
    [`${CAB_PAGE}: invalid JSON`, `${THURSDAY}: row "bbbbbbb1" is on no page entry`],
  )
})

test('the row example must be the box example at the entry position', () => {
  assert.deepEqual(
    checkWith(
      editPage(CAB_PAGE, page => {
        page.boxes[0].examples[0].traditional = '我哋叫咗架的士。'
        page.boxes[0].examples[0].jyutping = 'ngo5 dei6'
      }),
    ),
    [
      `${CAB_PAGE}: English entry "aaaaaaa1" example differs from ${CAB} (example 1 of the box differs in traditional, jyutping)`,
    ],
  )
  assert.deepEqual(
    checkWith(
      editPage(CAB_PAGE, page => {
        page.boxes[0].examples = []
      }),
    ),
    [
      `${CAB_PAGE}: English entry "aaaaaaa1" example differs from ${CAB} (the row has an example but the box has no example 1)`,
    ],
  )
})

test('a row without an example needs no box example at its position, and may not have one', () => {
  assert.deepEqual(
    checkWith(
      editPage(CAB_PAGE_2, page => {
        page.boxes[0].examples = [
          { english: 'It rode on the cab.', traditional: '佢坐車頭。', jyutping: 'keoi5 co5 ce1 tau4' },
        ]
      }),
    ),
    [
      `${CAB_PAGE_2}: English entry "aaaaaaa2" example differs from ${CAB} (the row has no example but example 1 of the box is "It rode on the cab.")`,
    ],
  )
})

test('the example is paired by the entry position in the box', () => {
  assert.deepEqual(
    checkWith(
      editPage(CAB_PAGE, page => {
        page.boxes[0].english.unshift({ word: 'taxi' })
      }),
    ),
    [
      `${CAB_PAGE}: English entry "aaaaaaa1" example differs from ${CAB} (the row has an example but the box has no example 2)`,
    ],
  )
})
