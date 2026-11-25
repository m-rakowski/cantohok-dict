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
  readers' word-by-word gloss, `"by": "word by word"`); a machine translation added here
  (`"by": "machine"`) for HKCanCor, Common Voice and, next to its gloss, Hambaanglaang.
- `jyutping`: the source's own syllables for HKCanCor and Hambaanglaang (`"jyutpingBy": "corpus"`),
  with the sentence's punctuation copied in between them here.
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

```text
{"author":null,"english":[{"by":"sadhen","id":1787898,"text":"Where are my dragons?"}],"id":"1792543","jyutping":"ngo5 di1 lung4 hai2 bin1 dou6 aa3？","jyutpingBy":"picker","text":"我啲龍喺邊度呀？"}
```

The shape of each source's lines is in `schema/corpus-<source>.schema.json`. `pnpm run check`
also refuses a line in the wrong file, out of order, not in that exact form, or with a reading
that does not fit:

- a generated reading (`"picker"`, `"tojyutping"`) has one lowercase syllable per Han
  character, plus one for each lowercase letter-and-tone run the text itself contains (a chess
  square written `c5` stays `c5`). The check counts syllables; it does not know which is right.
- a corpus reading (`"corpus"`) is its `words` readings in order (for Hambaanglaang with each
  `-` turned into a space and lowercased), with everything the sentence has between them copied
  in place: a punctuation mark flush against its neighbors (`lok6，keoi5`), a run of letters or
  digits no word reads as a word of its own (`lin4 pantry dou1`). Marks inside a word's own text
  (`7-11`) are left to that word's reading.

## Fixing a sentence

- **A Tatoeba or Common Voice reading**: edit `jyutping`, one syllable per character.
- **An HKCanCor or Hambaanglaang reading**: edit the word's own reading in `words`, then the
  top-level `jyutping` to match (the check compares the two).
- **An English translation we added** (`"by": "machine"`: HKCanCor, Common Voice, Hambaanglaang): edit its `text`.
- Leave `text`, `author` and Tatoeba's own English as the source wrote them.

## Changes made here

The sources' material is used with changes, as their licenses ask us to say: readings and
translations may have been corrected in this repository (each line's git history shows what
changed and when), HKCanCor's and Hambaanglaang's sentence readings have the sentence's own punctuation (and any
Latin text the source left unread) copied in between the source's syllables, Hambaanglaang's
is stored lowercased with its `-` turned into spaces, and its gloss is joined with `/`.
