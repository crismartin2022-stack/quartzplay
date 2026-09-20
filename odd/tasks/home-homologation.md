# Home screen homologation

## Objective

The player's home screen in the Telegram app looks like the prototype: the mark
at its real size, the mascot inside the hero on the right, drawn icons instead
of emoji, and no colour that is not the brand's.

## Where this is

`ScreenHome` in `frontend/src/App.jsx`, roughly lines 5440–5600, plus the top
bar (`BarraSuperior`, ~5264).

This is the Telegram mini-app, not `/sitio`. The product owner referred to it
as `/sitio`, but the screen they photographed — the Bet Best hero, the
Casino and En vivo cards, "Combo del día", the bottom navigation — exists only
in `App.jsx`. `Web.jsx` has none of those blocks. Working on `Web.jsx` would
change nothing they can see.

## Problem

Four things, all visible in one screenshot:

1. **The mark is half the size it should be.** The top bar draws it at 20px
   tall. The prototype's `.brand img` is 82px wide, which at the file's own
   503:244 ratio is about 40px tall.
2. **The mascot floats above the hero instead of living in it.** The prototype
   puts it inside the hero panel: `position:absolute; right:-33px;
   bottom:-56px; width:185px; clip-path: inset(0 0 13% 0)`, and the panel makes
   room with `min-height:244px; padding-right:166px`.
3. **Emoji where icons belong**: `🎰` Casino, `🎥` En vivo, `🤝` Desafíos,
   `⚡` Combo del día, `🔴` En vivo ahora, `🎁` Saldo bono. Three of those —
   the handshake, the bolt and the gift — have no equivalent in the 36 icons
   the prototype ships. They are in the 64 gaps the inventory recorded.
4. **Colours that are not the brand's**: the Casino card is
   `linear-gradient(135deg,#7B1FA2,#4A148C)` and En vivo is
   `linear-gradient(135deg,#B71C1C,#7F0000)`, both written by hand. The ink
   change left them alone on purpose because they are not accent tokens; that
   was right then and is the thing to fix now.

## Decision: the icon set grows

Point 3 cannot be finished with what we have. `lucide-react` is the full set
the prototype's 36 icons were taken from — verified compatible with this
project's React, and it carries every gap the inventory named. This change
introduces it and uses it on this screen; the rest of the migration follows
screen by screen, guided by `docs/icon-inventory.md`.

## Scope

Authorized: `frontend/src` and `frontend/package.json` in the `app` repository.

Out of scope: every other screen, the 378 hardcoded `'Inter'` declarations in
`App.jsx`, the type and spacing scale, and `/sitio`.

## Constraints

- Mobile first. This screen is looked at on a phone.
- The hero must not lose its headline or its button to the mascot at narrow
  widths; the prototype reserves space rather than overlapping.
- Nothing else on the screen changes: no copy, no layout beyond what these four
  points require.
- Do not touch `Icon.jsx` or the 36 ported icons. Lucide is additive.

## Checks

- TDD: strict. Runner: `CI=true npx react-scripts test --watchAll=false` from
  `app/frontend`.
- `npx eslint <touched files> --no-eslintrc --env browser,es2021 --parser-options ecmaVersion:2021,sourceType:module,ecmaFeatures:{jsx:true} --rule '{"no-undef":"error"}'`
- A production build with staging-shaped `REACT_APP_*` values. Report the
  bundle size before and after — a new dependency has to earn its bytes.

## Tasks

- [x] **T1** Add `lucide-react` and a test that the icons this screen needs
      exist in it. Keep the assets commit separate from the code that uses it.
      Commit `a019d18`. `frontend/src/lucideIconsScreenHome.test.js` checks
      `Video`, `Handshake`, `Zap`, `Gift` against `lucide-react`'s own
      exports (not a hand-typed guess); `Icon.test.js`'s stale
      "lucide-react is never a dependency" guard is replaced with "Icon.jsx
      itself never imports it". `frontend/package-lock.json` was generated
      by `npm install` but left untracked — scope names only `frontend/src`
      and `frontend/package.json`, and the repo carried no lockfile before
      this change.
- [x] **T2** The mark at the prototype's size, in the top bar.
      Commit `de597ff`. `BrandMark size={40}` (82px prototype width /
      503:244 ratio ≈ 39.77 → 40). Top bar padding cut 9px→5px top/bottom
      to absorb the growth; headless Chromium measured 51px before and
      after at 360px width (59px if padding were left alone).
- [ ] **T3** The mascot inside the hero, placed as the prototype places it,
      with the panel making room for it.
- [ ] **T4** Icons instead of emoji on this screen, and the two hand-written
      gradients onto brand accents, with the ink helper deciding what sits on
      them.

## Delivery

One work-unit commit per task. Assess each commit as it lands with
`gentle-ai review assess --cwd . --agent claude-code --base-ref <last reviewed
boundary> --committed-only --json`. When `review_due` is true, **stop and hand
the returned command back rather than running it** — the consent envelope is
the owner's to answer.

## Progress

T1 done (`a019d18`). T2 done (`de597ff`). Baseline on `staging`: 24 suites
/ 384 tests, all green; main.js gzip 282.94 kB. Both T1 and T2 assessed
`review_due: false` (`under_budget`, medium risk from the `package.json`
config change) against `--base-ref staging`, so the reviewed boundary has
not moved and stays `staging`.

## Next step

T3.
