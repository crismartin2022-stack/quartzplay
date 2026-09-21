import fs from "fs";
import path from "path";

// T2 of odd/tasks/desktop-shell.md: at 1024px and up, AgenciaPanel's
// TABS row becomes a 264px sidebar instead of a horizontally-scrolling
// row. Structural, source-based assertions — no DOM renderer for
// Agencia.jsx here (see jsxTagsAreBound.test.js / bottomNavSixItems.test.js
// for the same constraint solved the same way).
//
// Update (odd/tasks/mobile-nav.md): below 1024px the horizontal
// scrolling row itself is gone. It used to sit next to the sidebar in
// the same container, both driven by the same isDesktop check — that is
// what the "byte-for-byte untouched" describe block below used to guard.
// It is now replaced by a hamburger button in the header that opens
// MobileTabMenu, a full-screen overlay shared with Admin's panel. The
// desktop sidebar itself is unchanged; only the mobile alternative to it
// moved to a different component.
const AGENCIA = fs.readFileSync(path.resolve(__dirname, "Agencia.jsx"), "utf8");

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

describe("Agencia.jsx reads the shared desktop-width check", () => {
  test("imports useDesktopShellWidth from the shared module", () => {
    expect(AGENCIA).toMatch(
      /import\s*\{[^}]*\buseDesktopShellWidth\b[^}]*\}\s*from\s*["']\.\/desktopShellLayout["']/
    );
  });

  test("AgenciaPanel calls the hook", () => {
    const body = functionBody(AGENCIA, "AgenciaPanel");
    expect(body).toMatch(/useDesktopShellWidth\(\)/);
  });
});

describe("one TABS array feeds both the desktop sidebar and the mobile menu", () => {
  function tabsMapCount(source) {
    return [...source.matchAll(/TABS\.map\(/g)].length;
  }

  test("AgenciaPanel never forks TABS with its own .map — the sidebar reads it via TAB_GROUPS.flatMap+find, and the mobile menu reads it through a shared component", () => {
    const body = functionBody(AGENCIA, "AgenciaPanel");
    expect(tabsMapCount(body)).toBe(0);
  });

  test("positive control: a forked list (a bare TABS.map call) is actually detected", () => {
    const forked = `function AgenciaPanel(){\n{TABS.map(t=>1)}\n}\nfunction Other(){}`;
    expect(tabsMapCount(functionBody(forked, "AgenciaPanel"))).not.toBe(0);
  });

  test("MobileTabMenu is handed the same TABS/TAB_GROUPS identifiers, not a second copy", () => {
    const body = functionBody(AGENCIA, "AgenciaPanel");
    const at = body.indexOf("<MobileTabMenu ");
    expect(at).toBeGreaterThan(-1);
    const call = body.slice(at, body.indexOf("/>", at) + 2);
    expect(call).toMatch(/groups=\{TAB_GROUPS\}/);
    expect(call).toMatch(/tabs=\{TABS\}/);
  });

  test("the single render branches its style on the desktop check", () => {
    const body = functionBody(AGENCIA, "AgenciaPanel");
    const branches = [...body.matchAll(/isDesktop\s*\?/g)].length;
    // Container, topbar and content wrapper each still need their own
    // desktop/mobile style — one branch alone would mean something was
    // left unconverted or, worse, hard-coded to one shape.
    expect(branches).toBeGreaterThanOrEqual(4);
  });
});

describe("the prototype's desktop rules are present", () => {
  const body = functionBody(AGENCIA, "AgenciaPanel");

  test("the shell caps at the prototype's 1600px and centres", () => {
    expect(body).toMatch(/maxWidth:1600/);
  });

  test("the sidebar column is the prototype's 264px", () => {
    expect(body).toMatch(/264/);
    expect(body).toMatch(/gridTemplateColumns:"264px minmax\(0,\s*1fr\)"/);
  });

  test("the sidebar itself only renders on desktop", () => {
    expect(body).toMatch(/\{isDesktop&&\(\s*\n\s*<div style=\{\{/);
  });
});

describe("below 1024px, the horizontal tab strip is gone — replaced by the hamburger menu", () => {
  test("the old overflow-x scrolling row style no longer appears", () => {
    const body = functionBody(AGENCIA, "AgenciaPanel");
    expect(body).not.toMatch(
      /padding:"8px 12px",display:"flex",gap:SPACING\[4\],overflowX:"auto"/
    );
  });

  test("the old mobile nav button style (8px 16px padding, no min-height) no longer appears", () => {
    const body = functionBody(AGENCIA, "AgenciaPanel");
    expect(body).not.toMatch(/borderRadius:RADII\.md,padding:"8px 16px",cursor:"pointer",flexShrink:0,/);
  });

  test("a mobile-only hamburger button opens the menu", () => {
    const body = functionBody(AGENCIA, "AgenciaPanel");
    expect(body).toMatch(/\{!isDesktop&&\(/);
    expect(body).toMatch(/onClick=\{\(\)=>setMenuOpen\(true\)\}/);
  });

  test("MobileTabMenu is rendered, wired to the same tab state", () => {
    const body = functionBody(AGENCIA, "AgenciaPanel");
    expect(body).toMatch(/<MobileTabMenu open=\{menuOpen\}/);
    expect(body).toMatch(/activeTab=\{tab\}\s*onSelect=\{setTab\}/);
  });
});
