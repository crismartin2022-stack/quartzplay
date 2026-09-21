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

// ── The one exception, named rather than hidden ────────────────────────
//
// `BarraWeb` is the public site's bottom tab bar: six labels plus Bet
// Best, all competing for one phone's width. Its labels sit at 11px.
//
// That is below the floor above, deliberately and only here. A tab-bar
// label is not body text: it is two words, always in the same position,
// under an icon that already carries the meaning, and the reader has seen
// it every session. Platform tab bars set theirs lower still. Everywhere
// else on these six screens the 12px floor stands unchanged.
//
// It is carved out instead of lowering the floor, and it keeps a floor of
// its own, so the exception cannot quietly spread.
//
// The cut runs from `function BarraWeb(` to the next top-level `function`,
// so anything written between the two would be exempted with it. Today
// that gap is blank. Put new code somewhere else, or move the bar.
// Both bottom bars, named by the file they live in. `BarraWeb` is the
// public site's; `BarraInferior` is the player app's. They are the same
// kind of control and carry the same exception.
const BOTTOM_BARS = {
  "Web.jsx": "function BarraWeb(",
  "App.jsx": "function BarraInferior(",
};

function splitOutBottomBar(source, marker) {
  const start = source.indexOf(marker);
  if (start === -1) return { rest: source, bottomBar: "" };
  const end = source.indexOf("\nfunction ", start + 1);
  const stop = end === -1 ? source.length : end;
  return { rest: source.slice(0, start) + source.slice(stop), bottomBar: source.slice(start, stop) };
}

const bottomBars = {};
for (const [name, marker] of Object.entries(BOTTOM_BARS)) {
  const split = splitOutBottomBar(sources[name], marker);
  bottomBars[name] = split.bottomBar;
  sources[name] = split.rest;
}

describe("each bottom tab bar keeps a floor of its own", () => {
  test.each(Object.entries(BOTTOM_BARS))("%s's bar was actually found and read", (name, marker) => {
    // Without this, a renamed component would silently exempt nothing —
    // or, worse, exempt the whole file by matching nothing and leaving
    // `rest` untouched while the assertion below passes on an empty string.
    expect(bottomBars[name]).toContain(marker);
    expect(literalFontSizes(bottomBars[name]).length).toBeGreaterThan(0);
  });

  test.each(Object.keys(BOTTOM_BARS))("%s's bar declares no fontSize under 11", (name) => {
    const offenders = literalFontSizes(bottomBars[name]).filter((value) => value < 11);
    expect(offenders).toEqual([]);
  });

  test.each(Object.keys(BOTTOM_BARS))("the exception does not leak: the rest of %s still holds 12", (name) => {
    const offenders = literalFontSizes(sources[name]).filter((value) => value < 12);
    expect(offenders).toEqual([]);
  });
});

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

// A font size does not have to be written as `fontSize: N` to render below
// the floor. Three button components compute theirs from a size prop
// (`const fs = size==="lg"?16:size==="sm"?11:13`), so the literal never
// appears beside the property name and the matcher above cannot see it.
// They rendered 10px and 11px text until this slice. Pinned separately
// rather than by widening the matcher, because the shape is different and a
// widened pattern would start reading unrelated numbers.
const SIZE_VARIABLE = /const\s+fs\s*=\s*([^;]+);/g;

describe("a size computed from a prop also respects the floor", () => {
  test("the matcher finds the computed-size declarations", () => {
    // Positive control for this shape specifically.
    const found = SCREENS.flatMap((name) => [...sources[name].matchAll(SIZE_VARIABLE)]);
    expect(found.length).toBeGreaterThan(0);
  });

  test.each(SCREENS)("%s computes no font size under 12", (name) => {
    const offenders = [];
    for (const [, expression] of sources[name].matchAll(SIZE_VARIABLE)) {
      for (const [, value] of expression.matchAll(/\b([0-9]+(?:\.[0-9]+)?)\b/g)) {
        if (Number(value) < 12) offenders.push(`${expression.trim()} -> ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
