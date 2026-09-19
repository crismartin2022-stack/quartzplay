import fs from "fs";
import path from "path";
import { oscuro, claro, THEMES, F_NUM, F_BODY } from "./theme";

const SRC = path.resolve(__dirname);

// ── Expected mapping, copied from the proposal's table ─────────────────
// (openspec/changes/quartzplay-visual-foundation/proposal.md), one row per
// key as [dark, light]. Keys not in that table (`glass`, and Casino's
// roulette colours `pano`/`verde`/`rojo`/`negro`) are derived/carried-over
// values documented in theme.js itself; they are still pinned here so a
// future edit cannot silently change them without updating this test.
const MAPPING = {
  void: ["#060a14", "#eef1f7"], deep: ["#0b1120", "#ffffff"],
  dark: ["#111a2e", "#ffffff"], surface: ["#111a2e", "#ffffff"],
  card: ["#111a2e", "#f6f8fc"], inset: ["#060a14", "#f1f4fa"],
  glass: [
    "linear-gradient(160deg,rgba(154,108,255,0.06),rgba(198,175,255,0.03))",
    "linear-gradient(160deg,rgba(107,63,212,0.05),rgba(138,95,240,0.02))",
  ],
  border: ["#263550", "#d9e0ee"], text: ["#f5f7fb", "#0b1120"],
  muted: ["#9aa8c2", "#5b6780"], dim: ["#63718a", "#7c879e"],
  green: ["#b9ef32", "#5b7a0f"], gold: ["#b9ef32", "#5b7a0f"],
  goldBg: ["#b9ef32", "#b9ef32"], violet: ["#9a6cff", "#6b3fd4"],
  violet2: ["#c6afff", "#8a5ff0"], cyan: ["#c6afff", "#8a5ff0"],
  teal: ["#c6afff", "#8a5ff0"], blue: ["#9a6cff", "#6b3fd4"],
  amber: ["#ffab9d", "#a8501f"], red: ["#ff7c8d", "#c2273f"],
  pink: ["#ff7c8d", "#c2273f"], pano: ["#0B5137", "#0B5137"],
  verde: ["#0E7A46", "#0E7A46"], rojo: ["#C4162A", "#C4162A"],
  negro: ["#12182B", "#12182B"],
};

const EXPECTED_DARK = Object.fromEntries(
  Object.entries(MAPPING).map(([key, [dark]]) => [key, dark])
);
const EXPECTED_LIGHT = Object.fromEntries(
  Object.entries(MAPPING).map(([key, [, light]]) => [key, light])
);

describe("theme module — one source of colour", () => {
  test("dark theme carries exactly the mapped value for every key", () => {
    expect(oscuro).toEqual(EXPECTED_DARK);
  });

  test("light theme carries exactly the mapped value for every key", () => {
    expect(claro).toEqual(EXPECTED_LIGHT);
  });

  test("neither theme is missing a key the other has", () => {
    expect(Object.keys(oscuro).sort()).toEqual(Object.keys(claro).sort());
  });

  test("THEMES exposes both themes under their existing names", () => {
    expect(THEMES.oscuro).toBe(oscuro);
    expect(THEMES.claro).toBe(claro);
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


describe("both themes are readable", () => {
  describe.each([
    ["dark", oscuro],
    ["light", claro],
  ])("%s theme", (_label, theme) => {
    test.each(FOREGROUND_KEYS)("%s reads against every surface", (key) => {
      SURFACE_KEYS.forEach((surfaceKey) => {
        const ratio = contrastRatio(theme[key], theme[surfaceKey]);
        expect(ratio).toBeGreaterThanOrEqual(CONTRAST_THRESHOLD);
      });
    });

    test("dim reads against every surface at its own floor", () => {
      SURFACE_KEYS.forEach((surfaceKey) => {
        const ratio = contrastRatio(theme.dim, theme[surfaceKey]);
        expect(ratio).toBeGreaterThanOrEqual(DIM_THRESHOLD);
      });
    });
  });

  test("the bright accent (goldBg) never darkens for a theme, unlike gold/green", () => {
    // goldBg is only ever used as a background paired with the brand's
    // dark ink (Q.goldBg + a hardcoded dark ink colour at the call
    // sites), so — unlike `gold`/`green`, which are used as text and
    // must darken in light mode to stay readable — it stays the same
    // bright value in both themes.
    expect(claro.goldBg).toBe(oscuro.goldBg);
  });

  test("the brand's dark ink reads clearly against goldBg in both themes", () => {
    // "--lime-ink" in the prototype (html/styles.css): the dark ink the
    // brand pairs with its bright accent when it is used as a background.
    const brandDarkInk = "#172000";
    expect(contrastRatio(oscuro.goldBg, brandDarkInk)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(claro.goldBg, brandDarkInk)).toBeGreaterThanOrEqual(4.5);
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
