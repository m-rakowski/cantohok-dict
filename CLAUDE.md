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

- **Create the feature branch first, before any commit.** That includes the
  spec `brainstorming` commits and the plan `writing-plans` commits. In the
  skills, the branch normally comes from `using-git-worktrees` at execution
  time, which is too late, and this repo has no push hook to catch a commit on
  `main`. Run `pnpm run format` on specs and plans too: `pnpm run check` runs
  Prettier over `docs/`.
- **No git worktrees, ever.** Skip `using-git-worktrees`. When another skill
  says to create one, work on the feature branch in the current checkout
  instead. Mike does not want extra checkouts or duplicate installs.
- **One writer at a time.** Parallel agents may investigate and review
  read-only. Only one agent edits files at any moment: the main agent, or
  under `subagent-driven-development` the one implementer subagent working on
  the current task. Tasks run in order, never side by side.
- **The plan-running skills still stop for Mike.** `subagent-driven-development`
  and `executing-plans` say not to pause, and list the only reasons to stop.
  In this repo, two more are added to that list: any paid model call, and any
  decision this file leaves to Mike. Those are stops, not rulings the agent
  makes on his behalf.
- **`finishing-a-development-branch` always ends in a pull request.** Never
  pick "merge locally". `main` is merge-only.
- **One outside review before opening.** `requesting-code-review` runs once on
  the finished branch. Fix what survives verification, open the pull request,
  and name the fix commits in `## Details` as not re-reviewed. Do not loop the
  fixes back for a second look. `subagent-driven-development`'s own per-task
  review rounds are part of executing the plan, and they still run.
- **Test-driven development is for `scripts/`, not for word edits.** A word fix
  is a data change: the test is `pnpm run format`, then `pnpm run check`, and
  the review is someone reading the Cantonese. When a mistake could come back
  in many words, the fix is a new rule in `scripts/check.ts`, written
  test-first.
- **`writing-skills` writes to `.claude/skills/` in this repo**, never to
  `~/.claude/skills/`. A skill in a personal folder is invisible to every other
  checkout and to cloud sessions.
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
    last one. Never drop a fact or the question that was open. It changes
    how a thing is explained, not whether to wait: anything that stops for his
    yes still stops.
  - **Never tell him to rest, sleep or take a break**, and never use his
    tiredness as a reason to put off a decision.
- **Play a bug report back as numbered steps before acting on it, and wait for
  his yes.** Restate what he did, what he saw and what he expected, in his
  words, and nothing else. Confirm the steps, then the expected result, as two
  separate questions. A yes to one fact is not a yes to a theory built on it.
  When his next message contradicts your summary, the summary is wrong: drop
  it and rebuild from his words.
  - **Agreement you cannot restate is not understanding.** If you cannot write
    the expected result in one sentence he would sign, you do not have it yet.
    Say so and ask.

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

  A red check is a real failure; open its log and fix it. The exception is a
  failure `main` has too: say which check, show that `main` fails it as well,
  and carry on with the rest rather than fixing it in this branch.

- **Use the Node version in `.nvmrc`**, which CI reads too. Do not widen it;
  bump it in its own commit with every check re-run.

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
  produces it. A typed-out count goes stale silently. Then run that command and
  compare its output with the text it replaces before deleting the text. A
  command that answers a different question looks authoritative and is wrong.
- **Findings you had to dig for go back into the repo.** When a question takes
  a real investigation, such as why a check fails or where a field comes from,
  write the answer into `CONTRIBUTING.md` or a `docs/` page in the same change,
  with the file pointers that prove it.
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

## Writing a check a review cannot hole

This applies to `scripts/check.ts` and anything else that inspects input and
decides.

- **Say what is allowed, never what is forbidden.** A list of banned shapes is
  only as good as its author's imagination, and every omission is a hole. A
  rule that accepts only a known-good shape cannot be incomplete.
- **Prefer a design whose failure mode is refusal.** Where a rule must be
  incomplete, make the gap reject rather than pass.
- **Write the attack list before the fix.** First ask how the rule could be
  defeated and what input nobody has named yet. Then write the tests from that
  list, not from the code.
- **Assert the whole object.** In `scripts/*.test.ts`, compare the whole row or
  file the code produces with `assert.deepStrictEqual`, not one field of it. A
  test that reads one property cannot see the field next to it ship empty.

## Pull requests and issues

- **A pull request description has two parts.** First, for Mike: a real
  example — the word, the row as it was, the row as it is now — then the change
  in a couple of sentences. Then `## Details` for a reviewer: what changed,
  which checks you ran and what they printed, any assumption you made.
- **A pull request is done when every finding on it is fixed or answered.**
  Verify a finding before agreeing with it; decline one that would be new
  behavior rather than a fix, and say why.
- **One round of automated review on the pull request, then triage and
  decide.** Every push triggers a fresh review, so "fix what it finds" never
  ends. Read one round in full, fix what is severe, answer and decline the rest
  in writing on the thread, and bring what is left to Mike rather than pushing
  again.
- **Every issue starts with steps to reproduce**: the word to look up and where
  (`words/c/cab.json`, a release file, or the app), what it shows, and what it
  should show. Then say which side is right, and end with what the issue
  depends on and blocks.
