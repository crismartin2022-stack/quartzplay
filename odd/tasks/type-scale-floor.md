# The product stops writing at sizes nobody can read

## The measurement

Counted against this branch, across the six screens:

| Property | Uses | Distinct values | The prototype uses |
|---|---:|---:|---:|
| `fontSize` | 3.354 | 38 | ~10 |
| `borderRadius` | 920 | 18 | 4 |
| `padding` | 1.741 | **211** | 8 steps |
| `gap` | 591 | 15 | — |

**1.521 of the 3.354 text sizes are below 12px.** By screen: Admin 53%,
Agencia 43%, Telegram 42%, `/sitio` 37%, `/box` 19%.

What is actually down there:

```
 7px    2 sites        10px   450 sites
 7.5px  2              10.5px 144
 8px   20              11px   518
 8.5px  6              11.5px 140
 9px  149
 9.5px 90
```

Text at 7 and 8 pixels is not small: it is unreadable on any device. The
prototype's body is 13px and it reaches for 10px four times in its entire
design.

## Why this slice, and why only this slice

The whole normalisation is 6.606 sites. That is not one reviewable change, so
it is split by property; this one takes the floor and nothing else.

It is also the only part with a product argument rather than a tidiness one.
Six of every ten texts the player reads are at a size that is uncomfortable on
a phone, and no typeface, colour or icon fixes that.

## An honest limit, already established

A mechanical pass can raise the floor. **It cannot decide what is body text
and what is a caption** — an 11px button label and an 11px legal note are the
same number to a script and deserve different sizes. Raising the body from 12
to 13 where it is genuinely body is a second pass, per screen, with judgment.

An earlier proposal for this work rounded every size up to the next step on a
scale with an 11px floor. Measured, it moved 1.529 declarations and left the
count of texts at 12px or less **exactly unchanged**. That proposal was
discarded before any code was written. This one sets a floor instead.

## The change

1. `theme.js` gains the three scales the prototype defines, so later passes
   have somewhere to point:
   - spacing, the prototype's 4px grid: 4, 8, 12, 16, 20, 24, 32, 40
   - radii: 6, 10, 14, 20, plus full
   - text sizes: the steps the prototype actually uses
2. Every `fontSize` below 12 becomes 12. Nothing else moves — not radii, not
   padding, not the sizes already at 12 or above.

## The risk, stated plainly

1.521 texts get bigger. Some will wrap differently, some containers will grow,
and **this project's tests never render a component**, so nothing automated
will catch a layout that breaks. The guard can only prove no size below the
floor survives.

That makes staging the real check, and it makes the order matter: floor first,
alone, so that if something looks wrong there is one change to look at.

## Scope

Authorized: `frontend/src/theme.js` and the six screens' `fontSize`
declarations, plus test files.

Out of scope, each its own slice: radii (920 sites), padding and gap (2.332),
and the per-screen judgment pass that raises real body text to 13.

## Constraints

- Only `fontSize` values strictly below 12 change, and only to 12.
- Do not touch a size that is already 12 or above, even if it is odd.
- Do not change any other property while passing through a line.
- The scales added to `theme.js` are additive: nothing that imports it today
  may break.

## Checks

- TDD: strict. Runner: `CI=true npx react-scripts test --watchAll=false` from
  `app/frontend`. Baseline first.
- A guard that no `fontSize` below 12 survives in any of the six screens, with
  a positive control proving the matcher sees sizes at all.
- A guard pinning the scales `theme.js` exports.
- ESLint on each touched file with the project's `no-undef`-only ruleset.
- A production build; report the bundle size before and after.
- Report, per screen, how many declarations changed.

## Tasks

- [ ] **T1** `theme.js` gains the spacing, radius and text scales.
- [ ] **T2** Every text size below 12 becomes 12.

## Delivery

One commit per task on `fix/quartzplay-type-floor`, off `staging`. Assess
after each; hand the returned command back when review is due.

## Progress

Not started.

## Next step

T1.
