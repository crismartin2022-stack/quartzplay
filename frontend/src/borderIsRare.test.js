import fs from "fs";
import path from "path";

// ── A signal used everywhere signals nothing ──────────────────────────
//
// The owner's report was "demasiado borde, borde borde, y no hay
// jerarquía". The measured cause was not carelessness: 126 of the 314
// GCards in the two panels drew a coloured `glow` border, and 95 of those
// were brand colours carrying no state at all. A "look at this" border on
// two of every five cards ranks nothing.
//
// `glow` now means one thing: something here is wrong or waiting. Those
// are the alarm colours. A brand colour on a card that is merely a card
// is decoration, and decoration is what made the screen unreadable.
//
// This guard does not forbid `glow`. It forbids the unconditional
// decorative form — `<GCard glow={Q.violet}>` — while leaving every
// state-driven use alone, including the conditional
// `glow={blocked?Q.red:null}` shape, which is exactly the intended one.
const SRC = path.resolve(__dirname);
const PANELS = ["Admin.jsx", "Agencia.jsx"];

const DECORATIVE = ["violet", "violet2", "cyan", "teal", "green", "gold", "blue"];

const sources = Object.fromEntries(
  PANELS.map((name) => [name, fs.readFileSync(path.join(SRC, name), "utf8")])
);

function unconditionalGlows(source) {
  return [...source.matchAll(/<GCard glow=\{(Q\.\w+)\}/g)].map((m) => m[1]);
}

describe("the matcher can see glows at all", () => {
  // Without this, a renamed prop would empty the matcher and the
  // assertion below would pass by finding nothing.
  test.each(PANELS)("%s still declares GCards with a glow", (name) => {
    expect(sources[name]).toMatch(/<GCard glow=/);
  });
});

describe("a coloured border means a state, not a brand colour", () => {
  test.each(PANELS)("%s uses no unconditional decorative glow", (name) => {
    const offenders = unconditionalGlows(sources[name]).filter((token) =>
      DECORATIVE.includes(token.split(".").pop())
    );
    expect(offenders).toEqual([]);
  });

  test("positive control: a decorative glow is detected", () => {
    expect(unconditionalGlows('<GCard glow={Q.violet} style={{}}>')).toEqual(["Q.violet"]);
  });

  test("positive control: an alarm glow is left alone", () => {
    const alarms = unconditionalGlows('<GCard glow={Q.red}>').filter((token) =>
      DECORATIVE.includes(token.split(".").pop())
    );
    expect(alarms).toEqual([]);
  });

  test("positive control: a state-driven conditional is not an unconditional glow", () => {
    expect(unconditionalGlows('<GCard glow={bloqueado?Q.red:null}>')).toEqual([]);
  });
});

// ── The secondary action is not a coloured box ────────────────────────
//
// `Btn` drew `1px solid ${color}` on every button, outline or not. Four
// outlined buttons stacked inside an already-bordered card is the wall of
// edges in the owner's screenshot. An outline button now reads as a
// raised surface with a coloured label: the colour still says what kind
// of action it is, without framing it.
describe("an outline button is a surface, not a frame", () => {
  test.each(PANELS)("%s draws no border on an enabled outline button", (name) => {
    expect(sources[name]).toMatch(/border:outline&&!disabled\?"none"/);
  });

  // The surface has to be a step ABOVE whatever the button is sitting on,
  // not a fixed colour. `Q.raised` was fixed, and inside a card that was
  // itself raised the button and its container came out the same shade —
  // the owner reported the button had vanished into the card. A
  // translucent white overlay steps up from any surface underneath.
  test.each(PANELS)("%s gives an outline button a surface to sit on", (name) => {
    expect(sources[name]).toMatch(/outline\?"rgba\(255,255,255,0\.06\)":/);
  });

  test.each(PANELS)("%s does not pin that surface to one fixed colour", (name) => {
    expect(sources[name]).not.toMatch(/outline\?Q\.raised:/);
  });
});
