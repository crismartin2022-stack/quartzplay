import fs from "fs";
import path from "path";
import * as LucideIcons from "lucide-react";

// docs/icon-inventory.md's gap list names four emoji on this screen
// (App.jsx's ScreenHome) with no equivalent among Icon.jsx's 36 ported
// paths: 🎥 En vivo ("no live feed mark"), 🤝 Desafíos ("no handshake"),
// ⚡ Combo del día ("no bolt in the set"), 🎁 Saldo bono ("no gift"). The
// other two emoji on this screen (🎰 Casino, 🔴 En vivo ahora) already
// have a match in the 36 (`spade`, `circle-dot`) and stay on Icon.jsx.
//
// lucide-react is the full set the prototype's 36 icons were drawn from
// (html/assets/icons.js ships Lucide's own `lucide.createIcons` runtime),
// so it is the same family, not a second one, and it carries every one of
// these four gaps. This asserts membership against the package's own
// exports rather than trusting a hand-typed name is spelled the way the
// package spells it.
const SCREEN_HOME_GAP_ICONS = {
  Video: "🎥 En vivo (casino card)",
  Handshake: "🤝 Desafíos",
  Zap: "⚡ Combo del día",
  Gift: "🎁 Saldo bono",
};

// This repository tracks no lockfile, so a caret range would leave nothing
// pinning which version actually resolves — and the checks below run against
// whatever happens to be installed, so they could not detect that drift. The
// dependency is therefore pinned exactly, and this asserts the pin and the
// installed copy still agree: if someone widens the range, or installs a
// different version, the suite says so instead of the home screen rendering
// `undefined` as an element type.
describe("the icon dependency resolves to exactly one known version", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")
  );
  const pinned = manifest.dependencies["lucide-react"];

  test("the range is an exact version, not a caret or tilde", () => {
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("the installed copy is the pinned version", () => {
    const installed = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "..", "node_modules", "lucide-react", "package.json"),
        "utf8"
      )
    ).version;
    expect(installed).toBe(pinned);
  });
});

describe("lucide-react carries the icons ScreenHome's emoji gaps need", () => {
  test("the package actually exports something (guards against a broken import)", () => {
    expect(Object.keys(LucideIcons).length).toBeGreaterThan(100);
  });

  test.each(Object.entries(SCREEN_HOME_GAP_ICONS))(
    "%s is exported by lucide-react (%s)",
    (exportName, reason) => {
      expect(reason).toEqual(expect.any(String));
      expect(Object.keys(LucideIcons)).toContain(exportName);
      expect(LucideIcons[exportName]).toBeDefined();
    }
  );
});
