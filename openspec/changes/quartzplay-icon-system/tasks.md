# Tasks: Icons Instead Of Emoji

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 300–400, plus the inventory document |
| 400-line budget risk | Medium |
| Chained PRs recommended | No, for this one |
| Suggested split | This PR lays the track; one PR per screen follows |
| Delivery strategy | auto-chain |
| Chain strategy | stacked |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked
400-line budget risk: Medium

## Phase 1: RED

- [x] 1.1 Tests that the component draws a known icon, draws nothing for an
      unknown name, and takes its colour and size from the caller.
- [x] 1.2 Tests for the accessible behaviour: a named icon is announced, a
      decorative one is hidden.
- [x] 1.3 Test that the component carries every icon the prototype ships, by
      reading the prototype's own set rather than a hand-typed list.

## Phase 2: GREEN

- [x] 2.1 Write `frontend/src/Icon.jsx` with the prototype's icons.
- [x] 2.2 Run the frontend suite green.

## Phase 3: The inventory

- [x] 3.1 List every distinct emoji in `frontend/src`, with its occurrence
      count and the files it appears in.
- [x] 3.2 For each, record its role — icon or copy — and the icon that replaces
      it, or that the set has no equivalent.
- [x] 3.3 Write it to `docs/icon-inventory.md`, ordered so the screens can be
      migrated one at a time.

## Phase 4: Proof on one screen

- [x] 4.1 Migrate `Box.jsx`, the smallest surface, end to end.
- [x] 4.2 Test that no emoji remains in that file where an icon belongs.

## Phase 5: Delivery

- [ ] 5.1 Open the PR into `staging`.
- [ ] 5.2 Look at the migrated screen in staging, in both themes, on a phone.

## The screens that follow, in order

`Web.jsx` and `App.jsx` after the scanner change in flight merges, then
`Agencia.jsx`, then `Admin.jsx`, which is the largest.
