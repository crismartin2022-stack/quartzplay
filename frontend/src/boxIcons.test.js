import fs from "fs";
import path from "path";
import { ICON_PATHS } from "./Icon";

// Box.jsx is the first screen migrated off emoji (docs/icon-inventory.md).
const box = fs.readFileSync(path.resolve(__dirname, "Box.jsx"), "utf8");

// Unicode's own definition of an emoji: a pictographic character with its
// optional variation selector, skin tone and zero-width-joiner sequence.
// Not the typographic glyphs the screen also uses (✕, ×, ↑), which are
// drawn by the same font as the text beside them.
const EMOJI = /(?:\p{RI}\p{RI}|[0-9#*]️?⃣|\p{Extended_Pictographic}(?:️|[\u{1F3FB}-\u{1F3FF}])?(?:‍\p{Extended_Pictographic}(?:️|[\u{1F3FB}-\u{1F3FF}])?)*)/gu;

function emojiIn(source) {
  const found = {};
  for (const [match] of source.matchAll(EMOJI)) {
    found[match] = (found[match] || 0) + 1;
  }
  return found;
}

// Every emoji in this screen that the inventory gives an icon to. None of
// them may survive in the file. 🤝 joined this list in the site slice
// (odd/tasks/site-emoji-to-icons.md, T2): `Handshake` from lucide-react,
// the same source App.jsx's T2 used for it, not a name in ICON_PATHS.
const REPLACED = ["📊", "🔍", "🚫", "🎟️", "⏱", "💰", "✅", "🎫", "📸", "⚠️", "🛡️", "🤝"];

// The emoji the set cannot draw yet. They stay until the icon exists,
// because an approximation would be worse than an honest gap. Each is
// listed in docs/icon-inventory.md under "What the set cannot draw yet".
const AWAITING_AN_ICON = {
  "🔁": 1, // repeat — Mantener selecciones
  "🌙": 1, // empty state — No hay combos ahora
  "🖼️": 1, // image — Galería
  "✏️": 1, // pencil — Está mal / Corregir
  "🛠️": 1, // tools — Bet Builder
  "🎲": 1, // dice — Armar combinada
  "⚖️": 1, // scales — Medio
  "🚀": 1, // rocket — Fuerte
  "📭": 1, // empty state — No hay partidos
};

describe("Box.jsx draws icons, not emoji", () => {
  test("it takes its icons from the one component", () => {
    expect(box).toMatch(/import Icon from "\.\/Icon";/);
    expect(box).toMatch(/<Icon\s/);
  });

  test("no emoji remains where an icon belongs", () => {
    const left = Object.keys(emojiIn(box));
    expect(left.filter((emoji) => REPLACED.includes(emoji))).toEqual([]);
  });

  test("the only emoji left are the ones the set cannot draw yet", () => {
    expect(emojiIn(box)).toEqual(AWAITING_AN_ICON);
  });

  test("every icon it names exists in the set", () => {
    const statics = [...box.matchAll(/<Icon\s+name="([^"]+)"/g)].map((m) => m[1]);
    const chosen = [...box.matchAll(/<Icon\s+name=\{[^}]*\?"([^"]+)":"([^"]+)"\}/g)];
    const named = [...statics, ...chosen.flatMap((m) => [m[1], m[2]])];

    // Nothing slips past the two shapes above: one tag names one icon, or
    // picks between two.
    const tags = (box.match(/<Icon\s/g) || []).length;
    expect(statics.length + chosen.length).toBe(tags);
    expect(tags).toBeGreaterThan(0);
    named.forEach((name) => expect(ICON_PATHS).toHaveProperty([name]));
  });
});
