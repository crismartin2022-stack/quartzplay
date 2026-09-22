# The visual phase — closed 2026-09-21

Shipped to production in PR #144 (`staging` → `main`, 50 commits). This is the
record of what was decided and why, so the reasoning survives the diff.

## What went out

**The panels.** Sidebar grouped (agency 18 tabs → 5 sections, admin 11 → 4), a
full-screen hamburger menu below 1024px, a page header on all 29 tabs, clients
as cards with the detail in a modal in admin, long lists off their card and onto
the page background, and the cash desk rebuilt as compose-left / commit-right.

**The player home.** The hero photograph fused into the violet, three cards with
their own art, and a desktop layout that did not exist — until now it rendered
the phone layout stretched across a monitor.

**The API.** `/api/admin/serie` and `/api/agencias/me/serie`, the only backend
change in the whole run.

## The decisions worth keeping

**A signal used everywhere signals nothing.** The owner's report was "demasiado
borde... no hay jerarquía". Counting found the cause: 126 of 314 cards drew a
coloured `glow` border, 95 of them brand colours carrying no state, and `Btn`
drew a border on every button, so 57 outline buttons were each a coloured box.
A colour now means a state — wrong or waiting — and depth is read from the
surface. Guarded by `borderIsRare.test.js`.

**The surface ramp had lost a step.** The prototype has four (`--ink-950/-900/
-800/-700`); three came across, and `dark`, `surface` and `card` all held the
same colour. With no lighter surface and no elevation, the border was the only
way to say "this is a box" — 772 of them against the prototype's 18. `raised`
and `ELEVATION` restored the missing pieces.

**15px was the wrong size for a page title** because 15px is this codebase's
card-title size. A header set at 15 sat level with the card heading beneath it:
present on screen, absent as hierarchy. Page 20 / card 15 / description 13.

**Cards mean you can go in, rows mean it already happened.** That is what
separates an entity list from an event log, and it is written in a comment where
it is applied so the two do not get re-merged.

**No charting library.** The panels ship as one bundle with no code splitting, so
a library's 50-100 kB would be downloaded by every cashier who never opens a
screen with a chart. `LineaTiempo` is one SVG polyline. The real cost of a chart
here is the `GROUP BY` behind it.

**A chart must not pretend.** An all-zero series renders a sentence, not a flat
line on an axis. The history starts empty, so that is the common state for a
while.

**Images are sized for how they are displayed.** The four brand PNGs arrived at
5.9 MB — twenty times the JavaScript bundle. WebP at the size they actually
render: 116 kB, served from `public/`, zero bytes in the bundle.

## Defects the review turned up, none of them cosmetic

- `#fff` hardcoded on every filled button, unreadable on the lime `#b9ef32`
  where the button that moves money lives. `inkOn()` existed in the theme,
  unconnected.
- The client card's red glow was inverted: it glowed when the client was **not**
  blocked.
- The home's "En vivo" card already navigated to `casinovivo`; the label lied.
- A duplicated bet list read `f.apuestas.length` with no guard while every other
  reader used `?.` — a response missing that field took the whole sheet down.
- A second amount field bound to the same `monto` as the first, so the same
  number appeared twice and either copy could be edited.

## What was deliberately not done

`TabGlobal` and the `chat` tab have no page header: one opens on its KPI grid,
the other on three buttons that already name what a header would describe.

Agency's client sheet is a full view, not a modal — it holds the cash desk, the
stats, the actions and two lists. A modal is right for a short detail, not a
workspace. Admin's genuinely is a sheet and stayed one.

No tablet-specific layout. One breakpoint was enough and nothing was breaking in
that band; a second breakpoint without a problem to solve is debt.

## Open, and owner-owned

See `CLAUDE_HANDOFF.md`: the credential rotation gate, the GR8 outbound IPs, and
`docs/APOSTADO-NO-ES-UNO-SOLO.md`.
