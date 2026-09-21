# One spacing grid instead of two hundred guesses

## The measurement

2.494 spacing declarations across the six screens:

| Property | Uses |
|---|---:|
| `padding` | 1.753 |
| `gap` | 592 |
| `paddingTop` | 108 |
| `paddingBottom` | 32 |
| `paddingLeft` / `paddingRight` | 9 |

By the shape of the value:

- **1.294 are a plain number**, in 27 distinct values. The most used:
  `8×236  20×168  6×159  16×121  10×95  14×82  5×60  0×53  7×52  12×49`
- **1.186 are a string** like `"12px 14px"` — two to four numbers each, so the
  real count of spacing decisions hidden in there is higher than 1.186.
- 11 are a variable and 3 a template literal.

The prototype defines eight steps and nothing else: **4, 8, 12, 16, 20, 24,
32, 40**. They are already in `theme.js` as `SPACING`, added by the type-floor
slice and still unconsumed.

## The change

Every number in a spacing declaration maps to the nearest step. Ties round
**up**, for the same reason the type floor went up: the product reads cramped,
and the cheapest honest way to make it breathe is to stop rounding air away.

`0` is a real value — no space — and stays `0`.

The 11 variables and 3 template literals stay. Report what they are.

## The risk, and why it is bigger than the radius slice

A corner radius changes no box's size. **Padding does.** Every one of these
2.494 declarations moves something, boxes grow, and content that fit on one
line may stop fitting. This is the same class of risk as the type floor, on
more sites.

And as always here: **this project's tests never render a component.** The
guard can prove no spacing value sits off the grid. It cannot prove a screen
still looks right. Staging is the check, and this slice goes alone so that if
something breaks there is one change to look at.

## Scope

Authorized: the six screens' spacing declarations, plus test files.
`theme.js` already holds `SPACING` and does not change.

Out of scope: the per-screen pass that raises real body text from 12 to 13.

## Constraints

- Only spacing values change: `padding`, its four sides, `gap`, `rowGap`,
  `columnGap`. Nothing else on a line you pass through.
- `0` stays `0`.
- Strings keep their shape: `"12px 14px"` becomes `"12px 16px"`, not a
  different number of values and not a number where a string was.
- Consume `SPACING` from `theme.js` for plain numbers, the way the radius
  slice consumed `RADII`. A string of several values cannot reference it
  cleanly; leave those as strings and say so.

## Checks

- TDD: strict. Runner: `CI=true npx react-scripts test --watchAll=false` from
  `app/frontend`. Baseline first.
- A guard that every spacing number is a step or `0`, covering **both** plain
  numbers and the numbers inside strings, with a positive control proving the
  matcher sees spacing at all.
- ESLint on each touched file with the project's `no-undef`-only ruleset.
- A production build; report the bundle size before and after.
- Report, per screen, how many declarations changed, and the full
  value-to-step mapping with counts — including the values found inside
  strings, counted separately from the plain numbers.

## Tasks

- [ ] **T1** Plain numeric spacing values map to the grid.
- [ ] **T2** The numbers inside spacing strings map to the grid.

## Delivery

One commit per task on `fix/quartzplay-spacing-scale`, off `staging`. Assess
after each; hand the returned command back when review is due.

## Progress

Not started.

## Next step

T1.
