# Drawn icons for the player, starting with the message contract

## Objective

The player's screens stop drawing meaning with emoji, which every operating
system renders differently and which carry none of the brand's colours.
This first step removes the obstacle that would make the swap dangerous.

## The obstacle

In 35 places across the product, an emoji is not decoration — it is the data.
The pattern:

```jsx
<div style={{color: msg.startsWith("✅") ? Q.green : Q.red, ...}}>{msg}</div>
```

The code decides a message's colour by reading the first character of the
string. Anything not starting with `✅` renders red.

This is not broken today. Every message that reaches those components either
carries the `✅` prefix on success or is a validation error, for which red is
correct. It works by coincidence of convention, not by design, and nothing
tests it.

It becomes broken the moment the migration replaces the glyph with an icon:
**every message in those components turns red**, including successful
payments and accepted bets. In `Agencia.jsx` and `Admin.jsx` — 30 of the 35
sites — that means an agency is told a successful transaction failed.

So the status has to stop living in the text before any glyph moves.

## Scope

Authorized: `frontend/src/App.jsx` and a test file.

`App.jsx` is the Telegram mini-app: the player, and the most-looked-at screen
in the product. Two of its components sniff the prefix — `CrearDesafio`
(line 4538) and `PanelIacoin` (line 4884).

Out of scope, each its own slice: `Web.jsx` (3 sites), `Agencia.jsx` (13),
`Admin.jsx` (17), and the emoji-to-icon replacement itself. This change moves
no glyph.

## Constraints

- **Nothing visible changes.** The same messages, with the same text including
  their emoji prefix, in the same colours. This is a change of where the
  status comes from, not of what the player reads.
- Do not introduce a state library, a context, or a shared module for this.
  The two components hold their message in local state; the fix belongs there.
- Do not touch the components that do not sniff.
- Leave the emoji in the message text alone. Removing them is the next slice,
  and it is only safe once this one has landed.

## Checks

- TDD: strict. Runner: `CI=true npx react-scripts test --watchAll=false` from
  `app/frontend`. Record the baseline first.
- A test that fails on the sniffing pattern, so it cannot return.
- `npx eslint App.jsx --no-eslintrc --env browser,es2021 --parser-options ecmaVersion:2021,sourceType:module,ecmaFeatures:{jsx:true} --rule '{"no-undef":"error"}'`
- A production build with the staging-shaped placeholder values.

## Acceptance

No component in `App.jsx` decides a colour by reading a message's first
character. The player sees exactly what they saw before.

## Tasks

- [ ] **T1** Give the two components' messages their own status, and guard the
      pattern against returning.

## Delivery

One work-unit commit on `fix/quartzplay-message-status`, off `staging`. After
the commit, run `gentle-ai review assess --cwd . --agent claude-code
--base-ref staging --committed-only --json` and report the outcome. If review
is due, hand the returned command back verbatim rather than running it.

## Progress

Not started.

## Next step

T1.
