# Proposal: Dark Ink On A Bright Accent

## Intent

Where a brand accent is the background, the text on it must be the brand's dark
ink, not white. This repairs a regression that is live in production and closes
the hole in the test that let it through.

## Evidence

The product owner reported that the sport icons in the sportsbook disappeared.
They did not disappear; they became unreadable.

- The active sport tab is `chip(true)` (`frontend/src/Web.jsx:5021`):
  `background: linear-gradient(135deg, ${Q.violet}, ${Q.violet2})` with
  `color: "#fff"`. `IconoDeporte` (`:213`) is handed `"#fff"` as its stroke when
  the tab is active.
- The visual foundation remapped `violet2` and `cyan` to `--odds-medium`
  (`#c6afff`). In the prototype that token is a **text** colour used on a dark
  background. It was mapped as if it were interchangeable, and it is not.

Measured contrast of white against the gradient ends:

| | Start | End |
|---|---|---|
| Before | `#2B6BFF` — 4.52 | `#7B3FE4` — 5.72 |
| After | `#9a6cff` — 3.52 | `#c6afff` — **1.91** |

1.91:1 is below every threshold there is. The icon is white on pale lavender.

The pattern is not rare. Counting gradient backgrounds built from accent
tokens: 19 in `Web.jsx`, 40 in `App.jsx`, 1 in `Casino.jsx`, and more in the
three back-office screens.

The codebase already knows the right answer in places: the code button at
`Web.jsx:2324` puts `color:"#001"` on its lime gradient rather than white.

## Why the test did not catch it

`frontend/src/theme.test.js` checks every foreground value against the theme's
**surfaces** — `void`, `deep`, `dark`, `surface`, `card`, `inset`. It never
considered that `violet`, `cyan` and `green` are themselves used as
backgrounds, with hardcoded white on top. The specification I wrote said
"every foreground value reads against its own theme's surfaces", and that
sentence is exactly the size of the hole.

## Decision

Follow the prototype rather than invent. A bright accent as a background pairs
with dark ink — that is precisely what `--lime-ink` (`#172000`) encodes, and it
was applied to lime and not to violet.

So: an ink token for text and icons sitting on an accent, used at every such
site, and a test that fails when white is placed on an accent again.

Do not darken the accents. They are correct as the prototype defines them, and
`cyan` alone is read as a foreground 197 times and as a border 73 times;
changing its value to fix a background would break far more than it repairs.

## Scope

- An ink token in the theme, for both themes, with the reason recorded.
- Every accent-background site in `Web.jsx`, `App.jsx` and `Casino.jsx` takes
  it instead of white.
- The contrast test grows a second half: for every accent used as a background,
  the ink must read on it.

Out of scope, and following once the icon change merges: `Admin.jsx`,
`Agencia.jsx` and `Box.jsx`, which have the same pattern.

## Rollback

Revert the PR. The accents go back to carrying white, and the regression with
them.
