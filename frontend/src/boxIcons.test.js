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

// Every emoji this screen ever had, all of it replaced by a drawn icon.
// 🤝 joined this list in the site slice (odd/tasks/site-emoji-to-icons.md,
// T2): `Handshake` from lucide-react, the same source App.jsx's T2 used
// for it, not a name in ICON_PATHS. The nine glyphs the row rule had
// protected (🔁🌙🖼️✏️🛠️🎲⚖️🚀📭) joined in
// odd/tasks/finish-icon-migration.md's T1, the row rule now retired:
// Repeat, Moon, Image as ImageIcon, Pencil, Wrench, Dices, Scale, Rocket
// and Inbox, all from lucide-react. Box.jsx has no canvas/share/print
// text, so nothing here left the "renders in the interface" scope — the
// screen is emoji-free.
const REPLACED = ["📊", "🔍", "🚫", "🎟️", "⏱", "💰", "✅", "🎫", "📸", "⚠️", "🛡️", "🤝",
  "🔁", "🌙", "🖼️", "✏️", "🛠️", "🎲", "⚖️", "🚀", "📭"];

describe("Box.jsx draws icons, not emoji", () => {
  test("it takes its icons from the one component", () => {
    expect(box).toMatch(/import Icon from "\.\/Icon";/);
    expect(box).toMatch(/<Icon\s/);
  });

  test("no emoji remains where an icon belongs", () => {
    const left = Object.keys(emojiIn(box));
    expect(left.filter((emoji) => REPLACED.includes(emoji))).toEqual([]);
  });

  test("Box.jsx is emoji-free", () => {
    expect(emojiIn(box)).toEqual({});
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
