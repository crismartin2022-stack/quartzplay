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
    // shadows the browser global of the same name. `User` joined in the
    // player-chrome batch (odd/tasks/player-chrome-batch.md, T3-T4):
    // Icon.jsx's own 36-mark set has no single-person icon, only `users`
    // (a group), which is wrong for a profile avatar (User, T3); Flame,
    // Coins, Link and Bell followed for the row the row rule had
    // protected (T4) — a flame for the Muro tab, a coin for IACOIN, a
    // link for Vincular cuenta, a bell for the help chat's sound toggle.
    // Calendar, Rocket, Store, Target, Shield, Scale, Dices, Moon,
    // Lightbulb, Pencil, Repeat, Smartphone, PartyPopper, Eye, Heart and
    // Construction joined in odd/tasks/finish-icon-migration.md's T1, the
    // row rule now retired: every one of them draws a mark Icon.jsx's own
    // 36-path set has no equivalent for. None of the names below shadow a
    // browser global the way `Image` does.
    expect(APP).toMatch(
      /import\s*\{\s*Video,\s*Handshake,\s*Zap,\s*Gift,\s*Image as ImageIcon,\s*User,\s*Flame,\s*Coins,\s*Link,\s*Bell,\s*Calendar,\s*Rocket,\s*Store,\s*Target,\s*Shield,\s*Scale,\s*Dices,\s*Moon,\s*Lightbulb,\s*Pencil,\s*Repeat,\s*Smartphone,\s*PartyPopper,\s*Eye,\s*Heart,\s*Construction\s*\}\s*from\s*"lucide-react";/
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

// The three cards' backgrounds stopped being flat two-colour gradients
// (frontend/public/brand/{slot,live-casino,desafios}.webp are the
// background now — see the comment above the row in App.jsx), so
// `inkOn(<the two gradient colours>)` no longer describes what is behind
// the text: an image is. The guarantee this describe block protects
// changed shape with it. It used to be "the ink is derived from the
// background colour, not hardcoded"; it is now "an image-background card
// always carries a scrim dark enough to read text on, and the text is
// painted above that scrim, not directly on the photo". `inkOn` is still
// how the ink is picked (against the scrim's own near-black tokens,
// Q.void/Q.dark — see App.jsx), so the "not hardcoded" half of the old
// guarantee is folded into the scrim check below rather than dropped.
describe("cards with an image background always carry a legible scrim above the photo", () => {
  const CARDS = ["casino", "casinovivo", "desafios"];
  // Each card is bounded by the next card's own onClick (or, for the last
  // one, by the next section's own comment) — a real structural anchor,
  // not a guessed character count. A fixed-length slice (the previous
  // version of this file used `casinoVivoStart + 700`) silently stops
  // covering a card the moment its markup grows past that number, which is
  // exactly what happened when the scrim/photo layers were added: the
  // card's own `color:inkOn(...)` moved past character 700 and the guard
  // that was supposed to find it just... didn't, without failing loudly
  // about why.
  const NEXT_MARKER = {
    casino: 'onClick={()=>onNav("casinovivo")}',
    casinovivo: 'onClick={()=>onNav("desafios")}',
    desafios: "{/* Combo del día destacado */}",
  };

  function cardSource(dest) {
    const body = screenHomeBody();
    const start = body.indexOf(`onClick={()=>onNav("${dest}")}`);
    expect(start).toBeGreaterThan(-1);
    const end = body.indexOf(NEXT_MARKER[dest], start + 1);
    expect(end).toBeGreaterThan(start);
    return body.slice(start, end);
  }

  // A scrim is a second, independent overlay — its own plain-quoted
  // `background:` (deliberately not a backtick template literal, so it
  // never collides with the brand-tint gradient the tests above this one
  // pin to `` background:`linear-gradient(135deg,${Q.x},${Q.y})` ``) —
  // built from `rgba(...)` stops that reach at least 0.6 alpha. A merely
  // translucent tint (say, 0.1) would say nothing about legibility; this
  // asks for a stop dark/opaque enough to actually read text on.
  function findScrim(cardSource) {
    const overlays = [...cardSource.matchAll(/background:"([^"]*)"/g)]
      .map((m) => ({ raw: m[1], at: m.index }));
    return overlays.find((o) => {
      const alphas = [...o.raw.matchAll(/rgba\([^)]*,\s*([\d.]+)\s*\)/g)]
        .map((m) => Number(m[1]));
      return alphas.length > 0 && Math.max(...alphas) >= 0.6;
    });
  }

  test("positive control: the detector fails a card that has an image but no scrim", () => {
    // Without this, findScrim could return undefined for every real card
    // too and every test below would pass for a reason that proves
    // nothing — exactly the failure mode this rewrite exists to close.
    const noScrimFixture =
      '<div style={{backgroundImage:"url(/brand/slot.webp)"}}>' +
      '<div style={{background:"linear-gradient(180deg,transparent,rgba(0,0,0,.15))"}}/>' +
      '<div style={{color:inkOn(Q.violet,Q.violet2)}}>Casino</div></div>';
    expect(findScrim(noScrimFixture)).toBeUndefined();
  });

  test.each(CARDS)("the %s card's own background is an image, not a flat colour", (dest) => {
    expect(cardSource(dest)).toMatch(/backgroundImage:"url\(\/brand\/[\w.-]+\.webp\)"/);
  });

  test.each(CARDS)("the %s card declares a scrim dark enough to read text on", (dest) => {
    expect(findScrim(cardSource(dest))).toBeDefined();
  });

  test.each(CARDS)("the %s card's text is painted above its scrim, not directly on the photo", (dest) => {
    const card = cardSource(dest);
    const scrim = findScrim(card);
    const textAt = card.indexOf("color:inkOn(");
    expect(textAt).toBeGreaterThan(-1);
    // Later in source == painted later == visually on top, for sibling
    // elements with no explicit z-index — true of every layer in these
    // cards (see App.jsx).
    expect(textAt).toBeGreaterThan(scrim.at);
  });

  test.each(CARDS)("the %s card does not hardcode white text", (dest) => {
    const card = cardSource(dest);
    expect(card).not.toContain('"#fff"');
    expect(card).not.toContain("rgba(255,255,255");
  });

  test.each(CARDS)("the %s card still calls inkOn, now against the scrim's own dark tokens", (dest) => {
    expect(cardSource(dest)).toMatch(/color:inkOn\(/);
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
