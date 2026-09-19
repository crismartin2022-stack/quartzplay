import fs from "fs";
import path from "path";
import * as themeModule from "./theme";
import {
  oscuro, F_NUM, F_BODY, inkOn, INK_DARK, INK_LIGHT,
} from "./theme";

const SRC = path.resolve(__dirname);

// ── Expected values, copied from the proposal's table ──────────────────
// (openspec/changes/quartzplay-visual-foundation/proposal.md), the dark
// column — the only one the product ships now. The light column, and the
// keys that existed only to answer it (an ink, a hardcoded `goldBg`
// duplicate), are gone with the light theme. `glass` and Casino's roulette
// colours `pano`/`verde`/`rojo`/`negro` are derived/carried-over values
// documented in theme.js itself; they are still pinned here so a future
// edit cannot silently change them without updating this test.
const MAPPING = {
  void: "#060a14", deep: "#0b1120",
  dark: "#111a2e", surface: "#111a2e",
  card: "#111a2e", inset: "#060a14",
  glass: "linear-gradient(160deg,rgba(154,108,255,0.06),rgba(198,175,255,0.03))",
  border: "#263550", text: "#f5f7fb",
  muted: "#9aa8c2", dim: "#63718a",
  green: "#b9ef32", gold: "#b9ef32",
  goldBg: "#b9ef32", violet: "#9a6cff",
  violet2: "#c6afff", cyan: "#c6afff",
  teal: "#c6afff", blue: "#9a6cff",
  amber: "#ffab9d", red: "#ff7c8d",
  pink: "#ff7c8d", pano: "#0B5137",
  verde: "#0E7A46", rojo: "#C4162A",
  negro: "#12182B",
};

describe("theme module — one source of colour", () => {
  test("the theme carries exactly the mapped value for every key", () => {
    expect(oscuro).toEqual(MAPPING);
  });

  test("the module exports one palette — the light theme is gone", () => {
    expect(themeModule.claro).toBeUndefined();
    expect(themeModule.THEMES).toBeUndefined();
    expect(Object.keys(themeModule).sort()).toEqual(
      ["F_BODY", "F_NUM", "INK_DARK", "INK_LIGHT", "inkOn", "oscuro"].sort()
    );
  });
});

// ── Contrast ─────────────────────────────────────────────────────────
// WCAG relative-luminance contrast ratio, computed locally instead of
// pulling in a dependency: https://www.w3.org/TR/WCAG21/#contrast-minimum
function channel(value) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a, b) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// Threshold: 3.0:1, WCAG 2.1's minimum for large-scale text and UI
// components (SC 1.4.11 / the large-text branch of 1.4.3). This screen
// set is numeric- and label-heavy (odds, amounts, short captions) rather
// than small paragraph copy, so the large-text/component floor is the
// defensible bar rather than the stricter 4.5:1 small-text minimum.
const CONTRAST_THRESHOLD = 3.0;

// `dim` is the lowest-emphasis tier (tiny captions, separators,
// disabled-looking hints). The product's current light theme puts it at
// ~2.66:1, under the bar; the brand's light value was darkened until it
// clears the same floor as everything else, so it gets no exemption.
const DIM_THRESHOLD = CONTRAST_THRESHOLD;

const SURFACE_KEYS = ["void", "deep", "dark", "surface", "card", "inset"];
const FOREGROUND_KEYS = [
  "text", "muted", "green", "gold", "violet", "violet2",
  "cyan", "teal", "blue", "amber", "red", "pink",
];

// ── Accents used as backgrounds ───────────────────────────────────────
// Checking foregrounds against surfaces is only half the question. The
// brand's accents are themselves the background of chips, pills, badges
// and filled buttons, with a label and icons drawn on top of them, and
// the ink is what goes on top.
//
// The list is derived rather than written out: an accent is any theme key
// that is not a surface, not a text tier, not the glass overlay and not
// one of Casino's roulette felt/pocket colours (which describe a physical
// table, not a brand accent). So an accent added to the theme is covered
// here without this file being edited.
const NON_ACCENT_KEYS = [
  ...SURFACE_KEYS,
  "glass", "border", "text", "muted", "dim",
  "pano", "verde", "rojo", "negro",
];
const ACCENT_KEYS = Object.keys(oscuro).filter(
  (key) => !NON_ACCENT_KEYS.includes(key)
);

describe("no screen declares its own palette", () => {
  const PALETTE_DECLARATION = /\bconst\s+(Q|TEMAS)\s*=\s*\{/;

  const sourceFiles = fs
    .readdirSync(SRC)
    .filter((name) => /\.(js|jsx)$/.test(name))
    .filter((name) => !name.includes(".test."))
    .filter((name) => name !== "theme.js");

  test("no source file under frontend/src redeclares Q or TEMAS", () => {
    const offenders = sourceFiles.filter((name) =>
      PALETTE_DECLARATION.test(fs.readFileSync(path.join(SRC, name), "utf8"))
    );
    expect(offenders).toEqual([]);
  });
});


describe("the theme is readable", () => {
  test.each(FOREGROUND_KEYS)("%s reads against every surface", (key) => {
    SURFACE_KEYS.forEach((surfaceKey) => {
      const ratio = contrastRatio(oscuro[key], oscuro[surfaceKey]);
      expect(ratio).toBeGreaterThanOrEqual(CONTRAST_THRESHOLD);
    });
  });

  test("dim reads against every surface at its own floor", () => {
    SURFACE_KEYS.forEach((surfaceKey) => {
      const ratio = contrastRatio(oscuro.dim, oscuro[surfaceKey]);
      expect(ratio).toBeGreaterThanOrEqual(DIM_THRESHOLD);
    });
  });

  test.each(ACCENT_KEYS)("inkOn reads on %s as a background", (key) => {
    const ratio = contrastRatio(inkOn(oscuro[key]), oscuro[key]);
    expect(ratio).toBeGreaterThanOrEqual(CONTRAST_THRESHOLD);
  });

  test.each(ACCENT_KEYS)("inkOn takes the better of the two inks on %s", (key) => {
    // The ink belongs to the accent, not to the theme: `inkOn` measures
    // rather than being told. With one theme, every accent here is bright
    // enough that the dark ink always wins — but the comparison itself is
    // still real per accent, and the helper keeps both inks and this
    // comparison for the day a second, differently-toned surface exists.
    const chosen = inkOn(oscuro[key]);
    const other = chosen === INK_DARK ? INK_LIGHT : INK_DARK;
    expect(contrastRatio(chosen, oscuro[key]))
      .toBeGreaterThanOrEqual(contrastRatio(other, oscuro[key]));
  });

  test("inkOn answers for a gradient, on its worst end", () => {
    // A gradient has more than one background. The ink has to read on
    // all of them, so the helper takes every stop and the answer does
    // not depend on which end is named first.
    ACCENT_KEYS.forEach((start) => {
      ACCENT_KEYS.forEach((end) => {
        const ink = inkOn(oscuro[start], oscuro[end]);
        expect(ink).toBe(inkOn(oscuro[end], oscuro[start]));
        expect(contrastRatio(ink, oscuro[start])).toBeGreaterThanOrEqual(CONTRAST_THRESHOLD);
        expect(contrastRatio(ink, oscuro[end])).toBeGreaterThanOrEqual(CONTRAST_THRESHOLD);
      });
    });
  });

  test("the accent list is derived from the theme, not written out", () => {
    // If this list were literal, a new accent would be added to the theme
    // and silently skipped by the check above.
    expect(ACCENT_KEYS.length).toBeGreaterThan(0);
    expect(ACCENT_KEYS).toEqual(
      expect.arrayContaining(["violet", "violet2", "cyan", "green", "goldBg"])
    );
    SURFACE_KEYS.forEach((key) => expect(ACCENT_KEYS).not.toContain(key));
  });

  test("the two inks are a dark/light pair, and neither is a theme key", () => {
    expect(contrastRatio(INK_DARK, INK_LIGHT)).toBeGreaterThanOrEqual(CONTRAST_THRESHOLD);
    // Not part of the theme: which ink applies is decided by the accent
    // underneath, not by the palette.
    expect(Object.keys(oscuro)).not.toContain("ink");
  });

  test("inkOn falls back to the dark ink when it is handed nothing it can read", () => {
    // A render must not throw over a colour it cannot parse.
    expect(inkOn(undefined)).toBe(INK_DARK);
    expect(inkOn("transparent")).toBe(INK_DARK);
    expect(inkOn()).toBe(INK_DARK);
  });

  test("inkOn reads three-digit hex the same as six", () => {
    expect(inkOn("#fff")).toBe(inkOn("#ffffff"));
    expect(inkOn("#000")).toBe(inkOn("#000000"));
  });

  test("the brand's dark ink is what inkOn picks for goldBg", () => {
    // The prototype's "--lime-ink" (html/styles.css) is the dark ink the
    // brand pairs with its bright accent when it is used as a background.
    // That pairing is the one case the brand already decided, so it is
    // the one the helper must reproduce — and it must still clear the
    // stricter small-text bar on the accent it came from.
    expect(inkOn(oscuro.goldBg)).toBe(INK_DARK);
    expect(contrastRatio(oscuro.goldBg, INK_DARK)).toBeGreaterThanOrEqual(4.5);
  });
});

// ── White on an accent, read out of the screens themselves ───────────
// The contrast check above can only prove that the ink reads on an
// accent. It cannot prove the screens use it, and what shipped to
// production was white hardcoded on top of an accent gradient. So this
// reads the source the way scanGate.test.js does and names the file.
describe("no accent background picks its own ink", () => {
  // The screens this change covers. `Admin.jsx`, `Agencia.jsx` and
  // `Box.jsx` carry the same pattern and follow in their own change.
  const SCREENS = ["Web.jsx", "App.jsx", "Casino.jsx"];

  // An accent read opaquely — `${Q.violet}` or `Q.violet` — but not
  // `${Q.violet}22`, which is the accent at low alpha: a tint laid over a
  // dark surface, not an accent background, and white belongs on it.
  const OPAQUE_ACCENT = new RegExp(
    `\\bQ\\.(?:${ACCENT_KEYS.join("|")})\\b(?!\\}?[0-9a-fA-F])`
  );
  // Two ways of choosing by hand, both of them wrong. White is the
  // regression that shipped. A bare `Q.ink` is the fix that was only
  // half a fix: one ink written out is still somebody deciding, and the
  // light theme's accents want the other one.
  const CHOSEN_BY_HAND = /["'](?:#fff|#ffffff|white)["']|\bQ\.ink\b/i;
  const COLOUR_PROPERTY = /\b(color|stroke|fill)\s*:\s*([^,\n}]*)/g;

  // The value of a style property: everything up to the comma that ends
  // it, ignoring the commas inside a gradient or a template hole.
  function propertyValue(source, from) {
    let depth = 0;
    let value = "";
    for (let i = from; i < source.length; i += 1) {
      const c = source[i];
      if (c === "{" || c === "(" || c === "[") depth += 1;
      else if (c === "}" && depth === 0) break;
      else if (c === "}" || c === ")" || c === "]") {
        depth -= 1;
        if (depth < 0) break;
      } else if (c === "," && depth === 0) break;
      value += c;
    }
    return value;
  }

  // The style object a property sits in: the innermost braces around it.
  function enclosingObject(source, index) {
    let depth = 0;
    for (let i = index; i >= 0; i -= 1) {
      const c = source[i];
      if (c === "}") depth += 1;
      else if (c === "{") {
        if (depth === 0) {
          let open = 0;
          for (let j = i; j < source.length; j += 1) {
            if (source[j] === "{") open += 1;
            else if (source[j] === "}") {
              open -= 1;
              if (open === 0) return source.slice(i, j + 1);
            }
          }
          return source.slice(i);
        }
        depth -= 1;
      }
    }
    return "";
  }

  function accentBackgrounds(source) {
    const found = [];
    const backgrounds = /background(?:Color|Image)?\s*:/g;
    let match = backgrounds.exec(source);
    while (match) {
      const value = propertyValue(source, match.index + match[0].length);
      if (OPAQUE_ACCENT.test(value)) {
        found.push({ value, block: enclosingObject(source, match.index) });
      }
      match = backgrounds.exec(source);
    }
    return found;
  }

  // Every colour stop an accent background is actually built from: the
  // accent tokens it names, and the hardcoded partners some gradients
  // run into (`${Q.gold}` into `#c9a227`). An alpha suffix is skipped —
  // `${Q.violet}22` is a tint, not a stop.
  function colourStops(value, theme) {
    const stops = [];
    const token = new RegExp(
      `\\bQ\\.(${ACCENT_KEYS.join("|")})\\b(?!\\}?[0-9a-fA-F])`, "g"
    );
    let match = token.exec(value);
    while (match) {
      stops.push(theme[match[1]]);
      match = token.exec(value);
    }
    const literal = /(^|[\s,(])(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\b/g;
    match = literal.exec(value);
    while (match) {
      stops.push(match[2]);
      match = literal.exec(value);
    }
    return stops;
  }

  const sources = Object.fromEntries(
    SCREENS.map((name) => [name, fs.readFileSync(path.join(SRC, name), "utf8")])
  );

  test.each(SCREENS)("%s still has accent backgrounds to check", (name) => {
    // Without this, a regex that matched nothing would report a clean
    // screen instead of an unchecked one.
    expect(accentBackgrounds(sources[name]).length).toBeGreaterThan(0);
  });

  test.each(SCREENS)("%s never writes the ink on an accent by hand", (name) => {
    const offenders = [];
    accentBackgrounds(sources[name]).forEach(({ block }) => {
      const colours = new RegExp(COLOUR_PROPERTY.source, "g");
      let colour = colours.exec(block);
      while (colour) {
        if (CHOSEN_BY_HAND.test(colour[2])) offenders.push(colour[0].trim());
        colour = colours.exec(block);
      }
    });
    expect(offenders).toEqual([]);
  });

  test.each(SCREENS)("%s leaves no bare Q.ink anywhere", (name) => {
    // Not only at an accent background: the label inside the button and
    // the icon handed down as a prop are the sites a style scan cannot
    // see, and they are exactly where the first pass went wrong.
    expect(sources[name]).not.toMatch(/\bQ\.ink\b/);
  });

  test.each(SCREENS)("every accent background in %s has an ink that reads", (name) => {
    // This is the check that catches a gradient running from a dark
    // accent into a bright hardcoded partner, where one ink reads and
    // the other one does not.
    const failures = [];
    accentBackgrounds(sources[name]).forEach(({ value }) => {
      const stops = colourStops(value, oscuro);
      if (!stops.length) return;
      const ink = inkOn(...stops);
      stops.forEach((stop) => {
        const ratio = contrastRatio(ink, stop);
        if (ratio < CONTRAST_THRESHOLD) {
          failures.push(`${ratio.toFixed(2)} on ${stop} — ${value.trim()}`);
        }
      });
    });
    expect(failures).toEqual([]);
  });

  test("the sport tabs let the accent choose their icon's colour", () => {
    // The reported symptom: the active tab passed "#fff" to IconoDeporte
    // as a stroke, which no style-object scan would ever see.
    const calls = sources["Web.jsx"].match(/<IconoDeporte[\s\S]*?\/>/g) || [];
    expect(calls.length).toBeGreaterThan(0);
    calls.forEach((call) => {
      expect(call).not.toMatch(CHOSEN_BY_HAND);
    });
    expect(calls.join("")).toMatch(/inkOn\(/);
  });
});

describe("the accents themselves do not move", () => {
  // `cyan` alone is read as a foreground 197 times and as a border 73
  // times. Darkening an accent to make white readable on it would break
  // far more than it repairs, so the repair is the ink and the accent
  // values stay exactly where the brand put them.
  test.each(ACCENT_KEYS)("%s keeps its brand value", (key) => {
    expect(oscuro[key]).toBe(MAPPING[key]);
  });
});

describe("typography", () => {
  test("F_NUM names the brand typeface and keeps a system fallback", () => {
    expect(F_NUM).toMatch(/Poppins/);
    expect(F_NUM).toMatch(/system-ui|sans-serif/);
  });

  test("F_BODY names the brand typeface and keeps a system fallback", () => {
    expect(F_BODY).toMatch(/Poppins/);
    expect(F_BODY).toMatch(/system-ui|sans-serif/);
  });
});

describe("the brand typeface ships with the app", () => {
  const FONTS_DIR = path.join(SRC, "fonts");

  test.each(["poppins-400.ttf", "poppins-500.ttf", "poppins-600.ttf", "poppins-700.ttf"])(
    "%s exists in the app's own static files",
    (fileName) => {
      expect(fs.existsSync(path.join(FONTS_DIR, fileName))).toBe(true);
    }
  );

  test("the font licence ships alongside the font files", () => {
    expect(fs.existsSync(path.join(FONTS_DIR, "OFL.txt"))).toBe(true);
  });

  test("the faces are declared once, with font-display: swap", () => {
    const raw = fs.readFileSync(path.join(SRC, "fonts.css"), "utf8");
    // Strip CSS comments first, so a comment mentioning these terms in
    // prose cannot be miscounted as a declaration.
    const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");
    const faceCount = (css.match(/@font-face/g) || []).length;
    expect(faceCount).toBe(4);
    const swapCount = (css.match(/font-display:\s*swap/g) || []).length;
    expect(swapCount).toBe(4);
    ["400", "500", "600", "700"].forEach((weight) => {
      expect(css).toMatch(new RegExp(`font-weight:\\s*${weight}`));
    });
  });

  test("no third-party font is fetched at runtime", () => {
    const html = fs.readFileSync(
      path.join(SRC, "..", "public", "index.html"),
      "utf8"
    );
    expect(html).not.toMatch(/fonts\.googleapis\.com/);
    expect(html).not.toMatch(/fonts\.gstatic\.com/);
  });
});
