# Every tab starts the same way

The panels have 29 tabs. Twenty-one already open with a title, eight open
straight into content, and the twenty-one do not agree with each other. This
turns the de-facto standard into one component and applies it everywhere.

Branch: `feat/quartzplay-page-headers`, off `staging` after #127 and #128.

TDD: off for this project. Tests are source-reading guards, not renders.
Runner: `CI=true APP_ENV=staging REACT_APP_ENV=staging REACT_APP_API_URL=... npm test`
in `app/frontend`. Lint gate is `npm run build` with `CI=true` (CRA 5 runs
ESLint inside the build; `npx eslint` does not work in this repo and never did).

## What the map actually found

There is already a standard. It was never written down, so it drifted.

| Title style | Count | Where |
|---|---|---|
| `fontWeight:700, fontSize:15` | **18** | 14 in Agencia, 4 in Admin |
| `fontWeight:700, fontSize:16` | 1 | `TabUsuarios` |
| `fontWeight:800, fontSize:17` | 1 | `TabPSP` (reached via `billetera`) |
| `fontWeight:800, fontSize:18` | 1 | `TabConfig` |

Descriptions are consistently `fontSize:12, color:Q.muted`. The spacing is
not: title `marginBottom` is unset, `3`, `4` or `10`; description
`marginBottom` is unset, `10`, `12` or `14`; `lineHeight` is `1.4`, `1.55`
or absent, with no rule. Title icons are `size={13}`, `14` or `15`.

So the work is not "invent a header". It is **write down the 700/15 standard
that 18 screens already follow, normalize the four that drifted, and give it
to the eight screens that have nothing.**

## Correction to the exploration report

The mapping agent reported fourteen titles as carrying emoji — `"🎧 Soporte"`,
`"🎁 Bonos activos"`, `"⚡ Combos IA"` and so on. **They do not.** Checked at
the source: every one of them is an icon component.

```
Agencia.jsx:4415   <Headphones size={15}/> Soporte
Agencia.jsx:5694   <Gift size={14}/> Bonos activos
Agencia.jsx:2890   <Zap size={13}/> Combos IA
```

The emoji migration already did these. The 85 literal emoji still in the two
files are in share text for WhatsApp and Telegram, in canvas-drawn images and
in printed HTML — external surfaces where an icon component does not exist.
Those are correct and stay.

Do not "fix" emoji in this change. There are none to fix.

## The component

`PageHeader` in its own file, used by both panels:

```
icon + title        TEXT[15], fontWeight 700, Q.text   ← the existing standard
description         TEXT[12], Q.muted, lineHeight 1.5  ← optional
action              right-aligned, same row as title   ← optional
```

Fixed spacing, decided once: `SPACING[4]` under the title, `SPACING[16]`
under the block. Title icon `size={15}` everywhere.

**No eyebrow by default.** The prototype's eyebrow carries real data —
`Agencia FAR`, `51 agencias`, `Control de red` — not a label. An eyebrow on
all 29 tabs, most of which have no such number, is decoration. The component
accepts one; screens use it only where there is something true to put in it.

## What changes per tab

**Agencia (18)** — replace 13, add 5.

Replace: `envivo` `combos` `mejorar` `misagencias` `influencers` `historial`
`cashout` `bonos` `mensajes` `terminales` `desafios` `asesor` `soporte`.

Add: `codigo` `manual` `clientes` `cierres` `config`.

`codigo` and `config` each have a heading **inside a card** — that is a card
title, not a page title. Leave those alone and add the page header above.

**Admin (11)** — replace 7, add 3, skip 1.

Replace: `eventos` `agencias` `influencers` `usuarios` `diag` `config`, and
`billetera` — whose header lives in `TabPSP`, since `TabBilletera` is a bare
delegate that renders nothing of its own.

Add: `cierre` `combos` `chat`.

**Skip `global`.** It opens on the KPI grid, which is the dashboard's own
hero. A title above it repeats what the numbers already say, on the screen
the admin looks at most.

## Traps the map found — do not trip on these

- `SoporteAgencia`: the nearby `return(` at 4305 is a `useEffect` cleanup.
  The real one is at **4409**.
- `TabUsuarios`, `CombosIA`, `EnVivo`, `FlujoManual`: each has an early
  return for a sub-view. The page header belongs to the opening state, not
  the sub-view.
- `TabPSP`: returns `"Cargando..."` before its header, so the header is not
  the first paint. Leave that branch as it is.
- `MensajesAgencia`: its outer div is `height:"calc(100dvh - 230px)"`. It is
  a scrolling chat viewport. Replacing its header must not change the block's
  total height, or the chat goes below the fold on a phone.

## Tasks

- [x] **T1** — `PageHeader` component + a test that it renders title,
      description and action, and that it uses the theme tokens rather than
      hardcoded numbers.
      `frontend/src/PageHeader.jsx`, `frontend/src/PageHeader.test.js`.
      Commit `4bce08d`.
- [x] **T2** — Agencia: 13 replacements, 5 additions.
      `frontend/src/Agencia.jsx`. Commit `074998d`.
      All 13 traps/edge cases held: `SoporteAgencia`'s real `return(` at
      4409 (not the `useEffect` cleanup at 4305), `CombosIA`/`EnVivo`/
      `FlujoManual`'s early sub-view returns left untouched (header went on
      the opening-state return only), `codigo`/`config`'s in-card headings
      left as card titles with the page header added above them,
      `MensajesAgencia`'s fixed chat-viewport height adjusted from
      `calc(100dvh - 230px)` to `calc(100dvh - 223px)` (PageHeader's fixed
      spacing is 7px taller than the old title/desc margins: 4+16=20 vs
      3+10=13) so the visible chat area is unchanged.
      10 descriptions written (5 additions + 5 previously title-only tabs):
      see report for the exact Spanish copy.
      Tests: 828/828 passed (51 suites, up from 813/50 — T1 added its own
      suite). Build: `Compiled successfully`.
- [ ] **T3** — Admin: 7 replacements, 3 additions, `global` untouched.
- [ ] **T4** — A guard that every tab component's opening view renders
      `<PageHeader`, `global` excepted by name.

      **T4 was respecified after T2.** It first read "a guard that no tab
      still hand-rolls the `fontWeight:700,fontSize:15` title pattern".
      That is not writable: after all 18 agency tabs moved to `PageHeader`,
      **18 of that exact pattern remain in `Agencia.jsx`** — and every one
      is legitimate. `700/15` is this codebase's general emphasis size, not
      a page-header signature:

      ```
      1007  Buscar código de apuesta      ← a card title
      1137  {ars(slip.stake)}             ← an amount
      1539  {opt.odd}                     ← a betting odd
      2456  Crear combo                   ← a sub-view title
      7599  Resetear contraseña           ← a section heading
      ```

      A guard on that pattern would either fail on all of them or be
      riddled with exceptions. Assert the outcome instead: the opening
      view renders the component.

Delivery: T1+T2 in one PR, T3+T4 in the next. The two files are large enough
that one PR would pass the review budget. T1+T2 are done; T3+T4 are a
separate unit, not started.

## Acceptance

- Every tab still reachable and rendering; no duplicated title anywhere.
  (T2: verified by reading each replaced/added return block; no renderer
  available in this repo, so this is a structural/source check, not a
  screenshot.)
- `global` visibly unchanged. (T3, not yet done.)
- Chat viewport height unchanged on `mensajes`. Done — see T2 note above.
- Existing tests still pass; T1 and T4 add their own. T1's test added;
  T4 not yet done.
- `CI=true ... npm run build` → `Compiled successfully`. Confirmed for T1+T2.
