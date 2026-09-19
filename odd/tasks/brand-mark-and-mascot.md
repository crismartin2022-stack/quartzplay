# Brand mark and mascot

## Objective

The product shows the brand's own logo instead of the word "IAQP" set in a
typeface, and uses the mascot where the prototype uses it — the home header and
the empty states.

## Problem

There is no brand image anywhere in the product. The mark is text: a small SVG
hexagon next to `<span>IAQP</span>` in a gradient, repeated per screen
(`frontend/src/App.jsx:233`, `Web.jsx:1420` and `:1748`, `Agencia.jsx:275`,
`Admin.jsx:58`, plus two printed copies in `Agencia.jsx:388` and `:430`).

The prototype ships the real assets and uses them in two roles:

- `html/assets/logo.png` in the topbar's `.brand`, beside the role label
  ("Jugador", "Agencia").
- `html/assets/bot-mascota-001.png` as a header mascot on the home screen and,
  more importantly, in empty states (`.mascot-empty`). Today an empty state in
  our product is a line of grey text and nothing else.
- `html/assets/bot-alpha.png` is the face alone, for small surfaces.

The eleven `logo*.png` files already in `frontend/public/` are **not ours** —
they sit among the casino providers' logos (netent, pragmatic, …) and none
matches the prototype's file by checksum.

## Why now

The product owner named the files. The visual foundation already landed, so
there is a theme to take sizing and colour from, and this is the change with
the most visible return for the least work: the product stops looking like a
recoloured version of the old app and starts carrying its own mark.

## Scope

Authorized: `frontend/src` and `frontend/public` in the `app` repository.

- Ship the three assets with the app, the way the fonts were shipped — content
  hashed through the bundler, not dropped raw in `public/`.
- One shared component for the mark, used by every screen that writes "IAQP"
  today. The printed copies in `Agencia.jsx` are HTML strings for a physical
  ticket; they stay text unless the printer path can carry an image.
- The mascot in the empty states that exist today, and in the home header where
  the prototype puts it.
- An accessible name on the mark; the mascot is decorative and hidden from
  assistive technology.

Out of scope: the 378 hardcoded `'Inter'` declarations in `App.jsx`, the emoji
migration on the player screens, the type and spacing scale, and the
screen-by-screen redesign. Each is its own piece of work.

## Constraints

- No new dependency.
- Mobile first. The mark must not push a header taller on a phone.
- Both themes. The logo is a raster image with its own colours; check it reads
  on the light surfaces as well as the dark ones, and say so if it does not.
- Nothing else in the touched files changes: no layout, no reordering.

## Checks

- TDD: strict. Runner: `CI=true npx react-scripts test --watchAll=false` from
  `app/frontend`.
- `npx eslint <touched files> --no-eslintrc --env browser,es2021 --parser-options ecmaVersion:2021,sourceType:module,ecmaFeatures:{jsx:true} --rule '{"no-undef":"error"}'`
- A production build, with the staging-shaped `REACT_APP_*` variables, showing
  the assets in the bundle.

## Acceptance

Every screen that showed the word "IAQP" shows the mark. Every empty state that
exists today shows the mascot. The suite is green and the build carries the
three files.

## Tasks

- [x] **T1** Ship the three assets and write the shared mark component, with
      its tests: it draws the brand image, carries an accessible name, and
      takes its size from the caller.
      Commit: `55a7960` — `feat(frontend): ship brand assets and BrandMark component`.
- [x] **T2** Replace the text mark in `App.jsx`, `Web.jsx`, `Agencia.jsx` and
      `Admin.jsx` with the component. Leave the two printed copies alone and
      say why in the report.
      Commit: `8666318` — `feat(frontend): replace the hexagon-and-text IAQP mark with BrandMark`.
- [x] **T3** Put the mascot in the empty states and in the home header, with a
      test that an empty state is not just a line of text.
      Commit: `2d961c5` — `feat(frontend): show the mascot in empty states and the home header`.
- [x] **T4** Replace the four split IA/QP marks the original grep-based scope
      missed (`App.jsx` `BarraSuperior`, `Web.jsx`'s and `Casino.jsx`'s
      headers, `Box.jsx`'s header) with `BrandMark`; also fixes `App.jsx`'s
      `BotMsg` sender label (the same contiguous-text pattern as the already-
      fixed `Web.jsx` `BotMsgWeb`, found by the same reading); deletes the
      now-confirmed-dead `QPLogo` from `App.jsx` instead of leaving it
      updated-but-unused; adds `brandNeverTypedAsText.test.js`, a general
      regression guard for the whole class (contiguous or split across any
      number of tags), not just these sites.
      Commit: `0a8082d` — `fix(frontend): replace the split IA/QP mark and drop dead QPLogo`.

## Progress

Done, on branch `feat/quartzplay-brand-mark` (off `staging`, HEAD before this
work: `7c3e722`). Baseline (`staging`, before any change): 17 suites / 345
tests, all passing. After all four tasks: 22 suites / 406 tests, all
passing. `npx eslint` with the required `no-undef`-only ruleset is clean on
every touched file, including `Casino.jsx` and `Box.jsx` (in scope for T4
only, for the mark). `CI=true npx react-scripts build` with staging-shaped
`REACT_APP_*` values compiles both before and after T4; the three assets
land in `build/static/media/` content-hashed (`logo.*.png` 70K,
`bot-alpha.*.png` 79K, `bot-mascota-001.*.png` 391K) in both builds.

Per-site `size` chosen for the four T4 marks, and why (each keeps the
header's pixel height the same or smaller than before, never taller):
- `App.jsx` `BarraSuperior`, `Casino.jsx` header: `size={20}`, matching
  both sites' old `fontSize:20` exactly (old line-height ≈ 24px, new
  height 20px).
- `Web.jsx` header: `size={ancho?23:19}`, matching the old
  `fontSize:ancho?23:19` responsive split verbatim. Not a height risk
  either way — that header has a fixed `height:56` from other content, so
  the mark was never what set its height.
- `Box.jsx` header: `size={26}`, matching the old `fontSize:26` — but that
  div also set `lineHeight:1` explicitly (not the usual ~1.2), so the old
  height was exactly `26px`, not `26*1.2`. New height `26px` is equal, not
  smaller — still satisfies "not taller."

`QPLogo` in `App.jsx`: confirmed unreferenced before deleting it — `rg -n
"QPLogo" .` across all of `frontend/src` turned up only its own
definition line (no `<QPLogo` anywhere, not exported). Deleted rather than
left drawing `BrandMark` unused.

The new general test (`brandNeverTypedAsText.test.js`) looks for the
letters I, A, Q, P appearing in that order with nothing between them but
whitespace or up to 4 bounded "hops" of tags — anchored so the run starts
right after a `>` and ends right before a `<`, which is what a real
mark-as-text render looks like whether it's contiguous or split across
any number of spans/elements. Bounding each gap's tag/whitespace-run count
(rather than leaving the repetition unbounded) was necessary: an
unbounded version caused catastrophic backtracking and hung on the larger
files (App.jsx, Agencia.jsx). The anchor to `>`…`<` with nothing else in
the run is what keeps it from false-positiving on the word inside a
sentence ("Generados por IAQP IA", "IAQP · Jugá con responsabilidad…"), a
`//` comment, or a canvas/Web-Share-API string
(`g.fillText("IAQP", …)`, `title:"IAQP"`) — none of which sit directly
between tag delimiters. It runs against all six screen files (`App.jsx`,
`Web.jsx`, `Casino.jsx`, `Box.jsx`, `Admin.jsx`, `Agencia.jsx`), with the
two printed-ticket function bodies excluded by name (the one deliberate,
already-agreed exception).

Findings, not fixed here (out of this change's authorized scope):
- The shipped `logo.png`'s "iaqp" wordmark is drawn in near-white with a
  faint outline — built for a dark surface. On the `claro` (light) theme it
  is effectively illegible: only the lime dot and the gradient tail
  accent remain visible. This needs a light-theme logo variant (or an
  inverted/recolored asset) before the mark can be trusted on light
  surfaces; not something CSS can safely paper over on a raster image.
- `bot-alpha.png` ("the face alone, for small surfaces") has no placement
  anywhere in the prototype's own HTML (confirmed by grep across every
  `html/*.html` file) — the prototype only ever draws
  `bot-mascota-001.png`. It is shipped and bundled per T1's instruction,
  and exported from `Mascot.jsx` as `MASCOT_FACE_ASSET` so it is available
  and content-hashed without this change inventing a placement the
  prototype does not have.
- The home-screen mascot placement (`ScreenHome` in `App.jsx`) has no
  literal analogue to the prototype's `hero-balance` card: `ScreenHome`
  does not show the balance itself (that lives in the separate
  `BarraSuperior` topbar), so there is no card to overlay the mascot onto
  the way `player-home.html` does. It was placed as a small, additive,
  top-right decorative strip at the very top of `ScreenHome`'s own markup
  instead — a judgment call, not a literal copy of the prototype's layout;
  said so here rather than silently inventing a placement.
- `Web.jsx` has no screen structurally equivalent to the prototype's home
  screen (it is a bot/kiosk companion flow — `PantallaTerminal`,
  `JuegoResponsableWeb`, `QKBWeb`, `BotMsgWeb` — not a navigable home), so
  no header-mascot placement was added there; only its plain-text empty
  states got the mascot.

## Next step

Ready for review (native RDD is off; no review candidate was created).
Not pushed, no PR opened, per the delivery instructions for this task.
