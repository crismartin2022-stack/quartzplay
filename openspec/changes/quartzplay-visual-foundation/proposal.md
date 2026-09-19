# Proposal: Adopt The Brand As A Single Theme

## Intent

The product must look like the brand in the `html/` prototype instead of the
two provisional palettes it wears today, and it must be able to keep looking
like it without editing every screen again. This change is the foundation: one
theme module and the real typeface. It changes how the product looks, never
what it does.

## Evidence

The codebase does not have one palette. It has two, in two different shapes,
and the earlier draft of this proposal described only the first.

- **Single palette, older colours.** `frontend/src/Admin.jsx:8`,
  `Agencia.jsx:48` and `Casino.jsx:26` each declare `const Q = {...}` with a
  neon set: `void:"#020208"`, `violet:"#7C3AED"`, `cyan:"#00F0FF"`,
  `green:"#00FF88"`, `gold:"#E8C547"`.
- **Two themes, newer colours.** `frontend/src/App.jsx:22`, `Web.jsx:30` and
  `Box.jsx` each declare `const TEMAS = { oscuro, claro }` with a blue and gold
  set: `void:"#050914"`, `violet:"#2B6BFF"`, `gold:"#FFC531"`. `Q` is assigned
  from whichever theme is active.
- **Light mode is a real feature, not a leftover.** The player chooses it and
  the choice is kept: `localStorage` key `qp_tema`, read by `temaGuardado()`
  (`Web.jsx:57`). The switch is referenced 18 times across the screens.
- The palette is referenced as `Q.<key>` roughly 5,400 times. The keys are the
  interface; the values are the only thing that has to change.
- Typography is declared the same way in each file: `const F_NUM` /
  `const F_BODY` in `App.jsx:93`, `Web.jsx:98`, `Box.jsx:109`, `Casino.jsx:33`,
  all naming `'Barlow Condensed'` and `'Inter'` — neither is the brand typeface
  and neither is shipped with the app, so today they resolve to whatever the
  device happens to have.
- The prototype defines the brand as 42 CSS custom properties in
  `html/styles.css` and ships Poppins 400/500/600/700 as local files in
  `html/assets/fonts/`. It is **dark only**: there is no light token set.
- The app is Create React App with no Tailwind and no UI dependency. The
  prototype's tokens are plain values, so they can be adopted without a build
  change, a migration or a new dependency.

## Decision: light mode stays, and its palette is derived

The product owner chose to keep the switch and derive the light variant from
the new brand rather than drop the feature or leave two identities in the
product.

The existing code already records the rule that governs this, in a comment at
`Web.jsx:27`: the gold of the odds has to darken in light mode, because
`#FFC531` on white cannot be read; the bright value survives only as a
background with dark text on it. Lime needs exactly the same treatment.

| Key | Today (single) | Today (dark) | New dark | New light |
|---|---|---|---|---|
| `void` | `#020208` | `#050914` | `#060a14` | `#eef1f7` |
| `deep` | `#060612` | `#080E1F` | `#0b1120` | `#ffffff` |
| `dark` / `surface` | — | `#0D1530` | `#111a2e` | `#ffffff` |
| `card` | — | `#111B3B` | `#111a2e` | `#f6f8fc` |
| `inset` | — | `#0A1128` | `#060a14` | `#f1f4fa` |
| `border` | violet alpha | `#1E2A52` | `#263550` | `#d9e0ee` |
| `text` | `#F0F0FF` | `#E9EFFF` | `#f5f7fb` | `#0b1120` |
| `muted` | `#6B7090` | `#93A0C8` | `#9aa8c2` | `#5b6780` |
| `dim` | `#2A2A4A` | `#5A6690` | `#63718a` | `#7c879e` |
| `green` | `#00FF88` | `#25D07A` | `#b9ef32` | `#5b7a0f` |
| `gold` | `#E8C547` | `#FFC531` | `#b9ef32` | `#5b7a0f` |
| `goldBg` | — | `#FFC531` | `#b9ef32` | `#b9ef32` |
| `violet` | `#7C3AED` | `#2B6BFF` | `#9a6cff` | `#6b3fd4` |
| `violet2` | `#9F5FFF` | `#7B3FE4` | `#c6afff` | `#8a5ff0` |
| `cyan` / `teal` | `#00F0FF` | `#5A8CFF` | `#c6afff` | `#8a5ff0` |
| `blue` | — | `#2B6BFF` | `#9a6cff` | `#6b3fd4` |
| `amber` | `#FFB800` | `#FFA51F` | `#ffab9d` | `#a8501f` |
| `red` / `pink` | `#FF1744` | `#FF3B5C` | `#ff7c8d` | `#c2273f` |

The dark column is the prototype's own tokens: `--ink-950`, `--ink-900`,
`--ink-800`, `--line`, `--text`, `--muted`, `--subtle`, `--lime`, `--violet`,
`--odds-medium`, `--odds-high`, `--danger`. The prototype has no amber and no
gold, so money, codes and odds take lime — in this brand the positive colour
is the colour of money — and the warm ramp is kept for caution.

The light column is derived, not invented: same hues, luminosity inverted, and
every foreground value darkened until it reads on white.

## Scope

- A new `frontend/src/theme.js` that owns both themes and the typography and
  exports them under the key names the screens already use, so no call site
  changes.
- The three single-palette screens read the dark theme from it. The three
  two-theme screens read both from it, and keep their switch working exactly
  as it does today.
- Poppins shipped with the app and declared once, so the product renders with
  the brand typeface on a device that has never seen it.
- Tests that fail if a screen declares its own palette again, if a key is
  missing from either theme, or if a foreground value would be unreadable on
  its own background.

Out of scope, each a later wave: replacing emoji icons with the prototype's
icon set, the desktop and tablet shell with a sidebar, and the screen-by-screen
redesign. This wave leaves every layout exactly where it is.

## Rollback

Revert the PR. The screens go back to their own palettes; nothing else in the
product depends on the theme module.
