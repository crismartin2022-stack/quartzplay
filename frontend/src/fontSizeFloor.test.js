import fs from "fs";
import path from "path";

// ── The floor: no fontSize below 12px on any of the six screens ────────
//
// This is a mechanical floor, not a readability pass. It only proves that
// no `fontSize:` declaration below 12 survives; it says nothing about
// whether 12 is the right size for any given piece of text — that is a
// later, per-screen pass with judgment (see odd/tasks/type-scale-floor.md).
//
// The matcher only sees a literal numeric `fontSize:` property value
// (`fontSize:11`, `fontSize:9.5`), so it correctly skips the handful of
// dynamic `fontSize` sites in these files (`fontSize:fs`, `fontSize:fs+2`,
// `fontSize:size*0.42`, `fontSize:compacto?26:32`,
// `fontSize:critico?13:12`, `fontSize:"clamp(...)"`) — none of those is a
// fixed value the measurement counted, and none is touched by this pass.
const SRC = path.resolve(__dirname);
const SCREENS = [
  "App.jsx", "Web.jsx", "Box.jsx", "Casino.jsx", "Agencia.jsx", "Admin.jsx",
];

// Captures the numeric value only when it is the whole property value —
// i.e. immediately followed by the `,` or `}` that ends it. This is what
// keeps `fontSize:compacto?26:32` (next char after `26` is `:`, not `,`/`}`)
// and `fontSize:fs+2` (next char after `fontSize:` is `f`, not a digit)
// from ever being captured.
const FONT_SIZE_LITERAL = /fontSize\s*:\s*(\d+(?:\.\d+)?)\s*[,}]/g;

function literalFontSizes(source) {
  const values = [];
  let match = FONT_SIZE_LITERAL.exec(source);
  while (match) {
    values.push(Number(match[1]));
    match = FONT_SIZE_LITERAL.exec(source);
  }
  FONT_SIZE_LITERAL.lastIndex = 0;
  return values;
}

const sources = Object.fromEntries(
  SCREENS.map((name) => [name, fs.readFileSync(path.join(SRC, name), "utf8")])
);

describe("the matcher can see font sizes at all", () => {
  // A positive control: a matcher that finds nothing passes the "no size
  // below 12" assertion for a reason that proves nothing. Each screen is
  // known (measured) to declare well over a thousand fixed fontSize
  // values combined, so this asserts the matcher is actually reading them.
  test.each(SCREENS)("%s has literal fontSize declarations to check", (name) => {
    expect(literalFontSizes(sources[name]).length).toBeGreaterThan(0);
  });
});

describe("no fontSize below 12 survives", () => {
  test.each(SCREENS)("%s declares no fontSize under 12", (name) => {
    const offenders = literalFontSizes(sources[name]).filter((value) => value < 12);
    expect(offenders).toEqual([]);
  });
});
