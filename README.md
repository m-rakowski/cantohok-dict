# cantohok-dict

A free English → Cantonese dictionary.

For thousands of English words, it gives you:

- the Cantonese words people in Hong Kong actually use
- Jyutping, so you know how to say them
- a short note on when to use each one
- an example sentence

It was made with AI and hasn't been checked word by word yet, so expect mistakes, especially in the Jyutping. Fixes are very welcome.

## Example

**cab** → **的士** dik1 si2\
_This is the all-purpose Cantonese noun for a taxi or cab._\
我哋叫咗部的士去機場。 We called a cab to the airport.

## Download

Each release has:

- `dictionary.csv`: for Anki or a spreadsheet
- `dictionary.jsonl`: for programmers
- `cantohok-en-yue.txt`: for Pleco (Manage Dictionaries → Add User → Create New → English → Import Entries)

## Fix a mistake

1. Find the word: `cab` is in `words/c/cab.json`.
2. Change what's wrong.
3. Run `pnpm install`, then `pnpm run format` and `pnpm run check`.
4. Open a pull request.

Adding a new word or meaning? See [CONTRIBUTING.md](CONTRIBUTING.md).

## Where it comes from

This dictionary powers [CantoHok](https://cantohok.com), an app for learning Cantonese with Anki.

## License

The dictionary is free to use and share under [CC BY-SA 4.0](LICENSE). It builds on Wiktionary, CC-Canto and other open sources, all listed in [CREDITS.md](CREDITS.md). The scripts are MIT ([LICENSE-CODE](LICENSE-CODE)).
