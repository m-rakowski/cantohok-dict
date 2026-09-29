// Tests for check.ts: takes the valid two-word fixture, breaks one thing at
// a time, and checks the exact error message check.ts reports. Run with
// `pnpm run test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { format } from 'prettier'
import { checkRepo } from './check.ts'
import { validFixture, writeTree } from './test-helpers.ts'

const CAB = 'words/c/cab.json'
const THURSDAY = 'words/t/Thursday.json'

const repoRoot = join(import.meta.dirname, '..')
const prettierConfig = JSON.parse(readFileSync(join(repoRoot, '.prettierrc.json'), 'utf8'))

/** Runs the check on the valid fixture with `change` applied to a copy. */
function checkWith(change: (files: Record<string, string>) => void): string[] {
  const files = validFixture()
  change(files)
  return checkRepo(writeTree(files))
}

/** Parses CAB, lets `edit` mutate the object, writes it back. */
function editCab(edit: (cab: any) => void): (files: Record<string, string>) => void {
  return files => {
    const cab = JSON.parse(files[CAB])
    edit(cab)
    files[CAB] = JSON.stringify(cab, null, 2) + '\n'
  }
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
        cab.rows[0].colour = 'red'
      }),
    ),
    [`${CAB}: /rows/0 must NOT have additional properties "colour"`],
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
      editCab(cab => {
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
      editCab(cab => {
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
      editCab(cab => {
        cab.rows[1].register = ''
      }),
    ),
    [`${CAB}: /rows/1/register must match pattern "\\S"`],
  )
})

test('example missing a field', () => {
  assert.deepEqual(
    checkWith(
      editCab(cab => {
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
    [`${CAB}: /rows/0/id must match pattern "^[a-z0-9]{8}$"`],
  )
})

test('duplicate id across files', () => {
  assert.deepEqual(
    checkWith(
      editCab(cab => {
        cab.rows[1].id = 'bbbbbbb1'
      }),
    ),
    [`duplicate id "bbbbbbb1" in ${CAB} and ${THURSDAY}`, 'frequency.json: id "aaaaaaa2" is in no word file'],
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
    editFrequency(freq => {
      freq.rows.bbbbbbb2 = { meaningShare: 100, share: 100 }
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
        freq.rows.zzzzzzz9 = { meaningShare: 1, share: 1 }
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
      editFrequency(freq => {
        freq.rows.ccccccc1 = { meaningShare: 100, share: 100 }
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
    editFrequency(freq => {
      freq.rows.ccccccc7 = { meaningShare: 100, share: 100 }
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
  for (const note of ['Use this for the formal side of sense 2.', 'Use this for the second sense of cab.'])
    assert.deepEqual(
      checkWith(
        editCab(cab => {
          cab.rows[0].note = note
        }),
      ),
      [`${CAB}: row "aaaaaaa1" note points at a numbered sense ("${note.match(/sense 2|second sense/)![0]}")`],
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
    [`${CAB}: row "aaaaaaa1" note says "slice" on a row that is not about slices`],
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
    [`${CAB}: row "aaaaaaa1" example.english has a placeholder letter (A, B)`],
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
      editFrequency(freq => {
        freq.rows.ccccccc1 = { meaningShare: 100, share: 100 }
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
    [`${CAB}: row "aaaaaaa1" note calls itself part of a meaning ("side of the meaning")`],
  )
})

test('note that points at the generator’s example', () => {
  assert.deepEqual(
    checkWith(
      editCab(cab => {
        cab.rows[0].note = 'This is the standard choice for the default example “call a cab”.'
      }),
    ),
    [`${CAB}: row "aaaaaaa1" note points at the generator's example ("the default example")`],
  )
})

test('placeholder letters that look like part of a word', () => {
  for (const [english, letter] of [
    ["We took B's cab.", 'B'],
    ['We took B’s cab.', 'B'],
    ['Mr. A called a cab.', 'A'],
  ])
    assert.deepEqual(
      checkWith(
        editCab(cab => {
          cab.rows[0].example.english = english
        }),
      ),
      [`${CAB}: row "aaaaaaa1" example.english has a placeholder letter (${letter})`],
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
