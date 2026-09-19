# Proposal: Icons Instead Of Emoji

## Intent

The product uses emoji where it means icons. The brand prototype ships a real
icon set. This change brings that set in as a component, works out where every
emoji in the product should land, and proves it on one screen.

## Evidence

- Emoji are used as interface icons across the screens: roughly 514
  occurrences in `frontend/src/Admin.jsx`, 290 in `Agencia.jsx`, 143 in
  `App.jsx`, 78 in `Web.jsx`, 24 in `Box.jsx`, none in `Casino.jsx`. Over a
  thousand in total.
- They appear in two different roles, and only one of them is an icon: glued to
  a label (`"🏠 Inicio"`, `"⚡ APOSTAR"`) where they stand in for an icon, and
  inside a sentence of copy, where they are punctuation or tone.
- An emoji renders differently on every phone, every desktop and every
  platform version. The product cannot control its own interface while its
  icons are drawn by the operating system.
- The prototype ships a local SVG icon set: `html/assets/icons.js`, 36
  Lucide-style icons as bare path data, pinned with the prototype and with no
  network dependency. The first rule of the redesign brief was that emoji are
  not icons, and that this set is what replaces them.
- The visual foundation already landed: `frontend/src/theme.js` owns the
  palette and the typography, so an icon component has somewhere to take its
  colour and its sizing from.

## Scope

Over a thousand replacements is not one change. This one lays the track:

- An `Icon` component carrying the prototype's 36 icons, coloured from the
  theme, sized for touch, and accessible — an icon that carries meaning needs a
  name a screen reader can read, and a decorative one must be hidden from it.
- A written inventory: every distinct emoji in the product, what it is doing
  there, and which icon replaces it — or an explicit note that the set has no
  equivalent and one has to be drawn or the emoji kept as copy.
- The component applied to one screen end to end, as proof that the inventory
  is usable and the component fits the existing layouts.

Out of scope: the remaining screens, which follow the inventory one PR at a
time; the desktop shell with a sidebar; and the screen-by-screen redesign.

## Rollback

Revert the PR. The component is new and the one migrated screen goes back to
its emoji; nothing else depends on it.
