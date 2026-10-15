// Test-only helpers shared by check.test.ts, export.test.ts and
// new-id.test.ts: writeTree turns an in-memory set of files into a real
// temporary folder, and validFixture is a tiny two-word dictionary that
// passes every check, for tests to break one thing at a time. Nothing here
// runs on its own — `pnpm run test` runs it as part of the test files that
// import it.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/** Writes files (repo-relative path → contents) into a fresh temp dir; returns the dir. */
export function writeTree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'cantohok-dict-'))
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), contents)
  }
  return root
}

/** A two-word repo, with a page file for each of its three rows, that passes every check. Tests change one thing each. */
export function validFixture(): Record<string, string> {
  return {
    'words/c/cab.json': `{
  "term": "cab",
  "rows": [
    {
      "id": "aaaaaaa1",
      "partOfSpeech": "noun",
      "meaning": "taxi",
      "traditional": "的士",
      "jyutping": "dik1 si2",
      "note": "This is the all-purpose Cantonese noun for a taxi or cab.",
      "example": {
        "english": "We called a cab to the airport.",
        "traditional": "我哋叫咗部的士去機場。",
        "jyutping": "ngo5 dei6 giu3 zo2 bou6 dik1 si2 heoi3 gei1 coeng4"
      }
    },
    {
      "id": "aaaaaaa2",
      "partOfSpeech": "noun",
      "meaning": "taxi",
      "traditional": "車頭",
      "jyutping": "ce1 tau4",
      "register": "colloquial",
      "note": "Use this colloquial term for the cab or front section of a truck."
    }
  ]
}
`,
    'words/t/Thursday.json': `{
  "term": "Thursday",
  "rows": [
    {
      "id": "bbbbbbb1",
      "partOfSpeech": "noun",
      "meaning": "day of the week",
      "traditional": "星期四",
      "jyutping": "sing1 kei4 sei3",
      "note": "This is the all-purpose word for Thursday."
    }
  ]
}
`,
    'cantonese/的士_noun_ppppppp1.json': `{
  "id": "ppppppp1",
  "partOfSpeech": "noun",
  "traditional": "的士",
  "boxes": [
    {
      "meaning": "taxi",
      "english": ["cab"],
      "jyutping": "dik1 si2",
      "examples": [
        {
          "english": "We called a cab to the airport.",
          "traditional": "我哋叫咗部的士去機場。",
          "jyutping": "ngo5 dei6 giu3 zo2 bou6 dik1 si2 heoi3 gei1 coeng4"
        }
      ]
    }
  ]
}
`,
    'cantonese/車頭_noun_ppppppp2.json': `{
  "id": "ppppppp2",
  "partOfSpeech": "noun",
  "traditional": "車頭",
  "boxes": [
    {
      "meaning": "taxi",
      "english": ["cab"],
      "jyutping": "ce1 tau4",
      "register": "colloquial",
      "examples": []
    }
  ]
}
`,
    'cantonese/星期四_noun_ppppppp3.json': `{
  "id": "ppppppp3",
  "partOfSpeech": "noun",
  "traditional": "星期四",
  "boxes": [
    {
      "meaning": "day of the week",
      "english": ["Thursday"],
      "jyutping": "sing1 kei4 sei3",
      "examples": []
    }
  ]
}
`,
    'pages-by-id.json': `{
  "aaaaaaa1": "ppppppp1",
  "aaaaaaa2": "ppppppp2",
  "bbbbbbb1": "ppppppp3",
  "ppppppp1": "ppppppp1",
  "ppppppp2": "ppppppp2",
  "ppppppp3": "ppppppp3"
}
`,
    'frequency.json': `{
  "rows": {
    "aaaaaaa1": { "meaningShare": 80, "share": 70 },
    "aaaaaaa2": { "meaningShare": 80, "share": 30 },
    "bbbbbbb1": { "meaningShare": 100, "share": 100 }
  },
  "words": { "Thursday": 900, "cab": 2000 }
}
`,
    'aliases.json': `{ "Thursday": ["thursdays"] }
`,
  }
}
