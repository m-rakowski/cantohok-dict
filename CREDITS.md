# Credits

This dictionary is built on top of several open sources. This page lists all
of them.

## Where the Jyutping evidence comes from

The Cantonese words and most of their Jyutping come from these sources:

- [Wiktionary](https://en.wiktionary.org) (CC BY-SA 4.0)
- [CC-Canto](https://cantonese.org) (CC BY-SA 3.0)
- CC-CEDICT Cantonese Readings, copyright (c) 2015 Pleco Software
  Incorporated, via https://cccanto.org/ (CC BY-SA 3.0)

A minority of rows had their Jyutping written mechanically instead, by
[ToJyutping](https://github.com/CanCLID/ToJyutping) (Cantonese Computational
Linguistics Infrastructure Development Workgroup, BSD-2-Clause).

## Where the English word list and ordering come from

The English words themselves, and the rank each one gets in `frequency.json`,
were chosen and graded using:

- **CEFR-J Vocabulary Profile** (version 1.5), compiled by Yukio Tono, Tokyo
  University of Foreign Studies — http://www.cefr-j.org/, free for research
  and commercial use with citation.
- **Octanove Vocabulary Profile for C1/C2** (version 1.0), created by Octanove
  Labs — https://github.com/openlanguageprofiles/olp-en-cefrj, CC BY-SA 4.0.
- **wordfreq** (English frequency data, version 3.1.1), compiled by Robyn
  Speer and wordfreq contributors — https://github.com/rspeer/wordfreq,
  CC BY-SA 4.0.

None of their text is in these files — they were used only to pick and order
the words.

## Example sentences from open corpora

The sentences in `corpus/` come from, and keep the licenses of:

- [Tatoeba](https://tatoeba.org) (CC BY 2.0 FR), each sentence and translation credited to
  its Tatoeba user
- the Hong Kong Cantonese Corpus, K. K. Luke and May L. Y. Wong (2015), "The Hong Kong
  Cantonese Corpus: Design and Uses" (CC BY 4.0), via https://github.com/fcbond/hkcancor
- the [Hambaanglaang 冚唪唥粵文讀本](https://hambaanglaang.hk) graded readers (CC BY 4.0),
  via https://github.com/hblhk/stories
- [Mozilla Common Voice](https://commonvoice.mozilla.org/yue), Cantonese (CC0 1.0)

Readings added to Tatoeba and Common Voice sentences were written by ToJyutping or chosen
from the Jyutping sources above. [corpus/README.md](corpus/README.md) says which license
covers which field.

## Photos

`pictures.json` names photos from [Wikimedia Commons](https://commons.wikimedia.org)
and [Pexels](https://www.pexels.com) that show some of the words. Each photo
belongs to its author. A Commons photo is under its own license, listed beside
it; a Pexels photo is under the [Pexels License](https://www.pexels.com/license/).
This dictionary's license does not cover them. The repo holds only each photo's
id and its credit, not the photo itself.

## License

The dictionary data is CC BY-SA 4.0 (`LICENSE`); the scripts are MIT
(`LICENSE-CODE`).
