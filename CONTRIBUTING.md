# Contributing

Thanks for helping fix or grow this dictionary. This page explains how the
files are laid out and the steps to change them.

## The files

- `words/<letter>/<word>.json` — one file per English word. This is the
  dictionary itself. This is the file you edit.
- `frequency.json` — this file decides the order words and meanings are
  learned in. It has two parts:
  - `words.<term>` is a word's place in the learning order. First comes the
    word's CEFR level (CEFR-J A1 through B2, then Octanove C1–C2 for harder
    words). Within the same level, words are ordered by how common they are.
    1 means "first". `999999` means "we don't know its rank yet."
  - `rows.<id>` holds two numbers for one row (one Cantonese word) in
    `words/`: `meaningShare` says how common that whole meaning is for the
    English word, and `share` says how common this particular Cantonese word
    is for that meaning. Both numbers come from an AI's estimate, not from
    counting real text. All of these numbers — the word rank, `meaningShare`,
    `share` — exist only to decide what order things are shown in. They are
    not a claim about how often people actually say the word.
- `aliases.json` — other spellings or forms of a word that should lead to it,
  for example `"child": ["children"]`. Only words that have another form
  listed here appear in this file.
- `schema/` — a set of rules (JSON Schema) that every file above must follow.
  If your editor is set up (see below), it warns you the moment a field is
  missing or misspelled, before you even save.

## Editor setup

If you use VS Code, you don't need to install anything. `.vscode/settings.json`
already tells VS Code to check `words/**/*.json`, `frequency.json` and
`aliases.json` against the rules in `schema/`. Open any of those files and
mistakes are underlined as you type.

## What one row looks like

Each English word's file holds one or more rows — one row per Cantonese word
that can translate it. Here's a real row, for the English word "interesting":

```json
{
  "id": "q4t7x2a9",
  "partOfSpeech": "adj",
  "meaning": "arousing attention; engaging",
  "traditional": "有趣",
  "jyutping": "jau5 ceoi3",
  "note": "Use 有趣 as the all-purpose choice for something that engages your attention or holds your interest.",
  "example": {
    "english": "This book about marine life is interesting.",
    "traditional": "呢本書講海洋生物，好有趣。",
    "jyutping": "ni1 bun2 syu1 gong2 hoi2 joeng4 sang1 mat6 hou2 jau5 ceoi3"
  }
}
```

What each field means:

- `id` — a short code that names this exact row. **Never change an existing
  `id`.** A brand-new row gets a brand-new `id`: 8 lowercase letters or
  digits, made for you by `pnpm run new-id` (see the steps below).
- `partOfSpeech` — the word's grammatical type, e.g. `adj`, `noun`, `verb`.
- `meaning` — a short description of which sense of the English word this row
  is for. Two rows with the _same_ `partOfSpeech` and the _same_ `meaning`
  are two different Cantonese words for that one meaning.
- `traditional` — the Cantonese word, in traditional Chinese characters.
- `jyutping` — how to say it, written in Jyutping romanization.
- `note` — a plain-English sentence on when to reach for this word rather
  than another one with the same meaning.
- `example` — one example sentence, given in English, in Cantonese
  characters, and in Jyutping.
- `register` — only added when it matters, to flag that a word is
  `colloquial`, `written`, `formal`, and so on. Most rows don't need it.

## Rules to follow when you edit a row

- **Never change an `id`.** It's the row's permanent name.
- **A new row always needs a new `id`.** Run `pnpm run new-id` — it prints a
  fresh 8-character id that isn't used anywhere else in the repo yet.
- **Every row's `id` must also appear in `frequency.json`, under `rows`.**
  If you're forgetting this step, `pnpm run check` will catch it.
- **If your new row is another way to say a meaning that already has rows**
  (same `partOfSpeech` and the same `meaning`), copy that meaning's
  `meaningShare` number into your new row's entry in `frequency.json`. Don't
  invent a new one.
- **If you're adding a brand-new English word** (not just a new row on an
  existing word), it also needs an entry in `frequency.json` under `words`.
  If you don't know its real rank, use `999999` — that means "not ranked
  yet," and is a valid answer.
- **Only add `register` when it actually matters** — when leaving it out
  would let someone use the word in the wrong situation.

## Steps to make a change

1. Run `pnpm install` once, if you haven't already.
2. Edit the word's file under `words/`.
3. If you added a new row, mint its `id` with `pnpm run new-id`, and add a
   matching entry in `frequency.json`'s `rows` (see the rules above).
4. If you added a brand-new word, also add it to `frequency.json`'s `words`.
5. Run `pnpm run format` to auto-format your changes, then `pnpm run check`
   to validate everything against the schema. If you changed a file in
   `scripts/`, also run `pnpm run test`, `pnpm run typecheck` and
   `pnpm run lint`.
6. Open a pull request. GitHub runs `pnpm run check`, `pnpm run test`,
   `pnpm run typecheck` and `pnpm run lint` on it automatically
   (`.github/workflows/check.yml`); a red check means one of them failed, and
   its log says which rule.

You'll need Node.js version 25.9.0 or later for any of these commands to work.

### A quirk on Windows

A few English words are also reserved names on Windows — `con`, `prn`, `aux`,
`nul`, `com1` through `com9`, `lpt1` through `lpt9`. Git for Windows refuses to
check out a file with one of those names, so those words are stored with a
trailing underscore before the file extension instead, for example
`words/c/con_.json`. `pnpm run check` checks that every word file is named
exactly the way it should be, including this one, so you don't need to
remember the rule — just let `check` tell you if you got a filename wrong.

## Building the release files

`pnpm run export` reads everything in `words/`, `frequency.json` and
`aliases.json`, and writes the files people actually download into `dist/`:

- `dictionary.csv` and `dictionary.jsonl` — the whole dictionary, one row per
  Cantonese word, as a spreadsheet and as JSON Lines.
- `aliases.csv` — a lookup from a word form (like "children") to the English
  word it belongs to (like "child").
- `cantohok-en-yue.txt` — a dictionary file formatted for the Pleco app. In
  Pleco: Manage Dictionaries → Add User → Create New → language English →
  open it → Import Entries → pick this file → UTF-8.

You don't need to run this yourself to contribute a fix — it only matters if
you're preparing a release.

## Publishing a release

Releases are built by GitHub, not on your machine. Tag a commit on `main` with
today's date and push the tag:

```sh
git fetch origin
git tag 2026-10-15 origin/main
git push origin 2026-10-15
```

A second release on the same day is `2026-10-15.2`. Push one tag at a time:
GitHub starts nothing for a push of more than three tags, so `git push --tags`
can silently skip the release.

`.github/workflows/release.yml` then runs the checks, runs `pnpm run export`,
and publishes the release with the files attached. The notes come from
`.github/release-notes.md`, with the word and row counts added on top and
GitHub's list of pull requests merged since the previous release underneath.
It refuses a tag on a commit that is not on `main`, and a tag that already has
a release. Any other tag name (`v1`, `2026.10.15`) starts nothing at all, so
if no release appears within a few minutes, check the tag's spelling first.

The data in every release is CC BY-SA 4.0 (`LICENSE`), with the attribution in
`CREDITS.md`; the scripts are MIT (`LICENSE-CODE`).

## Applying an accepted suggestion

A suggestion from the app is a JSON list of field edits (`id`, `word`,
`field`, `from`, `to`). Save it as `edits.json` in this directory (a path is
read relative to where you run the command, and `pnpm run` from here runs in
the repository root) and run:

```sh
pnpm run apply-suggestion edits.json
pnpm run format && pnpm run check
```

Rows are found by `id`. No field may be emptied, the note included: every row
keeps a non-empty note (`schema/word.schema.json`). If any `from` no longer matches the row, or an id is
unknown, nothing is written and each problem is printed. If a write fails
midway, run `git checkout words/` and try again.
