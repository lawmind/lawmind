# PASTE THIS INTO CLAUDE CODE

Open Claude Code in `~/Documents/lawmind`, attach both zips, paste everything
below the line.

---

You are setting up the Lawmind repository. Do not write any application code this
session. Placement, reconciliation and verification only.

Two zip files attached:

1. **`lawmind-complete.zip`** — the full documentation and agent-instruction
   scaffold, 39 files. Contents sit inside a top-level `lawmind/` folder.
2. **A second zip with my designed mobile screens and wireframes.** I don't
   remember the filename. Find it, inspect it, and tell me what's inside before
   moving anything. I've changed the admin panel screens and made other changes
   since these docs were written, so **my screens are the source of truth and the
   docs are a proposal that needs correcting.**

Working directory is `~/Documents/lawmind`, already created.

## TASK 1 — Place the scaffold

Extract `lawmind-complete.zip`. Contents are nested inside `lawmind/`.
**Flatten that** — I want `~/Documents/lawmind/CLAUDE.md`, not
`~/Documents/lawmind/lawmind/CLAUDE.md`.

Expected root layout:

```
README.md  CLAUDE.md  AGENTS.md  PRD.md  PID.md  TRD.md
BUILD_GUIDE.md  DEPLOYMENT.md  DOMAIN_TRUTH.md  .gitignore
.ai/        11 files: README + 00-09
.claude/    settings.json, hooks/, commands/
docs/       SCHEMA_TRUTH, API_CONTRACTS, CITATION_HARNESS, PRIVACY_PII,
            OCR_PIPELINE, DATASETS, FAILURE_MODES, TEST_FIXTURES,
            OPEN_DECISIONS, ROADMAP_MULTI_AGENT
design/     DESIGN_SYSTEM.md, SCREENS.md, CLAUDE_DESIGN_PROMPTS.md
sprints/    SPRINT_0.md
```

Everything is already merged — there are no `*_ADDITIONS.md` files and nothing
needs hand-merging. If you find one, something went wrong; tell me.

## TASK 2 — Place my screens

Extract the second zip. Inspect what's actually inside before deciding placement.

Put design assets under `design/screens/`, organised by surface — suggested
`mobile/`, `admin/`, `wireframes/`, `tokens/`. Adapt to whatever the zip
contains. If it already has a sane structure, preserve it rather than forcing
mine.

Do not rename my files. If naming is inconsistent, tell me — don't silently
normalise.

## TASK 3 — Reconcile the docs against my actual screens

The important task, and the one where you must not guess.

`design/SCREENS.md` lists 34 proposed screens, written before I designed
anything. My actual screens are authority. Where they disagree, the docs are
wrong.

1. Read `design/SCREENS.md`.
2. Inspect my screens.
3. Produce a three-column reconciliation: in both · designed but not in the doc ·
   in the doc but not designed.
4. **Update `design/SCREENS.md`** to describe what exists, marking anything
   proposed-but-not-designed as `NOT YET DESIGNED`.
5. If my screens imply a different design system than `design/DESIGN_SYSTEM.md`
   describes — palette, type, spacing, component shapes — update that file to
   match my screens and **list every change**. Don't quietly rewrite it.
6. I changed the admin panel specifically. Tell me how my admin screens differ
   from what `SCREENS.md` and `docs/API_CONTRACTS.md` assume. The admin endpoints
   may need revising — **flag it, don't change the contract yourself.**

Anything contradicting `docs/OPEN_DECISIONS.md` comes back to me as a question.
Never resolve an open decision on your own.

## TASK 4 — Make the agent layer work

1. `chmod +x .claude/hooks/*.sh` — zip extraction drops the execute bit.
2. Run both hooks and show me the output:
   `bash .claude/hooks/reanchor.sh` and `bash .claude/hooks/session-start.sh`
3. Verify `.claude/settings.json` parses and matches the hook schema **your**
   version of Claude Code expects. If the schema has changed, fix the file and
   tell me what you changed. The scripts are correct; only the settings shape is
   uncertain.
4. Confirm my global `~/.claude/CLAUDE.md` is present and unmodified. The project
   `CLAUDE.md` is additive and must not override it. Report any conflict rather
   than resolving it.
5. Verify every cross-reference resolves — every path mentioned inside a markdown
   file should exist. Report any that don't.

## TASK 5 — Initialise

```
git init
```

`.gitignore` ships in the zip. Ask me before excluding design files — I may want
them tracked.

Commit: `chore: scaffold docs, agent instructions and design assets`

Do not push. No remote configured.

## STOP HERE

Do not scaffold the monorepo, install dependencies, or create the Expo app or
API. `sprints/SPRINT_0.md` covers that and runs as four separate agent sessions,
not this one.

## REPORT BACK

1. Final directory tree
2. Screen reconciliation — the three columns
3. Every change to `DESIGN_SYSTEM.md` or `SCREENS.md`, and why
4. How my admin screens diverge from the docs
5. Hook and settings verification, including anything you fixed
6. Broken cross-references
7. Questions for me, and any open decision my screens touch

Follow my global `CLAUDE.md`: open with DONE/VERIFY, state INTENT before changing
anything that exists, label claims KNOW / INFER / GUESS, stop after three failed
attempts rather than trying a fourth.
