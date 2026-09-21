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
// The product has one theme: dark. The brand mark is drawn in near-white
// with a faint outline, made for a dark surface — on a light background
// no CSS repairs it without inverting its green accents too, so a light
// theme is not offered. `oscuro` below is the prototype's own tokens,
// copied verbatim from `html/styles.css` (`--ink-950`, `--ink-900`,
// `--ink-800`, `--line`, `--text`, `--muted`, `--subtle`, `--lime`,
// `--violet`, `--odds-medium`, `--odds-high`, `--danger`). The prototype
// has no amber and no gold, so money, codes and odds take lime — in this
// brand the positive colour is the colour of money — and the warm ramp
// keeps the caution meaning.
//
// A light `claro` palette existed here once, derived from `oscuro` by
// inverting luminosity, and a `THEMES = { oscuro, claro }` lookup the
// screens switched between. Both are gone: this module exports the one
// palette it has.
//
// Two key groups have no counterpart in the prototype and are not in the
// proposal's mapping table, so their values were derived here rather than
// copied:
//
// - `glass`: a translucent gradient overlay, used only as a background
//   (never as text), so it carries no contrast requirement. It follows the
//   prototype's hue-tinted-glass pattern, tinted with the violet /
//   cyan-teal pair.
// - `pano`, `verde`, `rojo`, `negro`: the roulette table's felt and pocket
//   colours in Casino.jsx. These describe a physical roulette wheel (green
//   felt, green/red/black pockets), not a brand accent, and are only ever
//   used as backgrounds paired with hardcoded white text.
export const oscuro = {
  void:"#060a14", deep:"#0b1120", dark:"#111a2e",
  surface:"#111a2e", card:"#111a2e", inset:"#060a14",
  // The prototype's ramp is four steps: --ink-950 / -900 / -800 / -700.
  // Only the first three were ported, and `dark`, `surface` and `card`
  // are all the same #111a2e, so a box inside a box had no lighter
  // surface to sit on and the border became the only way to say "this
  // is a box". `raised` restores --ink-700, the missing step.
  raised:"#18243b",
  glass:"linear-gradient(160deg,rgba(154,108,255,0.06),rgba(198,175,255,0.03))",
  border:"#263550", text:"#f5f7fb", muted:"#9aa8c2", dim:"#63718a",
  green:"#b9ef32", gold:"#b9ef32", goldBg:"#b9ef32",
  violet:"#9a6cff", violet2:"#c6afff", cyan:"#c6afff", teal:"#c6afff", blue:"#9a6cff",
  amber:"#ffab9d", red:"#ff7c8d", pink:"#ff7c8d",
  pano:"#0B5137", verde:"#0E7A46", rojo:"#C4162A", negro:"#12182B",
};

// ═══════════════════════════════════════════════════════════════
// INK ON AN ACCENT
//
// Where an accent is the background, what goes on top of it is decided
// by the accent, not by the theme. The prototype already says so: it
// pairs `--lime` with `--lime-ink` specifically, not with a global text
// colour. Generalising that pairing to a single constant was the wrong
// shape: an accent this bright wants dark text, and the one that shipped
// white was exactly that mistake.
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
// than one background and its ends can disagree — answering from one end
// only would risk shipping a stop the chosen ink cannot read.
//
// Every accent this brand currently ships is bright enough that
// `INK_DARK` wins: measured across every accent and every gradient the
// screens actually build, the worst pair is 5.75:1, on the violet/blue
// accent, and the best is 14.91:1 on the lime — both comfortably above
// the 3.0:1 floor the contrast test holds text to. `INK_LIGHT` is
// unused by today's single theme, not unreachable: the comparison it
// exists for is still made and still tested for every accent, and it
// earns its keep the day a second, differently-toned surface exists to
// need it.
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

// ═══════════════════════════════════════════════════════════════
// SCALES — the prototype's own steps, so later passes have somewhere to
// point. Nothing in the six screens reads these yet: this is additive,
// not a migration. Each is a plain object keyed by its own value, so a
// call site reads as `fontSize:TEXT[13]` or `padding:SPACING[16]` — the
// key doubles as the allow-list of steps a later pass may choose from.
//
// `SPACING` is the prototype's 4px grid, copied from `html/styles.css`
// (`--space-1` through `--space-10`; the prototype's own naming skips
// `--space-7` and `--space-9`, so this does too).
// `ELEVATION` is the prototype's `--shadow-raised`, copied exactly. The
// prototype puts it on every panel; the port dropped it, which is the other
// half of why the border had to carry all the separation on its own.
export const ELEVATION =
  "0 1px 0 rgba(255,255,255,0.05), 0 18px 32px rgba(0,0,0,0.22)";

export const SPACING = {
  4: 4, 8: 8, 12: 12, 16: 16, 20: 20, 24: 24, 32: 32, 40: 40,
};

// `RADII` keeps the prototype's own names (`--radius-sm/md/lg/xl`) since
// they already exist there. `full` has no counterpart in the prototype —
// it is the conventional pill/circle value CSS `border-radius` treats as
// "as round as this box allows", not a fifth step on the same ramp.
export const RADII = {
  sm: 6, md: 10, lg: 14, xl: 20, full: 9999,
};

// `TEXT` is read from `html/styles.css`, not invented: every literal,
// fixed `font-size` value the stylesheet actually applies at least once,
// excluding the icon-hiding `font-size: 0` and the fluid `clamp(...)`
// declarations (a range, not a step). It does not include `--text-display`
// (56px): that token is declared in the prototype's `:root` but never
// applied to anything, so it is not a size the prototype uses.
export const TEXT = {
  10: 10, 11: 11, 12: 12, 13: 13, 14: 14, 15: 15, 16: 16,
  20: 20, 21: 21, 28: 28, 30: 30, 32: 32,
};
