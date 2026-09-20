// Guard for the player emoji-to-icon migration (odd/tasks/player-emoji-to-icons.md,
// T1 the status messages, T2 the chrome). Reads App.jsx as text — this project
// has no DOM renderer for it — the way messageStatusNotSniffed.test.js and
// testsStayInRepo.test.js already do.
//
// The migration does not remove every emoji: some are backend-supplied data
// (ScreenPrematch's sport icons), some sit in a row next to an emoji this
// repo's icon set has no equivalent for (the row rule — see
// docs/icon-inventory.md), some are message-string prefixes outside T1's
// named scope (CrearDesafio, PanelIacoin only), and a few are copy, not an
// icon stand-in. The full list with reasons is in the task document's
// progress notes.
//
// This guard does not enumerate every leftover glyph the way
// screenHomeIconsAndAccents.test.js does for ScreenHome's six — App.jsx is
// far bigger — it instead pins a ceiling, so a future edit cannot quietly
// reintroduce emoji this slice removed, without having to name every one
// left behind.
import fs from "fs";
import path from "path";

const APP = fs.readFileSync(path.resolve(__dirname, "App.jsx"), "utf8");

// Same rule as screenHomeIconsAndAccents.test.js: an Extended_Pictographic
// character with its optional variation selector, skin tone or
// zero-width-joiner sequence, plus keycaps and flag pairs. Deliberately
// leaves alone typographic glyphs like ✓ ✕ × ↑ ♡ · ─, which this project's
// screens also use and are not emoji.
const EMOJI = /(?:\p{RI}\p{RI}|[0-9#*]️?⃣|\p{Extended_Pictographic}(?:️|[\u{1F3FB}-\u{1F3FF}])?(?:‍\p{Extended_Pictographic}(?:️|[\u{1F3FB}-\u{1F3FF}])?)*)/gu;

function emojiCounts(source) {
  const counts = new Map();
  for (const [match] of source.matchAll(EMOJI)) {
    counts.set(match, (counts.get(match) || 0) + 1);
  }
  return counts;
}

test("positive control: the counter can actually see an emoji", () => {
  // A counter that matches nothing would pass every assertion below and
  // prove nothing. This proves the pattern fires before it is trusted not
  // to fire on App.jsx's leftovers.
  const counts = emojiCounts("Status: ✅ done, ⚠️ warned, ⚠️ warned again");
  expect(counts.get("✅")).toBe(1);
  expect(counts.get("⚠️")).toBe(2);
  expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(3);
});

describe("App.jsx does not gain emoji back", () => {
  const counts = emojiCounts(APP);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);

  // The exact count this migration leaves behind, measured directly from
  // source after T1 and T2 (docs/icon-inventory.md's 137/51 for this
  // screen was taken at an earlier revision and no longer matches; this
  // guard trusts a fresh scan over that document's summary numbers).
  test("total emoji uses do not rise above what this migration leaves behind", () => {
    expect(total).toBeLessThanOrEqual(52);
  });

  test("distinct emoji do not rise above what this migration leaves behind", () => {
    expect(counts.size).toBeLessThanOrEqual(36);
  });
});
