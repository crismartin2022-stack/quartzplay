// ═══════════════════════════════════════════════════════════════
// THEME — the brand's single source of colour and type.
//
// Every screen used to declare its own palette: Admin.jsx, Agencia.jsx
// and Casino.jsx each had a `const Q = {...}` with the older neon set;
// App.jsx, Web.jsx and Box.jsx each had a `const TEMAS = { oscuro, claro }`
// with a newer blue/gold set. This module replaces all six declarations
// with one, under the exact key names the screens already read, so no
// call site (`Q.<key>`, ~5,400 of them) has to change.
//
// The dark column below is the prototype's own tokens, copied verbatim
// from `html/styles.css` (`--ink-950`, `--ink-900`, `--ink-800`, `--line`,
// `--text`, `--muted`, `--subtle`, `--lime`, `--violet`, `--odds-medium`,
// `--odds-high`, `--danger`). The prototype has no amber and no gold, so
// money, codes and odds take lime — in this brand the positive colour is
// the colour of money — and the warm ramp keeps the caution meaning.
//
// The light column is derived, not invented: same hues, luminosity
// inverted, every foreground value darkened until it reads on white. The
// bright accents (`gold`, `goldBg`) never appear as light-mode text; they
// only ever pair with dark ink as a background, in both themes.
//
// Two key groups have no counterpart in the prototype and are not in the
// proposal's mapping table, so their values were derived here rather than
// copied:
//
// - `glass`: a translucent gradient overlay, used only as a background
//   (never as text), so it carries no contrast requirement. It follows the
//   same hue-tinted-glass pattern the old `TEMAS.oscuro`/`claro` used, but
//   tinted with the new violet / cyan-teal pair instead of the old blue.
// - `pano`, `verde`, `rojo`, `negro`: the roulette table's felt and pocket
//   colours in Casino.jsx. These describe a physical roulette wheel (green
//   felt, green/red/black pockets), not a brand accent, and are only ever
//   used as backgrounds paired with hardcoded white text. They are kept
//   identical to the values Casino.jsx already had, in both themes: Casino
//   never switches theme today, and a roulette pocket does not change
//   colour with a light switch.
export const oscuro = {
  void:"#060a14", deep:"#0b1120", dark:"#111a2e",
  surface:"#111a2e", card:"#111a2e", inset:"#060a14",
  glass:"linear-gradient(160deg,rgba(154,108,255,0.06),rgba(198,175,255,0.03))",
  border:"#263550", text:"#f5f7fb", muted:"#9aa8c2", dim:"#63718a",
  green:"#b9ef32", gold:"#b9ef32", goldBg:"#b9ef32",
  violet:"#9a6cff", violet2:"#c6afff", cyan:"#c6afff", teal:"#c6afff", blue:"#9a6cff",
  amber:"#ffab9d", red:"#ff7c8d", pink:"#ff7c8d",
  pano:"#0B5137", verde:"#0E7A46", rojo:"#C4162A", negro:"#12182B",
};

export const claro = {
  void:"#eef1f7", deep:"#ffffff", dark:"#ffffff",
  surface:"#ffffff", card:"#f6f8fc", inset:"#f1f4fa",
  glass:"linear-gradient(160deg,rgba(107,63,212,0.05),rgba(138,95,240,0.02))",
  border:"#d9e0ee", text:"#0b1120", muted:"#5b6780", dim:"#7c879e",
  green:"#5b7a0f", gold:"#5b7a0f", goldBg:"#b9ef32",
  violet:"#6b3fd4", violet2:"#8a5ff0", cyan:"#8a5ff0", teal:"#8a5ff0", blue:"#6b3fd4",
  amber:"#a8501f", red:"#c2273f", pink:"#c2273f",
  pano:"#0B5137", verde:"#0E7A46", rojo:"#C4162A", negro:"#12182B",
};

export const THEMES = { oscuro, claro };

// ═══════════════════════════════════════════════════════════════
// INK ON AN ACCENT
//
// Where an accent is the background, what goes on top of it is decided
// by the accent, not by the theme. The prototype already says so: it
// pairs `--lime` with `--lime-ink` specifically, not with a global text
// colour. Generalising that pairing to a single constant was the wrong
// shape, because the two themes derive their accents differently — the
// light theme's were made by darkening, so most of them are dark
// backgrounds wanting light text, while `goldBg` stays bright in both
// themes and wants dark text in both. One constant cannot answer for
// both, and the one that shipped white was the same mistake wearing the
// opposite colour.
//
// So there are two inks and nobody picks between them by hand:
//
// - `INK_DARK` `#050700` is `--lime-ink` taken darker: the prototype's
//   own hue relationship (no blue, green above red — an olive black).
// - `INK_LIGHT` `#fbfdf2` is its mirror, an off-white carrying the same
//   lime cast. Measured against pure white it costs nothing: the floor
//   below is set by an accent where the dark ink wins anyway, so the
//   brand tint is free.
//
// `inkOn` takes the colours a background is actually built from and
// returns whichever ink reads better on the worst of them. It is given
// every stop of a gradient, not just one, because a gradient has more
// than one background and its ends can disagree: `${Q.gold}` into
// `#c9a227` runs from a dark olive to a bright gold in the light theme,
// where the light ink reads 4.82 on the first stop and 1.37 on the
// second. Answering from one end would have shipped that.
//
// Measured across every accent in both themes and every gradient the
// screens actually build, the worst pair is 4.09:1, on that gold
// gradient in the light theme — above the 3.0:1 floor the contrast test
// holds text to. The best is 14.91:1 on the lime.
export const INK_DARK = "#050700";
export const INK_LIGHT = "#fbfdf2";

function channel(value){
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
function luminance(hex){
  if(typeof hex !== "string") return null;
  const raw = hex.trim().replace("#", "");
  const six = raw.length === 3 ? raw.replace(/./g, (c) => c + c) : raw;
  if(!/^[0-9a-fA-F]{6}$/.test(six)) return null;
  return 0.2126 * channel(parseInt(six.slice(0, 2), 16))
    + 0.7152 * channel(parseInt(six.slice(2, 4), 16))
    + 0.0722 * channel(parseInt(six.slice(4, 6), 16));
}

function ratio(a, b){
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

const INK_DARK_LUMINANCE = luminance(INK_DARK);
const INK_LIGHT_LUMINANCE = luminance(INK_LIGHT);

// The odds buttons redraw this for every outcome of every event, so the
// answer is remembered rather than recomputed a few thousand times a
// frame. The keys are colour strings; the set of them is the palette.
const remembered = new Map();

// `inkOn(Q.violet)` for a flat accent, `inkOn(Q.violet, Q.cyan)` for the
// two ends of a gradient. Anything it cannot read as a colour is
// ignored, so `inkOn(btn.color || Q.violet)` is safe; if nothing at all
// is readable it returns the dark ink rather than throwing mid-render.
export function inkOn(...background){
  const key = background.join("|");
  const known = remembered.get(key);
  if(known) return known;

  const stops = background.map(luminance).filter((l) => l !== null);
  const worstOn = (ink) => stops.reduce(
    (worst, stop) => Math.min(worst, ratio(ink, stop)), Infinity
  );
  const chosen = !stops.length || worstOn(INK_DARK_LUMINANCE) >= worstOn(INK_LIGHT_LUMINANCE)
    ? INK_DARK
    : INK_LIGHT;

  remembered.set(key, chosen);
  return chosen;
}

// Typography: a single family everywhere. The prototype is a
// single-family design and the condensed face (`Barlow Condensed`) was
// never part of the brand; both the number/title face and the body face
// become Poppins, with the same system fallback the screens used before.
export const F_NUM = "'Poppins',system-ui,sans-serif";
export const F_BODY = "'Poppins',system-ui,sans-serif";
