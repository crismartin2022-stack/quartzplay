import fs from "fs";
import path from "path";
import { SPACING } from "./theme";

// ── The scale: every spacing number resolves to a SPACING step, or 0 ──
//
// This mirrors the radius guard (radiusScale.test.js): a mechanical check,
// not a design review. It proves that every numeric value in a `padding`,
// `paddingTop`, `paddingBottom`, `paddingLeft`, `paddingRight` or `gap`
// declaration on the six screens is one of the eight SPACING steps (or the
// real value `0`) — both a bare/`SPACING[n]` declaration and every number
// found inside a two-to-four-value string like `"12px 16px"`. It says
// nothing about which step a given gap *should* be; that judgment call was
// made once, in the mapping table in odd/tasks/spacing-scale.md.
//
// T1 (plain numbers) converts every non-zero literal to `SPACING[<step>]`,
// so — exactly like the radius guard — a matcher that only looked for a
// bare digit would find nothing on a touched screen and "no value off the
// scale" would pass for a reason that proves nothing. The matcher
// therefore recognises both shapes (a bare literal, for an unconverted or
// regressed site, and a `SPACING[<step>]` reference) and resolves both to
// a pixel value before checking it against the scale.
//
// A string keeps its own shape by design (T2 does not — and cannot cleanly
// — reference SPACING from inside a string), so string values are checked
// by extracting every `<number>px` token and the bare shorthand `0`.
//
// Three shapes of string are explicitly out of scope and are not asked
// about here, exactly as the radius guard excludes `"50%"`:
//   - `calc(...)`/`env(...)` strings (safe-area insets on fixed panels):
//     a number inside `calc()` can be paired with a sibling value outside
//     it (e.g. `"18px 16px calc(18px + env(safe-area-inset-bottom))"`,
//     where the top padding and the calc's own addend are the same number
//     on purpose); rewriting one without the other would silently break
//     that pairing, so these strings are left untouched in this slice.
//   - `%` strings (`paddingTop:"100%"`): the classic aspect-ratio-box
//     hack. It is a percentage of the element's own width, not a spacing
//     rhythm value, and rounding it to a SPACING step would break the
//     hack outright.
// A string containing any of `calc(`, `env(` or `%` is skipped entirely.
//
// Two further documented exceptions, both left unchanged and allow-listed
// here by exact site so a *different* off-scale value cannot hide behind
// them:
//   - `App.jsx`'s `paddingRight:166` is a reserved-width value for the
//     mascot header illustration, copied verbatim from a specific
//     prototype selector (see the comment above it in App.jsx and
//     odd/tasks/spacing-scale.md) — not a rhythm gap between elements.
//     Forcing it onto the grid's 40px ceiling would visibly cut the
//     image's reserved space and very likely make the mascot overlap the
//     panel's title/button, which is exactly the failure the surrounding
//     comment says that number exists to prevent.
//   - `App.jsx`'s `BarraSuperior` padding, `"5px 13px 5px"`, is pinned by
//     topBarLogoSize.test.js to a value measured with headless Chromium
//     (real layout) so the top bar stays exactly 51px tall now that its
//     logo draws at 40px instead of 20px. Rounding 5 to the nearest step
//     (4) would shave 2px off that measured height and undo the specific
//     fix that test guards — a case of a spacing number already chosen
//     for a reason, not picked at random, the same shape of exception as
//     the reserved paddingRight above.
const SRC = path.resolve(__dirname);
const SCREENS = [
  "App.jsx", "Web.jsx", "Box.jsx", "Casino.jsx", "Agencia.jsx", "Admin.jsx",
];
const PROPS = ["padding", "paddingTop", "paddingBottom", "paddingLeft", "paddingRight", "gap"];
const PROP_ALT = PROPS.join("|");

const STEPS = Object.values(SPACING); // [4,8,12,16,20,24,32,40]

const PLAIN_NUMBER = new RegExp(`\\b(?:${PROP_ALT})\\s*:\\s*(\\d+(?:\\.\\d+)?)\\s*[,}]`, "g");
const SPACING_TOKEN = new RegExp(`\\b(?:${PROP_ALT})\\s*:\\s*SPACING\\[(\\d+)\\]\\s*[,}]`, "g");
const STRING_VALUE = new RegExp(`\\b(?:${PROP_ALT})\\s*:\\s*"([^"]*)"`, "g");

// The documented plain-number exception, by exact screen+prop+value —
// see the comment above.
const ALLOWED_EXCEPTIONS = new Set(["App.jsx|paddingRight|166"]);

// The documented string exception, by exact inner text — see the comment
// above.
const ALLOWED_STRING_EXCEPTIONS = new Set(["5px 13px 5px"]);

function plainNumbers(source, screen) {
  const values = [];
  PLAIN_NUMBER.lastIndex = 0;
  let match = PLAIN_NUMBER.exec(source);
  while (match) {
    const prop = match[0].split(":")[0].trim();
    if (!ALLOWED_EXCEPTIONS.has(`${screen}|${prop}|${match[1]}`)) {
      values.push(Number(match[1]));
    }
    match = PLAIN_NUMBER.exec(source);
  }
  SPACING_TOKEN.lastIndex = 0;
  match = SPACING_TOKEN.exec(source);
  while (match) {
    values.push(SPACING[match[1]]);
    match = SPACING_TOKEN.exec(source);
  }
  return values;
}

function stringNumbers(source) {
  const values = [];
  STRING_VALUE.lastIndex = 0;
  let match = STRING_VALUE.exec(source);
  while (match) {
    const inner = match[1];
    if (!/calc\(|env\(|%/.test(inner) && !ALLOWED_STRING_EXCEPTIONS.has(inner)) {
      const nums = inner.match(/\d+(?:\.\d+)?(?=px)/g) || [];
      for (const n of nums) values.push(Number(n));
    }
    match = STRING_VALUE.exec(source);
  }
  return values;
}

const sources = Object.fromEntries(
  SCREENS.map((name) => [name, fs.readFileSync(path.join(SRC, name), "utf8")])
);

describe("the matcher can see spacing declarations at all", () => {
  test.each(SCREENS)("%s has plain-number/SPACING[] spacing declarations to check", (name) => {
    expect(plainNumbers(sources[name], name).length).toBeGreaterThan(0);
  });

  test.each(SCREENS)("%s has string spacing declarations with numbers to check", (name) => {
    expect(stringNumbers(sources[name]).length).toBeGreaterThan(0);
  });
});

describe("every plain-number spacing value is a SPACING step, or 0", () => {
  test.each(SCREENS)("%s declares no bare/SPACING[] spacing value off the scale", (name) => {
    const offenders = plainNumbers(sources[name], name)
      .filter((value) => value !== 0 && !STEPS.includes(value));
    expect(offenders).toEqual([]);
  });
});

describe("every number inside a spacing string is a SPACING step, or 0", () => {
  test.each(SCREENS)("%s declares no in-string spacing number off the scale (calc/env/% strings excluded)", (name) => {
    const offenders = stringNumbers(sources[name])
      .filter((value) => value !== 0 && !STEPS.includes(value));
    expect(offenders).toEqual([]);
  });
});
