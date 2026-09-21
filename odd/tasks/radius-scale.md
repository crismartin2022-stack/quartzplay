# Four corner radii instead of eighteen

## The measurement

920 literal `borderRadius` declarations across the six screens, in **18
distinct values**:

```
 8px 255    12px  79    14px  22     4px   4    18px   1
 9px 231     7px  64    20px  22     5px   4    21px   1
10px 159    11px  33     6px  13    13px   3   999px   1
                         3px  11    16px   9     2px   8
```

The prototype defines four, and names them: `--radius-sm: 6px`,
`--radius-md: 10px`, `--radius-lg: 14px`, `--radius-xl: 20px`, plus a full
pill. Those values are already in `theme.js` as `RADII`, added by the type
floor slice and so far unconsumed.

Most of the weight — 645 of 920 — sits on 7, 8, 9, 10 and 11, which are five
different ways of writing the same corner. Nobody chose that; it accumulated.

## The change

Every literal radius maps to the nearest step in `RADII`. Where a value sits
exactly between two steps, it rounds **up** — a slightly rounder corner reads
as deliberate, a slightly sharper one reads like a mistake.

That rule puts 8 on 10 and 12 on 14. State the full mapping in the report and
in this document; it is the whole content of the change and it should be
readable without the diff.

The 39 `borderRadius: "50%"`-style string values are circles, not steps on a
scale. They stay.

## Why this is lower risk than the floor

A corner radius changes no box's size, so nothing reflows and nothing wraps
differently. The failure mode is aesthetic, not structural — which is the
opposite of the type floor, and the reason this slice can be larger without
being scarier.

## Scope

Authorized: the six screens' literal `borderRadius` declarations, plus test
files. `theme.js` already holds `RADII` and does not change.

Out of scope: padding and gap (2.332 sites), and the per-screen pass that
raises real body text from 12 to 13.

## Constraints

- Only literal numeric `borderRadius` values change.
- Do not touch a string value (`"50%"`, `"9999px"`) — those are circles.
- Do not change any other property while passing through a line.
- Consume `RADII` from `theme.js` where a screen already imports the theme,
  rather than writing the number again; if that makes a line worse to read,
  say so and write the number, but say which you chose and why.

## Checks

- TDD: strict. Runner: `CI=true npx react-scripts test --watchAll=false` from
  `app/frontend`. Baseline first.
- A guard that every literal radius is one of the four steps, with a positive
  control proving the matcher sees radii at all.
- ESLint on each touched file with the project's `no-undef`-only ruleset.
- A production build; report the bundle size before and after.
- Report, per screen, how many declarations changed, and the full
  value-to-step mapping with counts.

## Tasks

- [ ] **T1** Every literal radius becomes one of the four steps.

## Delivery

One commit on `fix/quartzplay-radius-scale`, off `staging`. Assess after it;
hand the returned command back when review is due.

## Progress

Not started.

## Next step

T1.
