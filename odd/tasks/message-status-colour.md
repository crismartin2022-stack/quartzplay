# A success and an error must not look the same

## The defect

78 message displays across the product. 33 use the `{text, ok}` contract from
PRs #106–#108: the status travels beside the text and the colour reflects it.

**32 do not.** They render a message that carries both successes and errors in
a **fixed colour** — mostly `Q.muted`, a neutral grey. A player who joins a
challenge and a player whose request failed read the same grey line, in the
same place, and the only thing that differs is an emoji in the text.

Six of those 32 are on the player's screens:

- `App.jsx`: `JuegoResponsable`, `MuroDesafios`, `MisDesafios`
- `Web.jsx`: `JuegoResponsableWeb`, `MuroDesafiosWeb`, `MisDesafiosWeb`

The rest are in `Agencia.jsx` and `Admin.jsx`.

## Why it is being fixed now rather than later

The owner asked for it directly on 2026-09-21, on seeing it described as a
known inconsistency left for another day: *"no quiero arrastrar temas viejos,
quiero esto saneado."*

It also blocks the rest of the icon migration honestly. Those components keep
their `✅`/`⚠️` prefixes **because the emoji is currently the only status
signal there** — removing it would delete information. Once the colour carries
the status, the prefix becomes decoration and can leave, like everywhere else.

## What is NOT the defect

Nine displays render in a fixed `Q.red` and were checked one by one: every
`setMsg` reachable in those components sets an error only — "Poné un monto",
"No te alcanza el saldo", "El CUIT debe tener 11 dígitos". They are dedicated
error slots and red is correct. **Leave them alone.**

Three more carry only errors under a neutral colour; they are out of scope for
the same reason.

## The change

The same shape already shipped four times, in PRs #106, #107 and #108:

- state becomes `useState(null)` holding `{text, ok} | null`, with the comment
  `// {text, ok} | null — status lives here, not in the text`
- `setMsg("")` becomes `setMsg(null)`
- a success becomes `setMsg({text:"…", ok:true})`, an error `ok:false`
- the render becomes `color: msg.ok ? Q.green : Q.red` and `{msg.text}`, with
  `<Icon name={msg.ok?"circle-check":"triangle-alert"} size={13}/>` beside it
- the `✅`/`⚠️` prefixes leave the message strings, since the colour and the
  icon now carry what they were carrying

`App.jsx`, `Web.jsx`, `Agencia.jsx` and `Admin.jsx` all have worked examples
of every one of those steps already in place. Match them.

## What the player and the agency get

A success reads green with a check; a failure reads red with a warning. The
distinction also stops depending on colour alone, which matters for a
colourblind reader — today, for these 32, it depends on an emoji they may not
be able to tell apart from another emoji either.

## Scope

Authorized: `frontend/src/App.jsx`, `Web.jsx`, `Agencia.jsx`, `Admin.jsx`, and
test files.

Out of scope: the nine error-only red displays, the three error-only neutral
ones, and any message whose component sets only one kind of outcome.

## Constraints

- Do not change copy beyond removing the `✅`/`⚠️` prefix.
- Do not reshape the `{text, ok}` contract; `messageStatusNotSniffed.test.js`
  fails if it moves.
- A component that sets only errors keeps its fixed colour. Decide per
  component by reading every `setMsg` it can reach, not by the name of the
  variable.

## Checks

- TDD: strict. Runner: `CI=true npx react-scripts test --watchAll=false` from
  `app/frontend`. Baseline first.
- A guard test that fails if a message display carrying both outcomes renders
  in a fixed colour, with a positive control.
- ESLint on each touched file with the project's `no-undef`-only ruleset.
- A production build.

## Tasks

- [ ] **T1** The player: `App.jsx` and `Web.jsx`, three components each.
- [ ] **T2** `Agencia.jsx`.
- [ ] **T3** `Admin.jsx`.

## Delivery

One commit per task on `fix/quartzplay-message-status-colour`, off `staging`.
Assess after each; hand back the returned command when review is due.

## Progress

Not started.

## Next step

T1.
