# Conventions

This repo is the English → Cantonese dictionary: one JSON file per English word
under `words/`, plus `frequency.json`, `aliases.json`, the schemas in `schema/`
and a few TypeScript scripts in `scripts/`. `CONTRIBUTING.md` is the reference
for the file layout and the row rules; read it before editing a word.

The app that uses this dictionary lives in `m-rakowski/anki-lab`. Its
`CLAUDE.md` is the parent of this one. The rules below are the parts that carry
over, rewritten for a data repo.

## Work through the superpowers skills

Most of the process in this repo is the superpowers skill set. Use the skill
whenever the task matches it. Do not rebuild its steps from memory. The
skill's own name may carry a prefix depending on the install
(`superpowers:brainstorming`, `anthropic-skills:brainstorming`); the bare
names are used here.

| When                                                                                          | Skill                                                                    |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Start of every session                                                                        | `using-superpowers`                                                      |
| Anything new: a new rule in `check.ts`, a new export format, a batch of new words or meanings | `brainstorming`, then `writing-plans`                                    |
| Carrying out a written plan                                                                   | `subagent-driven-development` (or `executing-plans` when working inline) |
| Changing anything in `scripts/`                                                               | `test-driven-development`                                                |
| A failing check, a wrong export, a surprising diff                                            | `systematic-debugging`                                                   |
| Several independent words or files to look into                                               | `dispatching-parallel-agents`                                            |
| Before saying anything is done, fixed or passing                                              | `verification-before-completion`                                         |
| Before opening a pull request                                                                 | `requesting-code-review`                                                 |
| Findings on a pull request                                                                    | `receiving-code-review`                                                  |
| Work is finished                                                                              | `finishing-a-development-branch`                                         |
| Writing or changing a skill                                                                   | `writing-skills`                                                         |

Specs and plans go in `docs/superpowers/specs/` and `docs/superpowers/plans/`,
the skills' own default, same as anki-lab.

### Where this repo overrides the skills

A rule in this file wins over a skill's default.

- **No git worktrees, ever.** Skip `using-git-worktrees`, and when another
  skill says to create one, work on a normal branch in the current checkout
  instead. Mike does not want extra checkouts or duplicate installs. Parallel
  agents may read and review; the main agent makes every edit, one after
  another.
- **`finishing-a-development-branch` always ends in a pull request.** Never
  pick "merge locally". `main` is merge-only.
- **One outside review, then open.** `requesting-code-review` runs once. Fix
  what survives verification, open the pull request, and name the fix commits
  in `## Details` as not re-reviewed. Do not loop the fixes back for a second
  look.
- **Test-driven development is for `scripts/`, not for word edits.** A word fix
  is a data change: the test is `pnpm run check`, and the review is someone
  reading the Cantonese. When a mistake could come back in many words, the fix
  is a new rule in `scripts/check.ts`, written test-first.
- **`brainstorming` questions stop for Mike's answer, one at a time.** That
  skill already asks one question per message; keep to it.

## Talking to Mike

- **"Our dictionary" means the files in this repo.** Not CC-Canto, CC-CEDICT,
  words.hk or Wiktionary. Those are "the sources", each called by name.
- **Only Cantonese matters.** Readings are Jyutping, characters are
  traditional, and words are the ones people in Hong Kong actually say. A
  Mandarin-only word or reading is a mistake to fix, not an alternative.
- **Explain in plain terms, one step at a time.** Lead with the plain answer,
  one idea per message, and stop for a check before the next one. No opening
  table, no wall of findings, no term he would have to look up; if one is
  unavoidable, say what it means in the same breath.
  - **"Slow down" means explain it completely, across more messages, in simpler
    words.** Say how many pieces there are, send them one per message with a
    "does that part make sense?" after each, and put the open question in the
    last one. Never drop a fact or the question that was open.
  - **Never tell him to rest, sleep or take a break**, and never use his
    tiredness as a reason to put off a decision.
- **Play a bug report back as numbered steps before acting on it, and wait for
  his yes.** Restate what he did, what he saw and what he expected, in his
  words, and nothing else. Confirm the steps, then the expected result, as two
  separate questions. A yes to one fact is not a yes to a theory built on it.
  When his next message contradicts your summary, the summary is wrong: drop
  it and rebuild from his words.

## Ground rules

- **Git: never commit or push to `main`.** Branch, push the branch, open a pull
  request ready for review (not a draft). Confirm the remote branch has the
  commit before reporting the work as done.
- **CI runs here, and it is the gate.** The repo is public, so GitHub Actions
  runs `.github/workflows/check.yml` on every pull request. Before pushing, run
  what it runs, and read the output:

  ```bash
  pnpm run typecheck
  pnpm run lint
  pnpm run check
  pnpm run test
  ```

  A red check is a real failure; open its log and fix it.

- **Never merge on Mike's behalf unless he asks, and never against a red
  check.** A finding that turns up after he said "merge it" goes back to him
  first.
- **Never change a row's `id`.** New rows get one from `pnpm run new-id`.
  Downstream users (the app, people's Anki decks) key on it.
- **Releases are Mike's.** Do not push a date tag (`.github/workflows/release.yml`
  publishes on one) unless he asks for that release.
- **Ask before any paid model call.** Every run, every rerun, even a small
  sample: say what will run and roughly what it costs, then wait for a yes.
  For a bulk generation, show a small sample of real output side by side with a
  known-good baseline and let him pick.
- **Credentials: never ask for or accept one.** The agent writes the code;
  Mike runs anything privileged himself.
- **Look before you assert.** A claim about what a file holds, what a word
  means or how a script behaves gets checked before it is written down. Never
  write "I checked X" unless you ran the check.
- **Run a command whose output matters in one shape: redirect to a file, report
  its status, then read the file.**

  ```bash
  pnpm run check > "$TMPDIR/check.txt" 2>&1; echo "EXIT: $?"
  ```

  A pipe (`| tail`, `| grep`, `| wc`) hides the line that explains a failure
  and reports the last command's exit status, not the one you care about.

- **Never write a count or a list of words into a doc.** Write the command that
  produces it. A typed-out count goes stale silently.
- **A correction is a new claim.** It gets the same checking as new content: a
  wrong fix reads as freshly verified, which makes it worse than the old text.
- **A bug you trip over that is not the task gets logged, not fixed.** File an
  issue with the word, the row `id` and what is wrong, say so in one line, and
  carry on. The exception is a defect that blocks the task.
- **Reach for a well-known library before hand-rolling** anything in
  `scripts/`, and say in the plan what you looked at.
- **Say it when scope grows past what was agreed**, at the second file, not in
  the diff.
- **Rules live in this repo**, in this file or `.claude/skills/`, never in an
  agent's memory store.

## Pull requests and issues

- **A pull request description has two parts.** First, for Mike: a real
  example — the word, the row as it was, the row as it is now — then the change
  in a couple of sentences. Then `## Details` for a reviewer: what changed,
  which checks you ran and what they printed, any assumption you made.
- **A pull request is done when every finding on it is fixed or answered.**
  Verify a finding before agreeing with it; decline one that would be new
  behavior rather than a fix, and say why.
- **Every issue starts with steps to reproduce**: the word to look up and where
  (`words/c/cab.json`, a release file, or the app), what it shows, and what it
  should show. Then say which side is right, and end with what the issue
  depends on and blocks.
