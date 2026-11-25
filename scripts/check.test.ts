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
      for (const entry of page.english) {
        const row = cab.rows.find((candidate: any) => candidate.id === entry.id)
        if (!row) continue
        entry.word = cab.term
        entry.meaning = row.meaning
        entry.note = row.note
        // The page's sentence keeps its id when the row's text is copied over it.
        if (row.example) entry.exampleSentences = [{ id: entry.exampleSentences[0]?.id ?? 'sssssss1', ...row.example }]
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
  for (const entry of page.english) {
    delete entry.id
    // A copy is a new sentence: it gets its own id (sentence ids are unique across the repo).
    for (const sentence of entry.exampleSentences) sentence.id = 'copy' + sentence.id.slice(4)
  }
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
  const entry: any = { id, word: word.term, meaning: row.meaning, exampleSentences: [] }
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
        english: [],
      }
  page.english.push(entry)
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
    // Prettier reads neither a LICENSE nor .jsonl; scripts/corpus.ts owns those lines' form.
    if (path.startsWith('corpus/')) continue
    const formatted = await format(contents, { ...prettierConfig, filepath: path })
    assert.equal(formatted, contents, path)
  }
})

test('invalid JSON', () => {
  assert.deepEqual(
    checkWith(files => {
      files[CAB] = '{ nope'
    }),
    [`${CAB}: invalid JSON`],
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
    [`${CAB}: /term must match pattern "\\S"`],
  )
})

test('blank term (whitespace only)', () => {
  assert.deepEqual(
    checkWith(
      editCabRaw(cab => {
        cab.term = ' '
      }),
    ),
    [`${CAB}: /term must match pattern "\\S"`],
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
    [
      `duplicate id "bbbbbbb1" in ${CAB} and ${THURSDAY}`,
      `${CAB}: meaning "noun · taxi" has rows with different meaningShare (80, 100)`,
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
    [`${CAB}: /rows must NOT have fewer than 1 items`],
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
    ['frequency.json: id "zzzzzzz9" is in no page entry or word file'],
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
    [`frequency.json: "bus" is no page entry's word and has no word file`],
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
    [`aliases.json: "bus" is no page entry's word and has no word file`],
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

/** Runs the check with `change` applied to the fixture's parsed pictures.json. */
function checkPictures(change: (pictures: Record<string, unknown[]>, files: Record<string, string>) => void): string[] {
  return checkWith(files => {
    const pictures = JSON.parse(files['pictures.json'])
    change(pictures, files)
    files['pictures.json'] = JSON.stringify(pictures, null, 2) + '\n'
  })
}

test('missing pictures.json', () => {
  assert.deepEqual(
    checkWith(files => {
      delete files['pictures.json']
    }),
    ['pictures.json: missing'],
  )
})

test('pictures.json key that is no page id', () => {
  assert.deepEqual(
    checkPictures(pictures => {
      pictures.zzzzzzz9 = [{ commons: 1, license: 'CC0' }]
    }),
    ['pictures.json: "zzzzzzz9" is not a page id'],
  )
})

// pages-by-id.json keeps old ids pointing at the page they were merged into; photos belong to the page itself.
test('pictures.json key that is only an old id in pages-by-id.json', () => {
  assert.deepEqual(
    checkPictures((pictures, files) => {
      const lookup = JSON.parse(files['pages-by-id.json'])
      lookup.qqqqqqq1 = 'ppppppp1'
      files['pages-by-id.json'] = JSON.stringify(lookup, null, 2) + '\n'
      pictures.qqqqqqq1 = [{ commons: 1, license: 'CC0' }]
    }),
    ['pictures.json: "qqqqqqq1" is not a page id'],
  )
})

test('pictures.json key of the wrong shape', () => {
  assert.deepEqual(
    checkPictures(pictures => {
      pictures.Bad = [{ commons: 1, license: 'CC0' }]
    }),
    ['pictures.json: (root) must match pattern "^[a-z0-9]{8}$"', 'pictures.json: (root) property name must be valid'],
  )
})

test('pictures.json photo with a license that is not on the free list', () => {
  assert.deepEqual(
    checkPictures(pictures => {
      pictures.ppppppp1 = [{ author: 'Jane Doe', commons: 1, license: 'CC BY-NC 4.0' }]
    }),
    [
      'pictures.json: /ppppppp1/0/license must be equal to one of the allowed values: CC0, Public domain, No restrictions, Copyrighted free use, CC BY 2.0, CC BY 2.5, CC BY 3.0, CC BY 4.0, CC BY-SA 2.0, CC BY-SA 2.5, CC BY-SA 3.0, CC BY-SA 4.0, CC BY-SA 2.0 de, CC BY 2.5 cn',
      'pictures.json: /ppppppp1/0 must match "then" schema',
    ],
  )
})

test('pictures.json "CC BY" photo with no author', () => {
  assert.deepEqual(
    checkPictures(pictures => {
      pictures.ppppppp1 = [{ commons: 1, license: 'CC BY 2.0' }]
    }),
    [
      "pictures.json: /ppppppp1/0 must have required property 'author'",
      'pictures.json: /ppppppp1/0 must match "then" schema',
      'pictures.json: /ppppppp1/0 must match "then" schema',
    ],
  )
})

test('pictures.json photo with a blank author', () => {
  assert.deepEqual(
    checkPictures(pictures => {
      pictures.ppppppp1 = [{ author: ' ', commons: 1, license: 'CC0' }]
    }),
    [
      'pictures.json: /ppppppp1/0/author must match pattern "\\S"',
      'pictures.json: /ppppppp1/0 must match "then" schema',
    ],
  )
})

test('pictures.json photo with an unknown field', () => {
  assert.deepEqual(
    checkPictures(pictures => {
      pictures.ppppppp1 = [{ commons: 1, license: 'CC0', url: 'https://example.com/a.jpg' }]
    }),
    [
      'pictures.json: /ppppppp1/0 must NOT have additional properties "url"',
      'pictures.json: /ppppppp1/0 must match "then" schema',
    ],
  )
})

test('pictures.json page with no photos', () => {
  assert.deepEqual(
    checkPictures(pictures => {
      pictures.ppppppp1 = []
    }),
    ['pictures.json: /ppppppp1 must NOT have fewer than 1 items'],
  )
})

test('pictures.json page listing one Commons file twice', () => {
  assert.deepEqual(
    checkPictures(pictures => {
      pictures.ppppppp1 = [
        { commons: 12345, license: 'CC0' },
        { commons: 12345, license: 'CC0' },
      ]
    }),
    ['pictures.json: page "ppppppp1" lists Commons file 12345 twice'],
  )
})

const PEXELS_PHOTO = { author: 'Pixabay', file: 'beer-ale-bitter-fermented-52994.jpeg', pexels: 52994 }

test('pictures.json Pexels photo, alone and beside a Commons photo with the same number', () => {
  assert.deepEqual(
    checkPictures(pictures => {
      pictures.ppppppp1 = [PEXELS_PHOTO, { commons: 52994, license: 'CC0' }]
    }),
    [],
  )
})

test('pictures.json Pexels photo with no author', () => {
  assert.deepEqual(
    checkPictures(pictures => {
      pictures.ppppppp1 = [{ file: PEXELS_PHOTO.file, pexels: PEXELS_PHOTO.pexels }]
    }),
    [
      "pictures.json: /ppppppp1/0 must have required property 'author'",
      'pictures.json: /ppppppp1/0 must match "else" schema',
    ],
  )
})

test('pictures.json Pexels photo with no file', () => {
  assert.deepEqual(
    checkPictures(pictures => {
      pictures.ppppppp1 = [{ author: 'Pixabay', pexels: 52994 }]
    }),
    [
      "pictures.json: /ppppppp1/0 must have required property 'file'",
      'pictures.json: /ppppppp1/0 must match "else" schema',
    ],
  )
})

test('pictures.json Pexels photo whose file is a path or not an image', () => {
  assert.deepEqual(
    checkPictures(pictures => {
      pictures.ppppppp1 = [
        { ...PEXELS_PHOTO, file: '../52994.jpeg' },
        { ...PEXELS_PHOTO, pexels: 7, file: 'a-7.gif' },
      ]
    }),
    [
      'pictures.json: /ppppppp1/0/file must match pattern "^[A-Za-z0-9][A-Za-z0-9._-]*\\.(jpeg|jpg|png)$"',
      'pictures.json: /ppppppp1/0 must match "else" schema',
      'pictures.json: /ppppppp1/1/file must match pattern "^[A-Za-z0-9][A-Za-z0-9._-]*\\.(jpeg|jpg|png)$"',
      'pictures.json: /ppppppp1/1 must match "else" schema',
    ],
  )
})

test('pictures.json photo naming both a Commons and a Pexels photo', () => {
  assert.deepEqual(
    checkPictures(pictures => {
      pictures.ppppppp1 = [{ ...PEXELS_PHOTO, commons: 1, license: 'CC0' }]
    }),
    [
      'pictures.json: /ppppppp1/0 must NOT have additional properties "file"',
      'pictures.json: /ppppppp1/0 must NOT have additional properties "pexels"',
      'pictures.json: /ppppppp1/0 must match "then" schema',
    ],
  )
})

test('pictures.json Pexels photo with a license', () => {
  assert.deepEqual(
    checkPictures(pictures => {
      pictures.ppppppp1 = [{ ...PEXELS_PHOTO, license: 'CC0' }]
    }),
    [
      'pictures.json: /ppppppp1/0 must NOT have additional properties "license"',
      'pictures.json: /ppppppp1/0 must match "else" schema',
    ],
  )
})

test('pictures.json page listing one Pexels photo twice', () => {
  assert.deepEqual(
    checkPictures(pictures => {
      pictures.ppppppp1 = [PEXELS_PHOTO, PEXELS_PHOTO]
    }),
    ['pictures.json: page "ppppppp1" lists Pexels photo 52994 twice'],
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
        `${CAB_PAGE}: English entry "cab" note points at a numbered sense ("${pointer}")`,
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
      `${CAB_PAGE}: English entry "cab" note points at a numbered sense ("(39)")`,
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
      `${CAB_PAGE}: English entry "cab" note says "slice" on a row that is not about slices`,
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
      `${CAB_PAGE}: English entry "cab" sentence 1 english has a placeholder letter (A, B)`,
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
      `${CAB_PAGE}: English entry "cab" note calls itself part of a meaning ("side of the meaning")`,
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
        `${CAB_PAGE}: English entry "cab" note calls itself part of a meaning ("${part}")`,
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
      `${CAB_PAGE}: English entry "cab" note points at the generator's example ("the default example")`,
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
        `${CAB_PAGE}: English entry "cab" sentence 1 english has a placeholder letter (${letter})`,
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

test('a page with a boxes key fails the schema', () => {
  assert.deepEqual(
    checkWith(
      editPage(CAB_PAGE, page => {
        page.boxes = [{ meaning: 'taxi', english: [{ word: 'cab' }], examples: [] }]
      }),
    ),
    [`${CAB_PAGE}: (root) must NOT have additional properties "boxes"`],
  )
})

test('page with no English word', () => {
  assert.deepEqual(
    checkWith(
      editPage(CAB_PAGE, page => {
        page.english = []
      }),
    ),
    [`${CAB_PAGE}: /english must NOT have fewer than 1 items`],
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

test('two pages with the same word, part of speech and reading but different English words pass', () => {
  assert.deepEqual(
    checkWith(files => {
      files['cantonese/的士_noun_wxyz5678.json'] = cabPageCopy(files)
        .replace('ppppppp1', 'wxyz5678')
        .replace('"word": "cab"', '"word": "taxi"')
      editLookup(lookup => {
        lookup.wxyz5678 = 'wxyz5678'
      })(files)
    }),
    [],
  )
})

test('a second sense that uses the same English word with another meaning passes', () => {
  assert.deepEqual(
    checkWith(files => {
      files['cantonese/的士_noun_wxyz5678.json'] = cabPageCopy(files)
        .replace('ppppppp1', 'wxyz5678')
        .replace('"meaning": "taxi"', '"meaning": "driver of a taxi"')
      editLookup(lookup => {
        lookup.wxyz5678 = 'wxyz5678'
      })(files)
    }),
    [],
  )
})

test('two pages with the same word, part of speech, reading and English words and meanings, in any order', () => {
  const copy = 'cantonese/的士_noun_wxyz5678.json'
  assert.deepEqual(
    checkWith(files => {
      editPage(CAB_PAGE, page => {
        page.english.push({ word: 'taxi', meaning: 'taxi', exampleSentences: [] })
      })(files)
      const copied = JSON.parse(cabPageCopy(files).replace('ppppppp1', 'wxyz5678'))
      copied.english.reverse()
      files[copy] = JSON.stringify(copied, null, 2) + '\n'
      editLookup(lookup => {
        lookup.wxyz5678 = 'wxyz5678'
      })(files)
    }),
    [
      `${copy}: same word, part of speech, reading, English words and meanings (的士 noun dik1 si2 cab: taxi · taxi: taxi) as ${CAB_PAGE}`,
    ],
  )
})

test('an English entry with no meaning is refused', () => {
  assert.deepEqual(
    checkWith(
      editPage(CAB_PAGE, page => {
        delete page.english[0].meaning
      }),
    ),
    [`${CAB_PAGE}: /english/0 must have required property 'meaning'`],
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
    [`${path}: ${problem}`],
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
        .replace('"traditional": "的士"', '"traditional": "啱啱 + V + 就..."')
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

test('a page with partOfSpeech "intj" passes', () => {
  assert.deepEqual(
    checkWith(files => {
      files['cantonese/車頭_intj_ppppppp2.json'] = files[CAB_PAGE_2].replace('"noun"', '"intj"')
      delete files[CAB_PAGE_2]
    }),
    [],
  )
})

test('a page with partOfSpeech outside the allowed list', () => {
  assert.deepEqual(
    checkWith(files => {
      files[CAB_PAGE_2] = files[CAB_PAGE_2].replace('"noun"', '"particle"')
    }),
    [
      `${CAB_PAGE_2}: /partOfSpeech must be equal to one of the allowed values: noun, verb, adj, adv, prep, pron, det, conj, num, name, intj, phrase, postp, null`,
    ],
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
      // Ids are lowercase and the part of speech must be one of the allowed lowercase values, so two paths can differ only in case in the characters, and only when the id is the same too. The first page is the cab page with "T恤" as its characters; the copy carries no entry ids, so the English entry rules stay quiet.
      const upper = JSON.parse(files[CAB_PAGE])
      upper.traditional = 'T恤'
      files['cantonese/T恤_noun_ppppppp1.json'] = JSON.stringify(upper, null, 2) + '\n'
      files['cantonese/t恤_noun_ppppppp1.json'] = cabPageCopy(files).replace('"的士"', '"t恤"')
      delete files[CAB_PAGE]
    }),
    // Paths are sorted, and "T" sorts before "t". The two files hold one id, so that is reported too.
    [
      'cantonese/t恤_noun_ppppppp1.json: duplicates cantonese/T恤_noun_ppppppp1.json when letter case is ignored',
      'duplicate page id "ppppppp1" in cantonese/T恤_noun_ppppppp1.json and cantonese/t恤_noun_ppppppp1.json',
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
        page.english = []
      }),
    ),
    [
      'cantonese/車頭_noun_ppppppp2.json: /english must NOT have fewer than 1 items',
      'cantonese/車頭_noun_ppppppp2.json: file name does not match 車頭 noun ppppppp9 (expected cantonese/車頭_noun_ppppppp9.json)',
      'pages-by-id.json: "aaaaaaa2" points at "ppppppp2", which is not a page id',
      'pages-by-id.json: "ppppppp2" points at "ppppppp2", which is not a page id',
      'pages-by-id.json: page "ppppppp9" (cantonese/車頭_noun_ppppppp2.json) does not map to itself',
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
      files['pictures.json'] = '{}\n'
    }),
    [],
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

for (const field of ['meaning', 'note', 'register'])
  test(`a page with a ${field} of its own is refused (each English entry carries its own)`, () => {
    assert.deepEqual(
      checkWith(
        editPage(THURSDAY_PAGE, page => {
          page[field] = 'day of the week'
        }),
      ),
      [`${THURSDAY_PAGE}: (root) must NOT have additional properties "${field}"`],
    )
  })

test('placeholder letter in a page example', () => {
  assert.deepEqual(
    checkWith(
      editPage(CAB_PAGE, page => {
        page.english[0].exampleSentences[0].english = 'A met B at the airport.'
      }),
    ),
    [`${CAB_PAGE}: English entry "cab" sentence 1 english has a placeholder letter (B)`],
  )
})

// English entries: each English word on a page is an object, and the ones that
// carry an id are copies of rows in words/ that the check keeps exact.
test('English entry ids are unique across pages', () => {
  const errors = checkWith(files => {
    editPage(CAB_PAGE, page => {
      page.english.push({ word: 'taxi', meaning: 'taxi', exampleSentences: [], id: 'ddddddd1' })
    })(files)
    editPage(THURSDAY_PAGE, page => {
      page.english.push({ word: 'taxi', meaning: 'taxi', exampleSentences: [], id: 'ddddddd1' })
    })(files)
    editLookup(lookup => {
      lookup.ddddddd1 = 'ppppppp1'
    })(files)
  })
  assert.deepEqual(errors, [
    `duplicate English entry id "ddddddd1" in ${THURSDAY_PAGE} and ${CAB_PAGE}`,
    `pages-by-id.json: English entry "ddddddd1" (${THURSDAY_PAGE}) maps to "ppppppp1", not to its page "ppppppp3"`,
  ])
})

test('English entry id equal to a page id', () => {
  assert.deepEqual(
    checkWith(
      editPage(CAB_PAGE, page => {
        page.english.push({ word: 'taxi', meaning: 'taxi', exampleSentences: [], id: 'ppppppp2' })
      }),
    ),
    [
      `${CAB_PAGE}: English entry id "ppppppp2" is also a page id`,
      `pages-by-id.json: English entry "ppppppp2" (${CAB_PAGE}) maps to "ppppppp2", not to its page "ppppppp1"`,
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

test('an entry with only a word sits beside a full entry', () => {
  assert.deepEqual(
    checkWith(
      editPage(CAB_PAGE, page => {
        page.english.push({ word: 'taxi', meaning: 'taxi', exampleSentences: [] })
      }),
    ),
    [],
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
        page.english.push({ word: 'taxi', meaning: 'taxi', exampleSentences: [], note: 'See sense 2.' })
      }),
    ),
    [`${CAB_PAGE}: English entry "taxi" note points at a numbered sense ("sense 2")`],
  )
})

test('an English entry with an unknown field is refused by the schema', () => {
  assert.deepEqual(
    checkWith(
      editPage(THURSDAY_PAGE, page => {
        page.english.push({ word: 'Thu', meaning: 'day of the week', color: 'red', exampleSentences: [] })
      }),
    ),
    [`${THURSDAY_PAGE}: /english/1 must NOT have additional properties "color"`],
  )
})

test('an English word written as a bare string is refused by the schema', () => {
  assert.deepEqual(
    checkWith(
      editPage(THURSDAY_PAGE, page => {
        page.english.push('Thu')
      }),
    ),
    [`${THURSDAY_PAGE}: /english/1 must be object`],
  )
})

test('a page may drop one of its entries while the row stays in words/', () => {
  assert.deepEqual(
    checkWith(
      editPage(CAB_PAGE, page => {
        page.english = [{ word: 'taxi', meaning: 'taxi', exampleSentences: [] }]
      }),
    ),
    [],
  )
})

test('a page-only word needs no word file: its entry id, rank and alias are accepted', () => {
  assert.deepEqual(
    checkWith(files => {
      const page = JSON.parse(files['cantonese/星期四_noun_ppppppp3.json'])
      page.english.push({
        id: 'ddddddd1',
        word: 'Friday',
        meaning: 'day of the week',
        note: 'This is the all-purpose word for Friday.',
        exampleSentences: [],
      })
      files['cantonese/星期四_noun_ppppppp3.json'] = JSON.stringify(page, null, 2) + '\n'
      const lookup = JSON.parse(files['pages-by-id.json'])
      lookup.ddddddd1 = 'ppppppp3'
      files['pages-by-id.json'] = JSON.stringify(lookup, null, 2) + '\n'
      const freq = JSON.parse(files['frequency.json'])
      freq.rows.ddddddd1 = { meaningShare: 100, share: 100, order: 1 }
      freq.words.Friday = 950
      files['frequency.json'] = JSON.stringify(freq, null, 2) + '\n'
      files['aliases.json'] = JSON.stringify({ Thursday: ['thursdays'], Friday: ['fridays'] }, null, 2) + '\n'
    }),
    [],
  )
})

/** Parses the cab page, lets `edit` change its first English entry's sentences, writes it back. */
function editCabPageSentences(edit: (sentences: any[]) => void): (files: Record<string, string>) => void {
  return files => {
    const page = JSON.parse(files[CAB_PAGE])
    edit(page.english[0].exampleSentences)
    files[CAB_PAGE] = JSON.stringify(page, null, 2) + '\n'
  }
}

test('an example sentence with no id', () => {
  const errors = checkWith(editCabPageSentences(sentences => delete sentences[0].id))
  assert.deepEqual(errors, [`${CAB_PAGE}: /english/0/exampleSentences/0 must have required property 'id'`])
})

test('an example sentence id of the wrong shape', () => {
  const errors = checkWith(editCabPageSentences(sentences => (sentences[0].id = 'BAD')))
  assert.deepEqual(errors, [`${CAB_PAGE}: /english/0/exampleSentences/0/id must match pattern "^[a-z0-9]{8}$"`])
})

test('two example sentences with one id on a page', () => {
  const errors = checkWith(
    editCabPageSentences(sentences =>
      sentences.push({
        id: 'sssssss1',
        english: 'The cab is late.',
        traditional: '架的士遲咗。',
        jyutping: 'gaa3 dik1 si2 ci4 zo2',
      }),
    ),
  )
  assert.deepEqual(errors, [`${CAB_PAGE}: example sentence id "sssssss1" is already used in ${CAB_PAGE}`])
})

test('the same example sentence id on two pages', () => {
  const errors = checkWith(files => {
    const page = JSON.parse(files[THURSDAY_PAGE])
    page.english[0].exampleSentences.push({
      id: 'sssssss1',
      english: 'See you on Thursday.',
      traditional: '星期四見。',
      jyutping: 'sing1 kei4 sei3 gin3',
    })
    files[THURSDAY_PAGE] = JSON.stringify(page, null, 2) + '\n'
  })
  // Pages are checked in path order, and 星期四 sorts before 的士.
  assert.deepEqual(errors, [`${CAB_PAGE}: example sentence id "sssssss1" is already used in ${THURSDAY_PAGE}`])
})

/** Parses CAB_PAGE_2, lets `edit` change it, and writes it back. */
function editPage2(edit: (page: any) => void): (files: Record<string, string>) => void {
  return files => {
    const page = JSON.parse(files[CAB_PAGE_2])
    edit(page)
    files[CAB_PAGE_2] = JSON.stringify(page, null, 2) + '\n'
  }
}

test('a page with a Cantonese part of speech and variants', () => {
  assert.deepEqual(
    checkWith(
      editPage2(page => {
        page.cantonesePartOfSpeech = 'noun'
        page.variants = ['車頭X']
      }),
    ),
    [],
  )
})

test('a page with a Cantonese part of speech outside the allowed list', () => {
  assert.deepEqual(checkWith(editPage2(page => (page.cantonesePartOfSpeech = 't'))), [
    `${CAB_PAGE_2}: /cantonesePartOfSpeech must be equal to one of the allowed values: noun, verb, adjective, adverb, pronoun, conjunction, preposition, measure word, particle, sentence-final particle, interjection, sound word, time word, place word, direction word, numeral, idiom, fixed expression, non-predicate adjective, descriptive word, prefix, suffix, abbreviation, name`,
  ])
})

test('a page with a repeated variant', () => {
  // Ajv names the two positions in an order that depends on how the schema is written, so only that is left open.
  const errors = checkWith(editPage2(page => (page.variants = ['車頭X', '車頭X'])))
  assert.equal(errors.length, 1)
  assert.match(
    errors[0]!,
    /^cantonese\/車頭_noun_ppppppp2\.json: \/variants must NOT have duplicate items \(items ## [01] and [01] are identical\)$/u,
  )
})

test('a page with an empty variants list', () => {
  assert.deepEqual(checkWith(editPage2(page => (page.variants = []))), [
    `${CAB_PAGE_2}: /variants must NOT have fewer than 1 items`,
  ])
})

test('a page whose variant is its own word', () => {
  assert.deepEqual(checkWith(editPage2(page => (page.variants = ['車頭']))), [
    `${CAB_PAGE_2}: variant "車頭" is the page's own word`,
  ])
})

test('a page whose variant has spaces around it', () => {
  assert.deepEqual(checkWith(editPage2(page => (page.variants = [' 車頭']))), [
    `${CAB_PAGE_2}: /variants/0 must match pattern "^\\S(?:.*\\S)?$"`,
  ])
})

const AA_PAGE = 'cantonese/啊_ppppppp9.json'

/** The valid fixture plus a page with no English word (啊 aa3), with `edit` applied to it and its lookup line added. */
function withNoEnglishPage(
  edit: (page: any) => void = () => {},
  path = AA_PAGE,
): (files: Record<string, string>) => void {
  return files => {
    const page = {
      id: 'ppppppp9',
      traditional: '啊',
      partOfSpeech: null,
      jyutping: 'aa3',
      cantonesePartOfSpeech: 'sentence-final particle',
      english: [{ word: null, meaning: 'softens a question', exampleSentences: [] }],
    }
    edit(page)
    files[path] = JSON.stringify(page, null, 2) + '\n'
    const lookup = JSON.parse(files['pages-by-id.json'])
    lookup.ppppppp9 = 'ppppppp9'
    files['pages-by-id.json'] = JSON.stringify(lookup, null, 2) + '\n'
  }
}

test('a page with no English word and no English part of speech, named without one', () => {
  assert.deepEqual(checkWith(withNoEnglishPage()), [])
})

test('a page with no English word but an English part of speech', () => {
  assert.deepEqual(
    checkWith(withNoEnglishPage(page => (page.partOfSpeech = 'intj'), 'cantonese/啊_intj_ppppppp9.json')),
    [
      `cantonese/啊_intj_ppppppp9.json: partOfSpeech is the English word's, so it must be null exactly when no English entry has a word`,
    ],
  )
})

test('a page with an English word but no English part of speech', () => {
  assert.deepEqual(checkWith(withNoEnglishPage(page => (page.english[0].word = 'ah'))), [
    `${AA_PAGE}: partOfSpeech is the English word's, so it must be null exactly when no English entry has a word`,
  ])
})

test('a page mixing an English word and an entry with none', () => {
  const mixed = withNoEnglishPage(page => {
    page.partOfSpeech = 'intj'
    page.english.push({ word: 'ah', meaning: 'an exclamation', exampleSentences: [] })
  }, 'cantonese/啊_intj_ppppppp9.json')
  assert.deepEqual(checkWith(mixed), [
    `cantonese/啊_intj_ppppppp9.json: partOfSpeech is the English word's, so it must be null exactly when no English entry has a word`,
  ])
})

test('a page with no English part of speech named with one', () => {
  assert.deepEqual(checkWith(withNoEnglishPage(() => {}, 'cantonese/啊_null_ppppppp9.json')), [
    `cantonese/啊_null_ppppppp9.json: file name does not match 啊 ppppppp9 (expected ${AA_PAGE})`,
  ])
})

test('pagePath leaves the part of speech out of a page that has none', () => {
  assert.equal(pagePath('啊', null, 'ppppppp9'), AA_PAGE)
})
