# Tasks: Quote The Line The Ticket Actually Names

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 250–350 (tests about half) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR into `staging` |
| Delivery strategy | auto-chain |
| Chain strategy | stacked |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked
400-line budget risk: Medium

## Phase 1: RED — reading the threshold

- [x] 1.1 Tests for reading a threshold out of a selection: `Over 2.5`,
      `Más de 2.5`, `Menos de 1,5`, `Under 3`, a selection with no number, a
      selection with several numbers, and the Spanish decimal comma.
- [x] 1.2 Tests for choosing a line: the exact threshold is carried; it is not
      and the nearest one is taken; no total exists at all.

## Phase 2: GREEN — the resolver

- [x] 2.1 Read the threshold in `buscar_cuota_nuestra` and match on it.
- [x] 2.2 Report to the caller when the quote is about a different line. Keep
      the four call sites working (`:15298`, `:15339`, `:22093`, `:22135`).
- [x] 2.3 Run the bot suite green.

## Phase 3: The scanner honours the fallback

- [x] 3.1 Test that a pick quoted on a different line is not improved and
      carries its own state.
- [x] 3.2 Mark those picks in `/api/mejorar-combinada` and in
      `/api/admin/escanear-combo`, carrying the line actually quoted.
- [x] 3.3 Test that the generated ticket carries the quoted line, not the one
      the rival's ticket named.

## Phase 4: The screens

- [x] 4.1 Show the new state in `Web.jsx` and `App.jsx`, beside the existing
      ones, naming the line being quoted.
- [x] 4.2 Tests for the screen decisions that do not need a browser.

## Phase 5: Delivery

- [ ] 5.1 Open the PR into `staging`.
- [ ] 5.2 Exercise the scanner in staging with a ticket whose threshold we do
      not carry, and confirm the screen says so.
