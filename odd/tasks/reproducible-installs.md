# Reproducible installs

## Objective

Two deploys of the same commit install the same dependencies. Today neither
half of the product guarantees that.

## Problem

**Frontend.** `frontend/package.json` declares five dependencies. Two are
exact (`lucide-react 1.47.0`, pinned by the last change's review; and
`react-scripts 5.0.1`). Three carry caret ranges: `react ^18.2.0`,
`react-dom ^18.2.0`, `serve ^14.2.0`. A caret range is resolved at install
time, and **no lockfile has ever been tracked** — `git log --all --
frontend/package-lock.json` is empty, and `.gitignore` names only
`frontend/node_modules/`. Railway's RAILPACK builder runs `npm run build`
against whatever npm resolves at that moment. Nothing records what shipped.

**Bot/API.** `bot/requirements.txt` is worse: ten lines, **zero versions** —
bare names only (`python-telegram-bot`, `httpx`, `asyncpg`, `apscheduler`,
`anthropic`, `python-dotenv`, `fastapi`, `uvicorn[standard]`, `bcrypt`).
Every resolution takes whatever is newest on PyPI at that instant. A
`bcrypt`, `asyncpg` or `anthropic` release can change production behaviour
with no commit to blame it on. `bot/requirements-dev.txt` already pins
(`pytest==8.3.5`), so the practice exists in this repo — it just never
reached the runtime dependencies.

Railway does cache the pip layer, keyed on the file's content, so the
lottery is not drawn on every deploy. It is drawn on cache eviction, on a
builder change, and on the next edit to that file — unpredictably, which is
the part that matters.

## Evidence: the sibling project already does this right

`IAQP/requirements.txt` (the other repo in this workspace, deployed as
`staging-api` in the "IAQP Staging" project) is fully pinned:
`fastapi==0.115.6`, `uvicorn[standard]==0.34.0`, `asyncpg==0.30.0`,
`httpx==0.28.1`. Its build log shows railpack installing exactly those.
It also ships `IAQP/runtime.txt` with `python-3.11`, and the build log
confirms `mise python@3.11.16`. `app/bot` ships neither.

## Why now

The last change's review raised it as a defect, not a preference: a range
with no lockfile pins nothing, and the test guarding the dependency runs
against whatever happens to be installed, so it cannot detect the drift it
exists to catch. Pinning one package fixed that one case. This fixes the
practice.

## What pinning does and does not change

It does **not** change what the next deploy installs. An unpinned deploy
resolves the newest compatible release; pinning to what a clean resolution
returns today records that same set. The delta is zero now, and every deploy
after this one stops being able to differ silently.

## Scope

Authorized: `frontend/package-lock.json`, `bot/requirements.txt` in the `app`
repository, and this document.

Out of scope, deliberately:

- **The Python interpreter version.** `app/bot` pins no `runtime.txt` or
  `.python-version`, so railpack picks its own default and that default moves
  when railpack updates. This is the same defect class and it is real, but
  pinning it changes the interpreter under a running production API, and the
  build logs for the current deployment have expired, so which Python it runs
  today could not be established cheaply. That is the owner's call with its
  own evidence, not a silent rider on this change. Report it; do not do it.
- Upgrading any dependency. This change records today's resolution, it does
  not move it.
- `frontend/package.json`'s ranges themselves. The lockfile is what makes the
  install reproducible; rewriting the ranges to exact versions is a separate
  question about how upgrades are accepted.
- Adding `pip-tools`, `uv` or any new tool to the project.

## Constraints

- **Resolve for the deploy target, not for this laptop.** The only local
  Python is 3.14.7; railpack gives the sibling project 3.11.16 and gives
  `app/bot` an unknown default. Resolve with pip's own cross-target
  resolution (`pip install --dry-run --report - --only-binary=:all:
  --python-version <v> --platform manylinux2014_x86_64 --target <tmp>`) for
  **3.11, 3.12 and 3.13**, and pin only if all three resolve to the same
  version set. If they diverge, do not guess: report the divergence and which
  packages differ, and pin nothing for the bot until the owner picks the
  interpreter.
- The pinned set must include transitive dependencies. A top-level-only pin
  leaves `starlette`, `pydantic`, `httpcore`, `h11` and the rest floating,
  which is the same defect one layer down. Write the complete set, with a
  header comment naming which nine are the direct dependencies and how to
  regenerate the file.
- Do not delete `bot/requirements-dev.txt`'s `-r requirements.txt` line.
- The lockfile is generated. Commit it verbatim as `npm install` produced it;
  do not hand-edit it, reformat it, or prune it.
- Nothing else changes: no source file, no build config.

## Checks

- Frontend: `CI=true npx react-scripts test --watchAll=false` from
  `app/frontend`. Baseline on `staging` before this change — record it.
- Frontend: `CI=true npx react-scripts build` with staging-shaped
  `REACT_APP_*` values, from a **clean `node_modules`** reinstalled through
  `npm ci` against the new lockfile. `npm ci` is the whole point: it fails
  loudly if the lockfile and `package.json` disagree.
- Bot: the full suite from `app/bot` (baseline **193 passed**) against a
  fresh venv built from the pinned `requirements-dev.txt`. Note honestly if
  any package has no wheel for local Python 3.14 and say which check that
  weakened.
- Report both baselines and both after-numbers. A pin that quietly changes a
  version is a failure of this change, not a detail.

## Acceptance

`npm ci` reproduces the frontend install from the tracked lockfile. A clean
`pip install -r bot/requirements.txt` installs one known set. Both suites are
green at their baseline counts. No dependency moved.

## Tasks

- [x] **T1** Track `frontend/package-lock.json` as `npm install` generated it.
      Verify with a clean `npm ci` + build + suite. Own commit — the file is
      373K of generated JSON and must not share a commit with anything a
      reviewer has to read.
      Commit: `047598f9c0be6dbe51105d08ebad87e621be3582` —
      `chore(frontend): track package-lock.json for reproducible installs`.
      The untracked lockfile found on disk was stale: its root
      `dependencies.lucide-react` recorded `^1.47.0` (a range) although
      `package.json` pins the exact `1.47.0`. `npm install` regenerated it;
      the only diff was that one field flipping to the exact string — the
      resolved `node_modules/lucide-react` version was already `1.47.0`
      before and after, so no installed package actually changed. Committed
      the regenerated file verbatim (15013 lines, all additions, one new
      file).
      Baseline (`staging`, before any change):
      `CI=true npx react-scripts test --watchAll=false` →
      `Test Suites: 28 passed, 28 total; Tests: 412 passed, 412 total`.
      After regeneration, same command → identical
      `28 passed / 412 passed`.
      Verify: `rm -rf node_modules && npm ci` → succeeded
      (`added 1335 packages, and audited 1336 packages`, no error). Suite
      re-run after `npm ci` → identical `28 passed / 412 passed`. Build:
      `CI=true npx react-scripts build` with staging-shaped `REACT_APP_*`
      placeholders (same values already used by `src/config.test.js`'s
      `stagingEnvironment` fixture, no real secrets) → `Compiled
      successfully`, `284.78 kB build/static/js/main.18272511.js` gzip. No
      pre-change build existed to diff against (the lockfile was never
      tracked before), but since the resolved `lucide-react` version is
      identical before/after regeneration, the installed dependency set —
      and therefore the bundle — did not change.
      Assess: `gentle-ai review assess --cwd . --agent claude-code
      --base-ref 8be18a00224ef8c88d1c21d5f16f90cdd834f254 --committed-only
      --untracked-scope=exclude
      --expected-untracked-inventory=sha256:e064e85d9025a732f6c50373f309941e6f27c7954e6e9473dde5af3f486005f7
      --json` → `risk: medium`, `review_due: true`,
      `review_due_reason: slice_budget_reached` (the 373K lockfile, as
      anticipated). Per instructions, the returned `next_transition.command`
      was **not** run; it is handed back verbatim in the writer's final
      report for the owner to act on.
- [ ] **T2 — STOPPED, divergence found, decision handed back.**
      Pin `bot/requirements.txt` to the complete set that the
      three-interpreter cross-resolution agrees on, direct and transitive,
      with the regeneration header. Prove the bot suite still passes.

      Baseline (unpinned `requirements-dev.txt`, fresh venv, local Python
      3.14.7): `python -m pytest` from `app/bot` →
      `212 passed, 304 warnings`. This document's own stated baseline is
      "193 passed" — that number is stale relative to the current repo
      (the bot test suite has grown since it was recorded); 212 is what
      was actually observed against current `HEAD`/`staging` and is the
      number this task compares against, honestly reported as a
      discrepancy from the doc rather than silently substituted.

      Cross-target resolution (pip dry-run, `--only-binary=:all:
      --platform manylinux2014_x86_64`, run from `app`) for `3.11`, `3.12`,
      `3.13` against `bot/requirements.txt`:
      ```
      python3 -m pip install --dry-run --report <scratch>/report-<v>.json \
        --only-binary=:all: --python-version <v> \
        --platform manylinux2014_x86_64 --target <scratch>/t<v> \
        -r bot/requirements.txt
      ```
      No `--implementation`/`--abi` overrides were needed; the plain
      `--python-version` form resolved for all three. 34 packages resolved
      per interpreter. 33 of 34 agree exactly across 3.11/3.12/3.13.
      **One package diverges: `asyncpg`.** 3.11 → `0.31.0`, 3.12 →
      `0.30.0`, 3.13 → `0.31.0`. Confirmed twice for 3.12 (not resolver
      noise) and root-caused: `pip download --only-binary=:all:
      --python-version 3.12 --platform manylinux2014_x86_64 asyncpg==0.31.0`
      fails with "Could not find a version that satisfies the requirement
      ... (from versions: 0.29.0, 0.30.0)" — `asyncpg` 0.31.0 ships no
      `cp312`-tagged wheel for `manylinux2014_x86_64` (as of 2026-09-19),
      so pip falls back to `0.30.0` on that interpreter only.

      Per the feature document's own instruction ("If they diverge, STOP
      T2: do not guess and do not pin"), **T2 is stopped here.**
      `bot/requirements.txt` was NOT written or touched.
      `bot/requirements-dev.txt` was NOT touched. No commit was made for
      T2. The decision — which interpreter Railway actually runs, which
      determines whether `asyncpg==0.30.0` or `0.31.0` is correct — is
      handed back to the owner; it's the same class of decision this
      document already deferred for the interpreter version itself.
      T1 was finished regardless, as instructed.

## Delivery

One work-unit commit per task, on a branch off `staging`. Branch name:
`chore/quartzplay-reproducible-installs`.

After **each** commit, assess it:

```
gentle-ai review assess --cwd . --agent claude-code \
  --base-ref <last reviewed boundary> --committed-only --json
```

Read `review_due` and `review_due_reason`. When `review_due` is true,
**stop and hand the returned `next_transition.command` back verbatim** —
the consent envelope is the owner's to answer, not the writer's. Note that
a review candidate containing the 373K lockfile is a real risk of
`lens_context_budget_exceeded`; that is why T1 stands alone, and it is worth
saying out loud in the report if review comes due on it.

No push, no PR.

## Progress

T1 done (commit `047598f`). Frontend lockfile tracked, `npm ci` verified
green at baseline, build verified with staging-shaped placeholders. Review
came due on T1 (`slice_budget_reached`); the consent command was handed back
to the owner rather than run.

T2 stopped by design: the three-interpreter cross-resolution for
`bot/requirements.txt` diverges on `asyncpg` (`0.31.0` for 3.11/3.13,
`0.30.0` for 3.12, because `asyncpg` 0.31.0 has no `cp312` manylinux2014
wheel). Per this document's own instruction, no guess was made and nothing
was pinned or committed for T2. Bot suite baseline observed:
`212 passed` (this document's stated "193 passed" baseline is stale).

## Next step

Owner decides which Python minor version Railway actually runs `app/bot`
on (this is the same open question this document already named for the
interpreter pin itself — see "Out of scope, deliberately"). Once that's
known: re-run the single-interpreter resolution for that version, pin
`bot/requirements.txt` to it (direct + transitive, with the regeneration
header), verify the bot suite against a fresh venv, and commit. Nothing
else on this branch is pending.
