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

/** A two-word repo, with a page file for each of its three rows and one corpus sentence per source, that passes every check. Tests change one thing each. */
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
  "english": [
    {
      "id": "aaaaaaa1",
      "word": "cab",
      "meaning": "taxi",
      "note": "This is the all-purpose Cantonese noun for a taxi or cab.",
      "exampleSentences": [
        {
          "id": "sssssss1",
          "english": "We called a cab to the airport.",
          "traditional": "我哋叫咗部的士去機場。",
          "jyutping": "ngo5 dei6 giu3 zo2 bou6 dik1 si2 heoi3 gei1 coeng4"
        }
      ]
    }
  ],
  "traditional": "的士",
  "jyutping": "dik1 si2"
}
`,
    'cantonese/車頭_noun_ppppppp2.json': `{
  "id": "ppppppp2",
  "partOfSpeech": "noun",
  "english": [
    {
      "id": "aaaaaaa2",
      "word": "cab",
      "meaning": "taxi",
      "register": "colloquial",
      "note": "Use this colloquial term for the cab or front section of a truck.",
      "exampleSentences": []
    }
  ],
  "traditional": "車頭",
  "jyutping": "ce1 tau4"
}
`,
    'cantonese/星期四_noun_ppppppp3.json': `{
  "id": "ppppppp3",
  "partOfSpeech": "noun",
  "english": [
    {
      "id": "bbbbbbb1",
      "word": "Thursday",
      "meaning": "day of the week",
      "note": "This is the all-purpose word for Thursday.",
      "exampleSentences": []
    }
  ],
  "traditional": "星期四",
  "jyutping": "sing1 kei4 sei3"
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
    "aaaaaaa1": { "meaningShare": 80, "share": 70, "order": 0 },
    "aaaaaaa2": { "meaningShare": 80, "share": 30, "order": 1 },
    "bbbbbbb1": { "meaningShare": 100, "share": 100, "order": 0 }
  },
  "words": { "Thursday": 900, "cab": 2000 }
}
`,
    'aliases.json': `{ "Thursday": ["thursdays"] }
`,
    // Two photos in display order, the larger id first, so a formatter that sorted arrays would show here.
    'pictures.json': `{
  "ppppppp1": [
    { "author": "Jane Doe", "commons": 67890, "license": "CC BY-SA 4.0" },
    { "commons": 12345, "license": "CC0" }
  ]
}
`,
    'corpus/tatoeba/LICENSE': 'license text\n',
    'corpus/tatoeba/08.jsonl':
      '{"author":null,"english":[{"by":"sadhen","id":1787898,"text":"Where are my dragons?"}],"id":"1792543","jyutping":"ngo5 di1 lung4 hai2 bin1 dou6 aa3？","jyutpingBy":"picker","text":"我啲龍喺邊度呀？"}\n',
    'corpus/hkcancor/LICENSE': 'license text\n',
    'corpus/hkcancor/49.jsonl':
      '{"english":[{"by":"machine","text":"But your lipstick is a bit light; slightly darker would be fine."}],"id":"5a5bd02187dbff6a","jyutping":"daan6 hai6 go3 nei5 go3 seon4 gou1 bei2 gaau3 cin2 sik1 sam1 et1 et1 siu2 siu2 ngo5 gok3 dak1 ho2 ji5","jyutpingBy":"corpus","text":"但係個，你個唇膏比較淺色，深et1et1少少，我覺得可以。","words":[{"jyutping":"daan6 hai6","pos":"c","text":"但係"},{"jyutping":"go3","pos":"q","text":"個"},{"jyutping":"nei5","pos":"r","text":"你"},{"jyutping":"go3","pos":"q","text":"個"},{"jyutping":"seon4 gou1","pos":"n","text":"唇膏"},{"jyutping":"bei2 gaau3","pos":"v","text":"比較"},{"jyutping":"cin2 sik1","pos":"a","text":"淺色"},{"jyutping":"sam1","pos":"a","text":"深"},{"jyutping":"et1 et1","pos":"z","text":"et1et1"},{"jyutping":"siu2 siu2","pos":"m","text":"少少"},{"jyutping":"ngo5","pos":"r","text":"我"},{"jyutping":"gok3 dak1","pos":"v","text":"覺得"},{"jyutping":"ho2 ji5","pos":"vu","text":"可以"}]}\n',
    'corpus/hambaanglaang/LICENSE': 'license text\n',
    'corpus/hambaanglaang/0a.jsonl':
      '{"author":"939","english":[{"by":"word by word","text":"twelve / o\'clock / before / check / out / (particle)"}],"id":"00057#0000","jyutping":"sap6 ji6 dim2 zung1 cin4 cek1 au1 gaa3","jyutpingBy":"corpus","text":"十二點鐘前checkout㗎。","title":"Lv1《生活謊言》","url":"https://hambaanglaang.hk/all-levels/","words":[{"jyutping":"sap6-ji6","text":"十二"},{"jyutping":"dim2-zung1","text":"點鐘"},{"jyutping":"cin4","text":"前"},{"jyutping":"cek1","text":"check"},{"jyutping":"au1","text":"out"},{"jyutping":"gaa3","text":"㗎"}]}\n',
    'corpus/commonvoice/LICENSE': 'license text\n',
    'corpus/commonvoice/08.jsonl':
      '{"english":[{"by":"machine","text":"Actually, repeating it a few more times will make them change."}],"id":"common_voice_yue_31865749","jyutping":"kei4 sat6 gong2 do1 gei2 ci3，zau6 wui5 ling6 dou3 deoi3 fong1 goi2 bin3","jyutpingBy":"tojyutping","text":"其實講多幾次，就會令到對方改變"}\n',
  }
}
