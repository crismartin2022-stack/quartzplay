# Proposal: Adopt The Brand As A Single Theme

## Intent

The product must look like the brand in the `html/` prototype instead of the
provisional neon palette it wears today, and it must be able to keep looking
like it without editing every screen again. This change is the foundation: one
theme module and the real typeface. It changes how the product looks, never
what it does.

## Evidence

- Every screen file declares its own palette: `const Q = {...}` appears in
  `frontend/src/Admin.jsx:8`, `Agencia.jsx:48`, `Casino.jsx:26`, and the same
  shape lives in `App.jsx`, `Web.jsx` and `Box.jsx`. The values are duplicated
  by hand, so a brand change means six edits that can silently drift.
- The palette is referenced as `Q.<key>` roughly 5,400 times across those
  files. The keys are the interface; the values are the only thing that has to
  change.
- Typography is declared the same way: `const F_NUM` / `const F_BODY` in
  `App.jsx:93`, `Web.jsx:98`, `Box.jsx:109`, `Casino.jsx:33`, all pointing at
  `'Barlow Condensed'` and `'Inter'`, neither of which is the brand typeface
  and neither of which is shipped with the app — today they resolve to
  whatever the device has.
- The prototype defines the brand as 42 CSS custom properties in
  `html/styles.css` and ships Poppins 400/500/600/700 as local files in
  `html/assets/fonts/`.
- The app is Create React App with no Tailwind and no UI dependency. The
  prototype's tokens are plain values; they can be adopted without a build
  change, a migration, or a new dependency.

## Scope

- A new `frontend/src/theme.js` that owns the palette and the typography and
  exports them under the key names the screens already use, so no call site
  changes.
- Every screen file imports the theme instead of declaring its own copy.
- Poppins shipped with the app and declared once, so the product renders with
  the brand typeface on a device that has never seen it.
- A test that fails if a screen file declares its own palette again.

Out of scope, each a later wave of the same effort: replacing emoji icons with
the prototype's icon set, the desktop and tablet shell with a sidebar, and the
screen-by-screen redesign. This wave must leave every layout exactly where it
is.

## Decision: how each key maps

The prototype has no amber and no gold. Money, codes and odds are the brand's
positive colour — lime — and the warm ramp is reserved for caution.

| Key today | Value today | Prototype token | New value |
|---|---|---|---|
| `void` | `#020208` | `--ink-950` | `#060a14` |
| `deep` | `#060612` | `--ink-900` | `#0b1120` |
| `card` / `glass` | gradient | `--ink-800` | `#111a2e` |
| `border` | violet alpha | `--line` | `#263550` |
| `dim` | `#2A2A4A` | `--subtle` | `#63718a` |
| `muted` | `#6B7090` | `--muted` | `#9aa8c2` |
| `text` | `#F0F0FF` | `--text` | `#f5f7fb` |
| `green` | `#00FF88` | `--lime` | `#b9ef32` |
| `gold` | `#E8C547` | `--lime` | `#b9ef32` |
| `cyan` | `#00F0FF` | `--violet` | `#9a6cff` |
| `violet` | `#7C3AED` | `--violet` | `#9a6cff` |
| `violet2` | `#9F5FFF` | `--odds-medium` | `#c6afff` |
| `teal` | `#00BCD4` | `--violet` | `#9a6cff` |
| `amber` | `#FFB800` | `--odds-high` | `#ffab9d` |
| `red` | `#FF1744` | `--danger` | `#ff7c8d` |
| `pink` | `#FF0080` | `--danger` | `#ff7c8d` |

Typography becomes Poppins for both roles; the prototype is a single-family
design, and the condensed face was never part of the brand.

## Rollback

Revert the PR. The screens go back to their own palettes; nothing else in the
product depends on the theme module.
