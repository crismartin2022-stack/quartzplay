import fs from "fs";
import path from "path";

// T2 of odd/tasks/desktop-shell.md: at 1024px and up, AgenciaPanel's
// TABS row becomes a 264px sidebar instead of a horizontally-scrolling
// row. Structural, source-based assertions — no DOM renderer for
// Agencia.jsx here (see jsxTagsAreBound.test.js / bottomNavSixItems.test.js
// for the same constraint solved the same way).
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

describe("one TABS array feeds both the mobile row and the desktop sidebar", () => {
  function tabsMapCount(source) {
    return [...source.matchAll(/TABS\.map\(/g)].length;
  }

  test("AgenciaPanel renders TABS exactly once — the list is not forked", () => {
    const body = functionBody(AGENCIA, "AgenciaPanel");
    expect(tabsMapCount(body)).toBe(1);
  });

  test("positive control: a forked list (two TABS.map calls) is actually detected", () => {
    const forked = `function AgenciaPanel(){\n{TABS.map(t=>1)}\n{TABS.map(t=>2)}\n}\nfunction Other(){}`;
    expect(tabsMapCount(functionBody(forked, "AgenciaPanel"))).not.toBe(1);
  });

  test("the single render branches its style on the desktop check", () => {
    const body = functionBody(AGENCIA, "AgenciaPanel");
    const branches = [...body.matchAll(/isDesktop\s*\?/g)].length;
    // Container, topbar, nav wrapper and nav button all need their own
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
});

describe("below 1024px, the mobile row is byte-for-byte untouched", () => {
  test("the original overflow-x scrolling row style still appears verbatim", () => {
    const body = functionBody(AGENCIA, "AgenciaPanel");
    expect(body).toMatch(
      /padding:"8px 12px",display:"flex",gap:SPACING\[4\],overflowX:"auto",\s*\n\s*flexShrink:0,zIndex:40,WebkitOverflowScrolling:"touch"/
    );
  });

  test("positive control: the same check fails against an altered mobile style", () => {
    const body = functionBody(AGENCIA, "AgenciaPanel");
    const altered = body.replace(
      'flexShrink:0,zIndex:40,WebkitOverflowScrolling:"touch"',
      'flexShrink:0,zIndex:40'
    );
    expect(altered).not.toMatch(
      /padding:"8px 12px",display:"flex",gap:SPACING\[4\],overflowX:"auto",\s*\n\s*flexShrink:0,zIndex:40,WebkitOverflowScrolling:"touch"/
    );
  });

  test("the mobile nav button style (8px 16px padding, no min-height) is untouched", () => {
    const body = functionBody(AGENCIA, "AgenciaPanel");
    expect(body).toMatch(/borderRadius:RADII\.md,padding:"8px 16px",cursor:"pointer",flexShrink:0,/);
  });
});
