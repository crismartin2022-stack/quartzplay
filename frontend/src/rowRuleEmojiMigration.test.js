import fs from "fs";
import path from "path";

// T4 of odd/tasks/player-chrome-batch.md: the Desafíos tab row (🔥 Muro,
// ➕ Desafiar, 📋 Mías, 🪙 IACOIN) and its 👋 empty state, Perfil's
// 💸 Retirar and 🔗 Vincular cuenta, and the 🔔/🔕 toggle in the help
// chat's header were deliberately left behind an earlier migration under
// the row rule (a row of related items migrates whole or not at all, and
// some had no local equivalent). The owner has now asked for them
// specifically — a reversal of that earlier decision, not a rule change.
//
// Structural, source-based assertions — no DOM renderer for App.jsx here,
// the way boxIcons.test.js and screenHomeIconsAndAccents.test.js read
// this project's mega-components.
const APP = fs.readFileSync(path.resolve(__dirname, "App.jsx"), "utf8");

function functionBody(name) {
  const start = APP.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const end = APP.indexOf("\nfunction ", start);
  expect(end).toBeGreaterThan(start);
  return APP.slice(start, end);
}

describe("the Desafíos tab row migrates whole", () => {
  function tabsBlock() {
    const body = functionBody("ScreenDesafios");
    const start = body.indexOf('k:"muro"');
    expect(start).toBeGreaterThan(-1);
    const end = body.indexOf(".map(", start) + 400;
    return body.slice(start - 40, end);
  }

  test("none of the row's four emoji survive in the tab row", () => {
    const block = tabsBlock();
    ["🔥", "➕", "📋", "🪙"].forEach((emoji) => {
      expect(block).not.toContain(emoji);
    });
  });

  test("Muro takes Flame and IACOIN takes Coins — the two lucide-react gap marks", () => {
    const block = tabsBlock();
    expect(block).toMatch(/<Flame\b/);
    expect(block).toMatch(/<Coins\b/);
  });

  test("Desafiar and Mías reuse the local Icon set — no new dependency needed for those two", () => {
    const block = tabsBlock();
    expect(block).toMatch(/<Icon\s+name="plus"/);
    expect(block).toMatch(/<Icon\s+name="clipboard-list"/);
  });

  test("all four labels still read", () => {
    const block = tabsBlock();
    ["Muro", "Desafiar", "Mías", "IACOIN"].forEach((label) => {
      expect(block).toContain(label);
    });
  });
});

describe("the Muro empty state's 👋 migrates with its row", () => {
  test("the wave emoji is gone from MuroDesafios' empty state", () => {
    const body = functionBody("MuroDesafios");
    expect(body).toContain("Todavía no hay nada por acá");
    expect(body).not.toContain("👋");
  });

  test("it reuses Handshake — already imported for 🤝 elsewhere in this file", () => {
    const body = functionBody("MuroDesafios");
    expect(body).toMatch(/<Handshake\b/);
  });
});

describe("Perfil's 💸 Retirar takes an icon", () => {
  test("neither of RetiroBox's two money-bag emoji survives", () => {
    const body = functionBody("RetiroBox");
    expect(body).not.toContain("💸");
  });

  test("both reuse the local wallet-cards icon — no new dependency needed", () => {
    const body = functionBody("RetiroBox");
    const uses = body.match(/<Icon\s+name="wallet-cards"/g) || [];
    expect(uses.length).toBe(2);
  });

  test("both labels still read", () => {
    const body = functionBody("RetiroBox");
    expect(body).toContain("Retirar</button>");
    expect(body).toContain("Retirar en mostrador</div>");
  });
});

describe("Perfil's 🔗 Vincular cuenta takes Link", () => {
  test("neither of VincularBox's two link emoji survives", () => {
    const body = functionBody("VincularBox");
    expect(body).not.toContain("🔗");
  });

  test("both reuse the same new Link icon", () => {
    const body = functionBody("VincularBox");
    const uses = body.match(/<Link\b/g) || [];
    expect(uses.length).toBe(2);
  });

  test("both labels still read", () => {
    const body = functionBody("VincularBox");
    expect(body).toContain("Vincular cuenta de mostrador</button>");
    expect(body).toContain("Vincular cuenta</div>");
  });
});

describe("the help chat header's sound toggle takes Bell", () => {
  function toggleBlock() {
    const body = functionBody("ChatSoporte");
    const at = body.indexOf('title="Sonido de aviso"');
    expect(at).toBeGreaterThan(-1);
    return body.slice(at, at + 250);
  }

  test("the bell/no-bell emoji pair is gone", () => {
    const block = toggleBlock();
    expect(block).not.toContain("🔔");
    expect(block).not.toContain("🔕");
  });

  test("it renders the new Bell icon, muted state still carried by opacity", () => {
    const block = toggleBlock();
    expect(block).toMatch(/<Bell\b/);
    expect(block).toMatch(/opacity:sonido\?1:0\.4/);
  });
});

describe("the four new lucide-react names are imported explicitly", () => {
  test("App.jsx imports Flame, Coins, Link and Bell alongside the rest", () => {
    expect(APP).toMatch(
      /import\s*\{\s*Video,\s*Handshake,\s*Zap,\s*Gift,\s*Image as ImageIcon,\s*User,\s*Flame,\s*Coins,\s*Link,\s*Bell,\s*Calendar,\s*Rocket,\s*Store,\s*Target,\s*Shield,\s*Scale,\s*Dices,\s*Moon,\s*Lightbulb,\s*Pencil,\s*Repeat,\s*Smartphone,\s*PartyPopper,\s*Eye,\s*Heart,\s*Construction\s*\}\s*from\s*"lucide-react";/
    );
  });

  test("none of the four shadow a browser global the way Image does", () => {
    // Flame, Coins, Link and Bell are not window globals; only Image
    // needed the alias this file already carries.
    ["Flame", "Coins", "Link", "Bell"].forEach((name) => {
      expect(APP).not.toMatch(new RegExp(`${name} as `));
    });
  });
});
