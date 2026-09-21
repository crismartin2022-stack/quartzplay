import fs from "fs";
import path from "path";
import { ICON_PATHS } from "./Icon";

// ScreenHome (App.jsx) is the fourth task of the home-homologation change:
// icons instead of emoji, and the two hand-written casino-card gradients
// onto brand accents. Per docs/icon-inventory.md, this screen's six emoji
// split two ways — two already have a match among Icon.jsx's 36
// (🎰 → `spade`, 🔴 → `circle-dot`), and four do not (🎥 handshake... no,
// 🎥 video, 🤝 handshake, ⚡ zap, 🎁 gift), which is exactly the gap
// lucideIconsScreenHome.test.js (T1) proved lucide-react carries.
//
// Structural, source-based assertions: the way boxIcons.test.js and
// heroMascotPlacement.test.js read this project's mega-components, since
// there is no DOM renderer for App.jsx here.
const APP = fs.readFileSync(path.resolve(__dirname, "App.jsx"), "utf8");

function screenHomeBody() {
  const start = APP.indexOf("function ScreenHome");
  expect(start).toBeGreaterThan(-1);
  const end = APP.indexOf("\nfunction ", start);
  expect(end).toBeGreaterThan(start);
  return APP.slice(start, end);
}

const EMOJI = /(?:\p{RI}\p{RI}|[0-9#*]️?⃣|\p{Extended_Pictographic}(?:️|[\u{1F3FB}-\u{1F3FF}])?(?:‍\p{Extended_Pictographic}(?:️|[\u{1F3FB}-\u{1F3FF}])?)*)/gu;

function emojiIn(source) {
  const found = new Set();
  for (const [match] of source.matchAll(EMOJI)) found.add(match);
  return found;
}

describe("ScreenHome draws icons, not emoji", () => {
  const body = screenHomeBody();

  test("none of this screen's six emoji survive", () => {
    const left = [...emojiIn(body)];
    expect(left.filter((e) => ["🎰", "🎥", "🤝", "⚡", "🔴", "🎁"].includes(e))).toEqual([]);
  });

  test("Casino (🎰) and En vivo ahora (🔴) take the icons already in the 36-icon set", () => {
    expect(body).toMatch(/<Icon\s+name="spade"/);
    expect(body).toMatch(/<Icon\s+name="circle-dot"/);
    // Both named icons are real entries in Icon.jsx's own set.
    expect(ICON_PATHS).toHaveProperty(["spade"]);
    expect(ICON_PATHS).toHaveProperty(["circle-dot"]);
  });

  test("the four gap emoji (En vivo card, Desafíos, Combo del día, Saldo bono) take lucide-react", () => {
    expect(body).toMatch(/<Video\b/);
    expect(body).toMatch(/<Handshake\b/);
    expect(body).toMatch(/<Zap\b/);
    expect(body).toMatch(/<Gift\b/);
  });

  test("App.jsx imports exactly the lucide names it draws, and nothing more", () => {
    // Pinned on purpose: every name added here is one more icon set this
    // file depends on, and the point of the local Icon.jsx is that the
    // product draws its own. `Image` is aliased because the bare name
    // shadows the browser global of the same name.
    expect(APP).toMatch(
      /import\s*\{\s*Video,\s*Handshake,\s*Zap,\s*Gift,\s*Image as ImageIcon\s*\}\s*from\s*"lucide-react";/
    );
  });
});

describe("the two casino cards' hand-written gradients are gone", () => {
  test("neither card's own background declaration hardcodes a hex colour any more", () => {
    // ScreenCasino (elsewhere in this file, out of this task's scope) has
    // its own unrelated purple hex constants; a comment on the cards below
    // also names the two old pairs for context. Neither is what this
    // guards — only the two cards' own `background:` declarations.
    const casinoStart = screenHomeBody().indexOf('onClick={()=>onNav("casino")}');
    const casinoVivoStart = screenHomeBody().indexOf('onClick={()=>onNav("casinovivo")}');
    const casinoCard = screenHomeBody().slice(casinoStart, casinoVivoStart);
    const casinoVivoCard = screenHomeBody().slice(casinoVivoStart, casinoVivoStart + 700);
    const backgroundOf = (card) => card.match(/background:`linear-gradient\([^)]*\)`/)[0];

    expect(backgroundOf(casinoCard)).not.toMatch(/#[0-9A-Fa-f]{6}/);
    expect(backgroundOf(casinoVivoCard)).not.toMatch(/#[0-9A-Fa-f]{6}/);
  });

  test("the two cards' backgrounds are built from Q's own accent tokens", () => {
    const casinoStart = body().indexOf('onClick={()=>onNav("casino")}');
    const casinoVivoStart = body().indexOf('onClick={()=>onNav("casinovivo")}');
    expect(casinoStart).toBeGreaterThan(-1);
    expect(casinoVivoStart).toBeGreaterThan(casinoStart);

    const casinoCard = body().slice(casinoStart, casinoVivoStart);
    const casinoVivoCard = body().slice(casinoVivoStart, casinoVivoStart + 700);

    expect(casinoCard).toMatch(/background:`linear-gradient\(135deg,\$\{Q\.\w+\},\$\{Q\.\w+\}\)`/);
    expect(casinoVivoCard).toMatch(/background:`linear-gradient\(135deg,\$\{Q\.\w+\},\$\{Q\.\w+\}\)`/);
  });

  function body() {
    return screenHomeBody();
  }
});

describe("ink on the two casino cards comes from inkOn, not a hardcoded colour", () => {
  const body2 = screenHomeBody();
  const casinoStart = body2.indexOf('onClick={()=>onNav("casino")}');
  const casinoVivoStart = body2.indexOf('onClick={()=>onNav("casinovivo")}');
  const casinoCard = body2.slice(casinoStart, casinoVivoStart);
  const casinoVivoCard = body2.slice(casinoVivoStart, casinoVivoStart + 700);

  test("neither card hardcodes white text any more", () => {
    expect(casinoCard).not.toContain('"#fff"');
    expect(casinoCard).not.toContain("rgba(255,255,255");
    expect(casinoVivoCard).not.toContain('"#fff"');
    expect(casinoVivoCard).not.toContain("rgba(255,255,255");
  });

  test("both cards call inkOn for their text colour", () => {
    expect(casinoCard).toMatch(/color:inkOn\(/);
    expect(casinoVivoCard).toMatch(/color:inkOn\(/);
  });
});

describe("the two cards stay visually distinguishable from each other", () => {
  test("Casino and En vivo do not share the exact same gradient", () => {
    const body = screenHomeBody();
    const casinoStart = body.indexOf('onClick={()=>onNav("casino")}');
    const casinoVivoStart = body.indexOf('onClick={()=>onNav("casinovivo")}');
    const casinoCard = body.slice(casinoStart, casinoVivoStart);
    const casinoVivoCard = body.slice(casinoVivoStart, casinoVivoStart + 700);

    const gradient = (card) => card.match(/background:`linear-gradient\(135deg,[^)]*\)`/)[0];
    expect(gradient(casinoCard)).not.toBe(gradient(casinoVivoCard));
  });
});
