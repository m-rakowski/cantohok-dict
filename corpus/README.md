# Example sentences from open corpora

Real Cantonese sentences, each with its Jyutping and English, from four open sources. Each
source keeps its own license, in the `LICENSE` file of its folder.

| Folder           | Source                                                                                 | License of the sentences |
| ---------------- | -------------------------------------------------------------------------------------- | ------------------------ |
| `tatoeba/`       | [Tatoeba](https://tatoeba.org)                                                         | CC BY 2.0 FR             |
| `hkcancor/`      | [Hong Kong Cantonese Corpus](https://github.com/fcbond/hkcancor), Luke and Wong (2015) | CC BY 4.0                |
| `hambaanglaang/` | [Hambaanglaang graded readers](https://github.com/hblhk/stories)                       | CC BY 4.0                |
| `commonvoice/`   | [Mozilla Common Voice, Cantonese](https://commonvoice.mozilla.org/yue)                 | CC0 1.0                  |

## Which license covers which field

- `text`, `author`, `title`, `url` and `words`: the source's own, under the source's license.
- `english`: the source's own for Tatoeba (its users' translations) and Hambaanglaang (the
  readers' word-by-word gloss); a machine translation added here for HKCanCor and Common Voice.
- `jyutping`: the source's own for HKCanCor and Hambaanglaang (`"jyutpingBy": "corpus"`).
  For Tatoeba and Common Voice it was added here: by ToJyutping (`"tojyutping"`), or chosen
  word by word from Wiktionary, CC-Canto and CC-CEDICT readings (`"picker"`), so it carries
  those sources' share-alike terms.
- Everything added here is under this repository's license, CC BY-SA 4.0 ([LICENSE](../LICENSE)).

Readings added here were made by machine, and some are wrong. Fixes are welcome.

## One line, one sentence

Each folder holds up to 256 files, `00.jsonl` to `ff.jsonl`. A sentence's file is the first
two hex digits of the SHA-1 of its `id`, so adding or removing a sentence never moves another.
Inside a file, lines are sorted by `id` (Tatoeba's numerically). Each line is exactly what
`JSON.stringify` writes with the keys sorted, for example (Tatoeba records no username for
this sentence, so `author` is null):

```json
{
  "id": "1792543",
  "english": [{ "id": 1787898, "by": "sadhen", "text": "Where are my dragons?" }],
  "jyutping": "ngo5 di1 lung4 hai2 bin1 dou6 aa3？",
  "author": null,
  "jyutpingBy": "picker",
  "text": "我啲龍喺邊度呀？"
}
```

The shape of each source's lines is in `schema/corpus-<source>.schema.json`. `pnpm run check`
also refuses a line in the wrong file, out of order, not in that exact form, or with a
reading that does not fit its text: a generated reading has one syllable per Han character,
and a corpus reading is its `words` readings joined.
