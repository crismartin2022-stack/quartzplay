import fs from "fs";
import path from "path";

// T3 of odd/tasks/desktop-shell.md: at 1024px and up, AdminPanel's fixed
// bottom TABS bar becomes a 264px sidebar instead of a fixed grid strip
// pinned to the bottom of the viewport. Structural, source-based
// assertions — no DOM renderer for Admin.jsx here (see
// jsxTagsAreBound.test.js / bottomNavSixItems.test.js for the same
// constraint solved the same way).
//
// Update (odd/tasks/mobile-nav.md): below 1024px the fixed bottom grid
// is gone. It used to sit in the same container as the desktop sidebar,
// both driven by the same isDesktop check — that is what the
// "byte-for-byte untouched" describe block below used to guard. It is
// now replaced by a hamburger button in the header that opens
// MobileTabMenu, a full-screen overlay shared with Agencia's panel. The
// desktop sidebar itself is unchanged; only the mobile alternative to it
// moved to a different component, and the content wrapper no longer
// reserves clearance for a fixed bottom bar that no longer exists.
const ADMIN = fs.readFileSync(path.resolve(__dirname, "Admin.jsx"), "utf8");

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const markers = ["\nfunction ", "\nexport default function "]
    .map((marker) => source.indexOf(marker, start + 1))
    .filter((i) => i > -1);
  const end = markers.length ? Math.min(...markers) : source.length;
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("Admin.jsx reads the shared desktop-width check", () => {
  test("imports useDesktopShellWidth from the shared module", () => {
    expect(ADMIN).toMatch(
      /import\s*\{[^}]*\buseDesktopShellWidth\b[^}]*\}\s*from\s*["']\.\/desktopShellLayout["']/
    );
  });

  test("AdminPanel calls the hook", () => {
    const body = functionBody(ADMIN, "AdminPanel");
    expect(body).toMatch(/useDesktopShellWidth\(\)/);
  });
});

describe("one TABS array feeds both the desktop sidebar and the mobile menu", () => {
  function tabsMapCount(source) {
    return [...source.matchAll(/TABS\.map\(/g)].length;
  }

  test("AdminPanel never forks TABS with its own .map — the sidebar reads it via TAB_GROUPS.flatMap+find, and the mobile menu reads it through a shared component", () => {
    const body = functionBody(ADMIN, "AdminPanel");
    expect(tabsMapCount(body)).toBe(0);
  });

  test("positive control: a forked list (a bare TABS.map call) is actually detected", () => {
    const forked = `function AdminPanel(){\n{TABS.map(t=>1)}\n}\nexport default function QuartzAdmin(){}`;
    expect(tabsMapCount(functionBody(forked, "AdminPanel"))).not.toBe(0);
  });

  test("MobileTabMenu is handed the same TABS/TAB_GROUPS identifiers, not a second copy", () => {
    const body = functionBody(ADMIN, "AdminPanel");
    const at = body.indexOf("<MobileTabMenu ");
    expect(at).toBeGreaterThan(-1);
    const call = body.slice(at, body.indexOf("/>", at) + 2);
    expect(call).toMatch(/groups=\{TAB_GROUPS\}/);
    expect(call).toMatch(/tabs=\{TABS\}/);
  });

  test("the single render branches its style on the desktop check", () => {
    const body = functionBody(ADMIN, "AdminPanel");
    const branches = [...body.matchAll(/isDesktop\s*\?/g)].length;
    // Container, topbar and content wrapper each still need their own
    // desktop/mobile style — one branch alone would mean something was
    // left unconverted or, worse, hard-coded to one shape.
    expect(branches).toBeGreaterThanOrEqual(4);
  });
});

describe("the prototype's desktop rules are present", () => {
  const body = functionBody(ADMIN, "AdminPanel");

  test("the shell caps at the prototype's 1600px and centres", () => {
    expect(body).toMatch(/maxWidth:1600/);
  });

  test("the sidebar column is the prototype's 264px", () => {
    expect(body).toMatch(/gridTemplateColumns:"264px minmax\(0,\s*1fr\)"/);
  });

  test("the sidebar itself only renders on desktop", () => {
    expect(body).toMatch(/\{isDesktop&&\(\s*\n\s*<div style=\{\{/);
  });
});

describe("all eleven tabs stay reachable in the sidebar", () => {
  test("the TABS array itself is untouched — same eleven keys, same order", () => {
    const start = ADMIN.indexOf("const TABS=[");
    const end = ADMIN.indexOf("];", start);
    const arrayText = ADMIN.slice(start, end);
    const keys = [...arrayText.matchAll(/k:"(\w+)"/g)].map((m) => m[1]);
    expect(keys).toEqual([
      "global", "cierre", "combos", "agencias", "influencers", "eventos",
      "billetera", "usuarios", "config", "diag", "chat",
    ]);
  });
});

describe("below 1024px, the fixed bottom bar is gone — replaced by the hamburger menu", () => {
  test("the old fixed-bottom, 6-column grid nav style no longer appears", () => {
    const body = functionBody(ADMIN, "AdminPanel");
    expect(body).not.toMatch(/display:"grid",gridTemplateColumns:"repeat\(6,1fr\)"/);
    expect(body).not.toMatch(/position:"fixed",bottom:0,left:"50%",transform:"translateX\(-50%\)"/);
  });

  test("the old icon-over-label mobile nav button no longer appears", () => {
    const body = functionBody(ADMIN, "AdminPanel");
    expect(body).not.toMatch(
      /minWidth:0,background:"transparent",border:"none",\s*\n\s*padding:"8px 4px 8px",cursor:"pointer",\s*\n\s*display:"flex",flexDirection:"column",alignItems:"center",gap:SPACING\[4\],/
    );
  });

  test("the content wrapper no longer reserves 140px for a fixed bar that is gone", () => {
    const body = functionBody(ADMIN, "AdminPanel");
    expect(body).not.toMatch(/paddingBottom:"calc\(140px \+ env\(safe-area-inset-bottom\)\)"/);
  });

  test("a mobile-only hamburger button opens the menu", () => {
    const body = functionBody(ADMIN, "AdminPanel");
    expect(body).toMatch(/\{!isDesktop&&\(/);
    expect(body).toMatch(/onClick=\{\(\)=>setMenuOpen\(true\)\}/);
  });

  test("MobileTabMenu is rendered, wired to the same tab state", () => {
    const body = functionBody(ADMIN, "AdminPanel");
    expect(body).toMatch(/<MobileTabMenu open=\{menuOpen\}/);
    expect(body).toMatch(/activeTab=\{tab\}\s*onSelect=\{setTab\}/);
  });
});
