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
// - `ink`: the text and icon colour for anything drawn ON an accent. The
//   prototype already names this idea `--lime-ink` (`#172000`) and pairs
//   it with `--lime`; it just never generalised it, so violet, cyan and
//   the rest were left carrying hardcoded white and stopped being
//   readable once the accents were remapped to the prototype's brighter
//   tokens (`#c6afff` under white is 1.91:1). One ink serves every
//   accent, so the value is the prototype's hue relationship (no blue,
//   green above red — an olive black) taken darker than `--lime-ink`,
//   because the same ink also has to read on the light theme's deepest
//   accent, `violet` `#6b3fd4`. At `#050700` the worst pair in either
//   theme is that violet at 3.17:1, above the 3.0:1 floor the contrast
//   test holds every other pairing to; on the lime it is 15.0:1. It does
//   not change between themes for the same reason `goldBg` does not: an
//   accent used as a background keeps its bright value in both, so what
//   sits on it does too.
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
  ink:"#050700",
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
  ink:"#050700",
  pano:"#0B5137", verde:"#0E7A46", rojo:"#C4162A", negro:"#12182B",
};

export const THEMES = { oscuro, claro };

// Typography: a single family everywhere. The prototype is a
// single-family design and the condensed face (`Barlow Condensed`) was
// never part of the brand; both the number/title face and the body face
// become Poppins, with the same system fallback the screens used before.
export const F_NUM = "'Poppins',system-ui,sans-serif";
export const F_BODY = "'Poppins',system-ui,sans-serif";
