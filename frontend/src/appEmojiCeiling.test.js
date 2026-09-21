// Guard for the emoji-to-icon migration, player slice first
// (odd/tasks/player-emoji-to-icons.md, T1 the status messages, T2 the
// chrome) and site slice second (odd/tasks/site-emoji-to-icons.md, T1
// Web.jsx, T2 Box.jsx). Reads each screen as text — this project has no
// DOM renderer for them — the way messageStatusNotSniffed.test.js and
// testsStayInRepo.test.js already do.
//
// Neither migration removes every emoji: some are backend-supplied data
// (ScreenPrematch's sport icons), some sit in a row next to an emoji this
// repo's icon set has no equivalent for (the row rule — see
// docs/icon-inventory.md), some are message-string prefixes outside a T1's
// named scope (App.jsx: CrearDesafio/PanelIacoin only; Web.jsx:
// PerfilWeb/CrearDesafioWeb/PanelIacoinWeb only), and a few are copy, not
// an icon stand-in. The full list with reasons for each screen is in its
// task document's progress notes.
//
// This guard does not enumerate every leftover glyph the way
// screenHomeIconsAndAccents.test.js does for ScreenHome's six — these
// screens are far bigger — it instead pins a ceiling per screen, so a
// future edit cannot quietly reintroduce emoji a slice removed, without
// having to name every one left behind.
import fs from "fs";
import path from "path";

const APP = fs.readFileSync(path.resolve(__dirname, "App.jsx"), "utf8");
const WEB = fs.readFileSync(path.resolve(__dirname, "Web.jsx"), "utf8");
const BOX = fs.readFileSync(path.resolve(__dirname, "Box.jsx"), "utf8");
const AGENCIA = fs.readFileSync(path.resolve(__dirname, "Agencia.jsx"), "utf8");
const ADMIN = fs.readFileSync(path.resolve(__dirname, "Admin.jsx"), "utf8");

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

  // odd/tasks/finish-icon-migration.md's T1 retired the row rule and
  // migrated every remaining site but one: the ScreenPrematch sport-list
  // "Cargando..." fallback, whose icon is backend-supplied data
  // (`s.icon`/`d.sports[]`), not this file's own literal.
  test("total emoji uses do not rise above what this migration leaves behind", () => {
    expect(total).toBeLessThanOrEqual(1);
  });

  test("distinct emoji do not rise above what this migration leaves behind", () => {
    expect(counts.size).toBeLessThanOrEqual(1);
  });
});

describe("Web.jsx does not gain emoji back", () => {
  const counts = emojiCounts(WEB);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);

  // odd/tasks/finish-icon-migration.md's T1 retired the row rule: every
  // remaining emoji in this screen — including the dead, unreferenced
  // STEPS array — now has a drawn-icon equivalent. Web.jsx is emoji-free.
  test("total emoji uses do not rise above what this migration leaves behind", () => {
    expect(total).toBeLessThanOrEqual(0);
  });

  test("distinct emoji do not rise above what this migration leaves behind", () => {
    expect(counts.size).toBeLessThanOrEqual(0);
  });
});

describe("Box.jsx does not gain emoji back", () => {
  const counts = emojiCounts(BOX);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);

  // odd/tasks/finish-icon-migration.md's T1 retired the row rule and, with
  // Box.jsx having no canvas/share/print text to carve an exception for,
  // migrated the screen to zero.
  test("total emoji uses do not rise above what this migration leaves behind", () => {
    expect(total).toBeLessThanOrEqual(0);
  });

  test("distinct emoji do not rise above what this migration leaves behind", () => {
    expect(counts.size).toBeLessThanOrEqual(0);
  });
});

describe("Agencia.jsx does not gain emoji back", () => {
  const counts = emojiCounts(AGENCIA);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);

  // The exact count the agency slice (T1 + T2) leaves behind, measured
  // directly from source (docs/icon-inventory.md's 281/73 for this screen
  // was taken at an earlier revision and no longer matches; this guard
  // trusts a fresh scan over that document's summary numbers).
  test("total emoji uses do not rise above what this migration leaves behind", () => {
    expect(total).toBeLessThanOrEqual(157);
  });

  test("distinct emoji do not rise above what this migration leaves behind", () => {
    expect(counts.size).toBeLessThanOrEqual(56);
  });
});

describe("Admin.jsx does not gain emoji back", () => {
  const counts = emojiCounts(ADMIN);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);

  // The exact count the admin slice (T1 + T2 + T3) leaves behind, measured
  // directly from source (docs/icon-inventory.md's 503/90 for this screen
  // was taken at an earlier revision and no longer matches; this guard
  // trusts a fresh scan over that document's summary numbers). This is
  // the last screen: with it fixed, every screen in the product has been
  // through the migration.
  test("total emoji uses do not rise above what this migration leaves behind", () => {
    expect(total).toBeLessThanOrEqual(299);
  });

  test("distinct emoji do not rise above what this migration leaves behind", () => {
    expect(counts.size).toBeLessThanOrEqual(70);
  });
});
