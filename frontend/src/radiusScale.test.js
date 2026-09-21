import fs from "fs";
import path from "path";
import { RADII } from "./theme";

// ── The scale: every corner radius resolves to one of RADII's four steps ──
//
// This mirrors the type-floor guard (fontSizeFloor.test.js): a mechanical
// check, not a design review. It only proves that every numeric
// `borderRadius:` declaration on the six screens resolves to one of the
// four named steps (`RADII.sm/md/lg/xl`) — it says nothing about whether a
// given corner should be sm or lg, which is the judgment call made once, in
// the mapping table in odd/tasks/radius-scale.md.
//
// This slice's fix consumes `RADII` everywhere: every site that used to
// read `borderRadius:8` now reads `borderRadius:RADII.md`, so a matcher
// that only looked for bare digits would find nothing and the "no radius
// off the scale" assertion below would pass for a reason that proves
// nothing. The matcher therefore recognises both shapes — a bare literal
// (a future regression, or a screen not yet touched) and a `RADII.<step>`
// reference (what these six screens now write) — and resolves both to a
// pixel value before checking it against the scale.
//
// `RADII.full` (9999, the pill/circle value) is deliberately excluded from
// the allowed set: nothing in the mapping puts a corner there, so its
// presence here would silently widen what counts as "on the scale". A
// reference to an unknown `RADII` key resolves to `undefined`, which is
// also not in the allowed set, so a typo'd token fails loudly rather than
// being silently ignored.
//
// The matcher only sees a `borderRadius:` property value immediately
// followed by the `,` or `}` that ends it, so it correctly skips the other
// shape `borderRadius` takes on these screens, which is not on the scale by
// measurement: `borderRadius:"50%"` and the panel-corner shorthand strings
// (`borderRadius:"20px 20px 0 0"`) — circles/pills (see radius-scale.md's
// "39 string values").
const SRC = path.resolve(__dirname);
const SCREENS = [
  "App.jsx", "Web.jsx", "Box.jsx", "Casino.jsx", "Agencia.jsx", "Admin.jsx",
];

const BORDER_RADIUS_LITERAL = /borderRadius\s*:\s*(\d+(?:\.\d+)?)\s*[,}]/g;
const BORDER_RADIUS_TOKEN = /borderRadius\s*:\s*RADII\.(\w+)\s*[,}]/g;

function borderRadii(source) {
  const values = [];
  BORDER_RADIUS_LITERAL.lastIndex = 0;
  let match = BORDER_RADIUS_LITERAL.exec(source);
  while (match) {
    values.push(Number(match[1]));
    match = BORDER_RADIUS_LITERAL.exec(source);
  }
  BORDER_RADIUS_TOKEN.lastIndex = 0;
  match = BORDER_RADIUS_TOKEN.exec(source);
  while (match) {
    values.push(RADII[match[1]]);
    match = BORDER_RADIUS_TOKEN.exec(source);
  }
  return values;
}

const sources = Object.fromEntries(
  SCREENS.map((name) => [name, fs.readFileSync(path.join(SRC, name), "utf8")])
);

const STEPS = [RADII.sm, RADII.md, RADII.lg, RADII.xl];

describe("the matcher can see border radii at all", () => {
  // A positive control: a matcher that finds nothing passes "every radius
  // is a step" for a reason that proves nothing. Each screen is measured
  // (odd/tasks/radius-scale.md) to declare dozens to hundreds of
  // borderRadius values, so this asserts the matcher is actually reading
  // them, not silently matching zero lines.
  test.each(SCREENS)("%s has borderRadius declarations to check", (name) => {
    expect(borderRadii(sources[name]).length).toBeGreaterThan(0);
  });
});

describe("every border radius is one of the four steps", () => {
  test.each(SCREENS)("%s declares no borderRadius off the scale", (name) => {
    const offenders = borderRadii(sources[name]).filter((value) => !STEPS.includes(value));
    expect(offenders).toEqual([]);
  });
});
