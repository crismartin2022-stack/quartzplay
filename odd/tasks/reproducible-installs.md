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
repository, and this document. Removing dependencies from
`bot/requirements.txt` that are declared but never imported anywhere in
`bot/` is also authorized (owner-approved scope addition, T3) — this is
still "record what's true," not "upgrade or add," so it fits the same
authorization as pinning.

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
  `app/bot` an unknown default. Resolve inside a container of the real
  deploy target, not by guessing `pip`'s `--platform` tag. Railway's
  railpack runtime image (`ghcr.io/railwayapp/railpack-runtime`,
  `mise-2026.8.16`) is Debian 13 "trixie" / glibc 2.41 / amd64 — confirmed
  by running `ldd --version` and reading `/etc/os-release` inside that
  image. Resolve with:
  ```
  docker run --rm --platform linux/amd64 \
    -v "$(pwd)/bot/requirements.txt:/req.txt:ro" \
    python:<v>-slim-trixie \
    sh -c 'pip install --quiet --no-cache-dir -r /req.txt && \
           pip freeze --all --exclude-editable'
  ```
  for **3.11, 3.12 and 3.13** (`python:<v>-slim-trixie` is the same Debian
  trixie / glibc family, amd64), dropping `pip`/`setuptools`/`wheel`/
  `packaging` from the output — those are the base image's own
  pre-installed toolchain (present by default on `python:3.11-slim-trixie`,
  absent on `python:3.12`/`3.13-slim-trixie`), never something
  `bot/requirements.txt` pulls in — and pin only if all three then agree on
  the same version set. If they diverge, do not guess: report the
  divergence and which packages differ, with the offending package's PyPI
  wheel-file listing as evidence, and pin nothing for the bot until the
  owner picks the interpreter.

  **Do not use `pip install --dry-run --report --platform <manylinux tag>`
  for this.** It was tried first and produced a false divergence:
  `asyncpg==0.31.0` resolved for 3.11 and 3.13 but fell back to
  `asyncpg==0.30.0` for 3.12 under `--platform manylinux2014_x86_64`. PyPI's
  own file listing for `asyncpg` 0.31.0 shows why —
  `asyncpg-0.31.0-cp312-cp312-manylinux_2_28_x86_64.whl` exists, it is just
  tagged `manylinux_2_28` only, with no `manylinux2014` alias, unlike the
  cp311/cp313 wheels which carry both tags. A single `--platform` value is
  a guess at which manylinux tags the target actually satisfies; it isn't
  one, so it silently discards real wheels. Resolving inside the actual
  target container has no such gap.
- The pinned set must include transitive dependencies. A top-level-only pin
  leaves `starlette`, `pydantic`, `httpcore`, `h11` and the rest floating,
  which is the same defect one layer down. Write the complete set, with a
  header comment naming which direct dependencies (seven, as of T3) it was
  regenerated from and how to regenerate the file.
- **`bot/requirements.txt` is generated, never hand-edited line by line.**
  The file pins direct and transitive packages together, and which
  transitive package belongs to which direct dependency is not obvious
  from reading the file — a name that looks like it belongs to one direct
  dependency can actually be pulled in by a completely different one. T3
  hit this directly: `annotated-doc` sits right next to `anthropic` in the
  old sorted list and reads like it could be `anthropic`'s dependency, but
  it is a hard dependency of `fastapi`. Hand-deleting the "anthropic-only"
  lines by inspection would have deleted `annotated-doc` along with
  `anthropic`, and then `import fastapi` raises `ModuleNotFoundError`,
  which kills `bot/casino_api.py:7` and therefore `uvicorn casino_api:app`
  never boots. The only safe procedure is to regenerate the whole file
  from the direct-dependency list, never to edit pin lines by hand.
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
- Bot: the full suite from `app/bot` (baseline **212 passed** — measured
  fresh against current `HEAD` with the unpinned `requirements-dev.txt`;
  this document previously stated 193, which was stale) against a fresh
  venv built from the pinned `requirements-dev.txt`. Note honestly if any
  package has no wheel for local Python 3.14 and say which check that
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
- [x] **T2** Pin `bot/requirements.txt` to the complete set that the
      three-interpreter cross-resolution agrees on, direct and transitive,
      with the regeneration header. Prove the bot suite still passes.
      Commit: `07af0dbf285dac792f3217bc866560d41e99dcb0` —
      `chore(bot): pin requirements.txt to the resolved dependency set`.

      Baseline (unpinned `requirements-dev.txt`, fresh venv, local Python
      3.14.7): `python -m pytest` from `app/bot` →
      `212 passed, 304 warnings`. This document previously stated the
      baseline as "193 passed"; that was stale against the current repo
      (the bot suite has grown since it was recorded). 212 is what was
      actually measured against current `HEAD` and is the number this task
      compares against — the stale figure has now been corrected above in
      `## Checks` rather than silently overwritten here.

      **First attempt produced a false divergence — corrected before
      pinning.** The pip cross-target dry-run recipe this document
      originally prescribed (`pip install --dry-run --report --only-binary
      --python-version <v> --platform manylinux2014_x86_64`) resolved
      `asyncpg==0.31.0` for 3.11 and 3.13, but fell back to
      `asyncpg==0.30.0` for 3.12 — a real-looking divergence, reported and
      T2 stopped on the first pass. It turned out to be an artifact of the
      method, not a real interpreter difference: PyPI's file listing for
      `asyncpg` 0.31.0 (`https://pypi.org/pypi/asyncpg/0.31.0/json`)
      includes `asyncpg-0.31.0-cp312-cp312-manylinux_2_28_x86_64.whl` — the
      cp312 wheel exists, it is just tagged `manylinux_2_28` only, unlike
      the cp311/cp313 wheels which also carry `manylinux2014`. A single
      `--platform manylinux2014_x86_64` value made pip blind to that wheel
      and it silently fell back to an older version on that one
      interpreter. This was reproduced twice (not resolver noise) before
      being root-caused, so it was correctly reported rather than
      guessed past — the method was the defect, not the judgment to stop.

      **Corrected method: resolve inside the real deploy target.** Pulled
      Railway's own railpack runtime image
      (`ghcr.io/railwayapp/railpack-runtime:mise-2026.8.16`) and read it:
      `ldd --version` → glibc 2.41; `/etc/os-release` → Debian GNU/Linux 13
      "trixie", amd64. Re-ran the resolution inside
      `python:<v>-slim-trixie` containers (`--platform linux/amd64`) for
      3.11, 3.12, 3.13 with `pip install -r bot/requirements.txt && pip
      freeze --all --exclude-editable` — an actual install against the
      target's real wheel compatibility, no tag guessing. Confirmed
      `ldd`/`/etc/os-release` match glibc 2.41 / Debian trixie on all three
      images. `pip freeze --all` on a bare (nothing installed) container of
      each image showed that `python:3.11-slim-trixie` ships
      `packaging`/`setuptools`/`wheel` pre-installed by default while
      `python:3.12`/`3.13-slim-trixie` ship only bare `pip` — so those four
      names were excluded as the base image's own toolchain, not
      dependencies of `bot/requirements.txt`. After that exclusion, **all
      three interpreters agree exactly: 34 packages, byte-identical
      versions, including `asyncpg==0.31.0` on all three.** Pinned that
      set.

      `bot/requirements.txt` rewritten as the complete pinned set (34
      lines: the 9 direct dependencies plus 25 transitive), sorted
      case-insensitively by name, `uvicorn[standard]` kept with its extra
      on the direct line, preceded by a header comment naming the nine
      direct dependencies and the exact docker regeneration command (see
      the corrected `## Constraints` above — this is the same recipe).
      `bot/requirements-dev.txt` left untouched (`-r requirements.txt` line
      intact).

      Verify: fresh scratchpad venv, local Python 3.14.7,
      `pip install -r requirements-dev.txt` from the pinned file →
      succeeded, no wheel gaps (every pinned package, including
      `asyncpg==0.31.0`, has a `cp314` wheel). `python -m pytest` →
      `212 passed, 304 warnings` — matches the measured baseline exactly.
      No check was weakened.
- [x] **T3** Remove the two dependencies in `bot/requirements.txt` that are
      declared but never used anywhere in `bot/`: `anthropic` and
      `APScheduler`. Established by two independent blind code reviews plus
      an empirical run (no static, function-local, conditional or dynamic
      import of either name anywhere in `bot/`; the Claude integration is
      raw `httpx`, not the SDK; recurring work is hand-rolled `asyncio`
      loops, not APScheduler; `python-telegram-bot==22.8` is declared
      without the `[job-queue]` extra so it never pulls APScheduler in, and
      PTB degrades gracefully even if `job_queue` were touched; a venv from
      only the seven remaining direct dependencies ran the full bot suite
      green with zero `ModuleNotFoundError`).
      Commit: `4416a8a66e924716f18f397e925aac9ad4a56d86` —
      `chore(bot): remove unused anthropic and apscheduler dependencies`.

      **Regenerated the whole file, never hand-edited pin lines.** Wrote the
      seven remaining direct dependencies (`python-telegram-bot==22.8`,
      `httpx==0.28.1`, `asyncpg==0.31.0`, `python-dotenv==1.2.3`,
      `fastapi==0.141.1`, `uvicorn[standard]==0.53.0`, `bcrypt==5.0.0`) to a
      scratchpad file and re-ran the same three-interpreter docker
      cross-resolution T2 established (`python:3.11/3.12/3.13-slim-trixie`,
      `--platform linux/amd64`, against the same Railway deploy target),
      dropping `pip`/`setuptools`/`wheel`/`packaging` from each output as
      before. **All three interpreters agreed exactly: 25 packages,
      byte-identical versions** — no divergence to report this time.

      Diffed the new 25-package set against the previous 34-package set.
      Exactly nine packages disappeared: `anthropic`, `APScheduler`,
      `docstring_parser`, `httpcore2`, `httpx2`, `jiter`, `sniffio`,
      `truststore`, `tzlocal` — this matches the predicted list exactly.
      `annotated-doc==0.0.5` is still present, confirming it is `fastapi`'s
      dependency, not `anthropic`'s, as the header comment now states
      explicitly (see the corrected `## Constraints` entry above).
      `bot/requirements-dev.txt` left untouched (`-r requirements.txt` line
      intact).

      Verify: fresh scratchpad venv, local Python 3.14.7,
      `pip install -r requirements-dev.txt` from the regenerated file →
      succeeded, no errors. `python -m pytest` from `app/bot` →
      `212 passed, 304 warnings` — matches the 212 baseline exactly. All 11
      bot modules imported with zero `ModuleNotFoundError`
      (`config`, `db`, `auth`, `log_hygiene`, `odds_api`,
      `psp_webhook_auth`, `casino_api`, `casino_twa`, `bot_handlers`,
      `admin_handlers`, `server`); `casino_api` raised
      `ConfigError: app_env.invalid` on bare import, which is expected
      env-var validation, not a missing-module failure.
- [x] **T4** Add a characterization test for `bot/auth.py`'s password path
      (`hash_password`/`verify_password`), which had zero coverage before
      this — the reason a major `bcrypt` bump could have shipped unnoticed.
      Commit: `6956bc528be8b9d20224b0b7c4c8ec5d23e1ea19` —
      `test(bot): characterize the auth.py password round trip`.

      Added `bot/tests/test_auth_password_roundtrip.py` (6 tests, using
      only `auth`'s public functions plus `hashlib.sha256` to construct the
      legacy stored form, which by definition can't be produced any other
      way): a password verifies against its own hash; a wrong password does
      not verify; the produced hash carries the bcrypt `$2` prefix (cost
      factor not pinned, since the code doesn't set one explicitly); a
      73-byte password still round-trips through the `_bytes72` truncation;
      a legacy SHA256 stored value (the form real production rows still
      carry, migrated on first login by `bot/casino_api.py:409`) still
      verifies; and a stored value in neither form does not verify. Used
      module-scoped fixtures so the slow bcrypt hash is computed once per
      password rather than once per assertion (2 `hashpw` calls total for
      the whole file).

      No meaningful RED phase exists for a characterization test of working
      code, so none was faked. Instead, proved the test has teeth: flipped
      `test_wrong_password_does_not_verify`'s assertion from
      `is False` to `is True`, re-ran that one test, and observed it fail
      (`AssertionError: assert False is True`, with `verify_password`
      correctly returning `False` for the wrong password) — then reverted
      the change.

      Full suite: `python -m pytest` from `app/bot` → **218 passed**,
      304 warnings (212 baseline + 6 new tests, all green).

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

All four tasks done.

T1 (commit `047598f`): frontend lockfile tracked, `npm ci` verified green at
baseline, build verified with staging-shaped placeholders. Review came due
on T1 (`slice_budget_reached`); the consent command was handed back to the
owner rather than run.

T2 (commit `07af0db`): `bot/requirements.txt` pinned to the complete
34-package set (direct + transitive) that all of Python 3.11, 3.12 and 3.13
agree on when resolved inside Railway's real deploy target (Debian 13
trixie / glibc 2.41, via docker). The first resolution attempt, using the
`pip --dry-run --platform manylinux2014_x86_64` recipe this document
originally prescribed, produced a false divergence on `asyncpg`
(0.31.0 vs 0.30.0 on 3.12) caused by that single platform tag missing a
real cp312 wheel tagged only `manylinux_2_28`. `## Constraints` above has
been corrected to the docker-based method that doesn't have this gap. Bot
suite baseline was measured fresh at **212 passed** (this document's
previous "193 passed" was stale and has been corrected in `## Checks`);
the pinned set reproduces 212 passed exactly, with no wheel gaps on local
Python 3.14.

Assess run twice after the T2 commit, both reported, neither's lifecycle
command run:
- From the last reviewed boundary (`staging`, `8be18a0`, nothing has been
  acknowledged yet): `risk: medium`, `review_due: true`,
  `review_due_reason: slice_budget_reached` — same class as T1, expected
  once the lockfile and the bot pin are both in the diff. Returned
  `next_transition.command`:
  ```
  gentle-ai review status '--cwd=/Users/usuario/Documents/Trabajo 2026/iaqp/app' --contract=gentle-ai.review-integration/v2 --agent=claude-code --next-transition=true --base-ref=8be18a00224ef8c88d1c21d5f16f90cdd834f254 --committed-only=true
  ```
- Scoped to the bot change alone (`--base-ref 047598f`, i.e. from T1's
  commit): `risk: medium`, `review_due: false`,
  `review_due_reason: under_budget` — no `next_transition` returned.

Both are informational for the owner to choose between; the writer ran
neither.

T3 (commit `4416a8a`): removed `anthropic` and `APScheduler` from
`bot/requirements.txt`, regenerating the whole file (never hand-editing pin
lines) from the seven remaining direct dependencies, re-resolved across
Python 3.11/3.12/3.13 inside the real Railway deploy target — all three
agreed exactly on 25 packages, no divergence this time. Exactly the
predicted nine packages disappeared (`anthropic`, `APScheduler`,
`docstring_parser`, `httpcore2`, `httpx2`, `jiter`, `sniffio`, `truststore`,
`tzlocal`); `annotated-doc` survived, confirmed as `fastapi`'s dependency,
not `anthropic`'s. Bot suite still `212 passed` after the pin change, and
all 11 bot modules import with zero `ModuleNotFoundError`.

Assess run twice after the T3 commit, both reported, neither's lifecycle
command run:
- From the last reviewed boundary (`staging`, `8be18a0`): `risk: medium`,
  `review_due: true`, `review_due_reason: slice_budget_reached` (same class
  as T1/T2 — the accumulated branch, including the 373K lockfile, is still
  in scope for that boundary). Returned `next_transition.command`:
  ```
  gentle-ai review status '--cwd=/Users/usuario/Documents/Trabajo 2026/iaqp/app' --contract=gentle-ai.review-integration/v2 --agent=claude-code --next-transition=true --base-ref=8be18a00224ef8c88d1c21d5f16f90cdd834f254 --committed-only=true
  ```
- Scoped to the T3 commit alone (`--base-ref 4a2ea81`, T2's docs commit):
  `risk: medium`, `review_due: false`, `review_due_reason: under_budget` —
  no `next_transition` returned.

T4 (commit `6956bc5`): added `bot/tests/test_auth_password_roundtrip.py`
(6 tests) covering the previously-untested `auth.py` password path.
Deliberately broke one assertion to prove the test has teeth, observed it
fail, reverted. Full suite went from 212 to **218 passed**.

Assess run twice after the T4 commit, both reported, neither's lifecycle
command run:
- From the last reviewed boundary (`staging`, `8be18a0`): `risk: high`
  (`hot_path`, signal: `auth`), `review_due: true`,
  `review_due_reason: high_risk`. Returned `next_transition.command`:
  ```
  gentle-ai review status '--cwd=/Users/usuario/Documents/Trabajo 2026/iaqp/app' --contract=gentle-ai.review-integration/v2 --agent=claude-code --next-transition=true --base-ref=8be18a00224ef8c88d1c21d5f16f90cdd834f254 --committed-only=true
  ```
- Scoped to the T4 commit alone (`--base-ref 4416a8a`, T3's commit):
  `risk: high` (same `hot_path`/`auth` signal), `review_due: true`,
  `review_due_reason: high_risk`. Returned `next_transition.command`:
  ```
  gentle-ai review status '--cwd=/Users/usuario/Documents/Trabajo 2026/iaqp/app' --contract=gentle-ai.review-integration/v2 --agent=claude-code --next-transition=true --base-ref=4416a8a66e924716f18f397e925aac9ad4a56d86 --committed-only=true
  ```
  Unlike T1–T3, the T4-scoped assessment is *also* review-due (a new test
  file touching the `auth` hot path is high risk on its own, independent of
  branch size), so both commands are live options for the owner, not just
  the full-branch one.

All four are informational for the owner to choose between; the writer ran
none of them.

## Next step

Nothing pending on this branch. All four tasks are complete, verified and
committed. Outstanding for the owner: answer (or ignore) the review consent
envelopes above (T1's full-branch one, and T4's two — full-branch and
T4-scoped, both high risk), and separately decide the Python interpreter
pin for `app/bot` (still out of scope here, per "Out of scope,
deliberately" — now more actionable since this change establishes the
image is Debian 13 trixie / glibc 2.41, whichever minor version is chosen).
