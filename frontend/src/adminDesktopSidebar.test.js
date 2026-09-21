import fs from "fs";
import path from "path";

// T3 of odd/tasks/desktop-shell.md: at 1024px and up, AdminPanel's fixed
// bottom TABS bar becomes a 264px sidebar instead of a fixed grid strip
// pinned to the bottom of the viewport. Structural, source-based
// assertions — no DOM renderer for Admin.jsx here (see
// jsxTagsAreBound.test.js / bottomNavSixItems.test.js for the same
// constraint solved the same way).
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

describe("one TABS array feeds both the mobile bar and the desktop sidebar", () => {
  function tabsMapCount(source) {
    return [...source.matchAll(/TABS\.map\(/g)].length;
  }

  test("AdminPanel renders TABS exactly once — the list is not forked", () => {
    const body = functionBody(ADMIN, "AdminPanel");
    expect(tabsMapCount(body)).toBe(1);
  });

  test("positive control: a forked list (two TABS.map calls) is actually detected", () => {
    const forked = `function AdminPanel(){\n{TABS.map(t=>1)}\n{TABS.map(t=>2)}\n}\nexport default function QuartzAdmin(){}`;
    expect(tabsMapCount(functionBody(forked, "AdminPanel"))).not.toBe(1);
  });

  test("the single render branches its style on the desktop check", () => {
    const body = functionBody(ADMIN, "AdminPanel");
    const branches = [...body.matchAll(/isDesktop\s*\?/g)].length;
    // Container, topbar, nav wrapper and nav button all need their own
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

describe("below 1024px, the mobile bar is byte-for-byte untouched", () => {
  test("the fixed-bottom, 6-column grid nav style still appears verbatim", () => {
    const body = functionBody(ADMIN, "AdminPanel");
    expect(body).toMatch(
      /position:"fixed",bottom:0,left:"50%",transform:"translateX\(-50%\)",\s*\n\s*width:"100%",maxWidth:620,background:"rgba\(6,6,18,0\.97\)",\s*\n\s*backdropFilter:"blur\(20px\)",borderTop:`1px solid \$\{Q\.border\}`,/
    );
    expect(body).toMatch(/display:"grid",gridTemplateColumns:"repeat\(6,1fr\)"/);
  });

  test("positive control: the same check fails against an altered mobile style", () => {
    const body = functionBody(ADMIN, "AdminPanel");
    const altered = body.replace('gridTemplateColumns:"repeat(6,1fr)"', "");
    expect(altered).not.toMatch(/display:"grid",gridTemplateColumns:"repeat\(6,1fr\)"/);
  });

  test("the mobile nav button keeps its column layout (icon over label)", () => {
    const body = functionBody(ADMIN, "AdminPanel");
    expect(body).toMatch(
      /minWidth:0,background:"transparent",border:"none",\s*\n\s*padding:"8px 4px 8px",cursor:"pointer",\s*\n\s*display:"flex",flexDirection:"column",alignItems:"center",gap:SPACING\[4\],/
    );
  });

  test("the content wrapper keeps its 140px bottom clearance for the fixed bar", () => {
    const body = functionBody(ADMIN, "AdminPanel");
    expect(body).toMatch(/paddingBottom:"calc\(140px \+ env\(safe-area-inset-bottom\)\)"/);
  });
});
