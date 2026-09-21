import fs from "fs";
import path from "path";

// T3 of odd/tasks/panel-polish.md: both panels capped their content at
// maxWidth:620 unconditionally — the "mobile inside desktop" the owner
// reported, since the shell itself is up to 1600px wide next to a 264px
// sidebar. The cap rises to 1100px on desktop only; below 1024px it stays
// exactly 620, unchanged.
//
// 1100 was chosen deliberately, not maximised: this is a wider single
// column, not a two-column distributed layout (that is out of scope —
// see odd/tasks/panel-polish.md's "Scope" section), and long text lines
// are genuinely harder to read, which is why the prototype caps its own
// panels too. 1100px leaves roughly 118px of breathing room on each side
// of the ~1336px column available next to the 264px sidebar on the
// prototype's own 1600px shell, instead of stretching edge-to-edge.
//
// Structural, source-based assertions — no DOM renderer here.
const AGENCIA = fs.readFileSync(path.resolve(__dirname, "Agencia.jsx"), "utf8");
const ADMIN = fs.readFileSync(path.resolve(__dirname, "Admin.jsx"), "utf8");
const DESKTOP_CAP = 1100;

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const markers = ["\nfunction ", "\nexport default function "]
    .map((marker) => source.indexOf(marker, start + 1))
    .filter((i) => i > -1);
  const end = markers.length ? Math.min(...markers) : source.length;
  return source.slice(start, end);
}

describe("the content column widens on desktop, in both panels", () => {
  test("Agencia's content wrapper branches on isDesktop with the new cap", () => {
    const body = functionBody(AGENCIA, "AgenciaPanel");
    expect(body).toMatch(
      new RegExp(`style=\\{isDesktop \\? \\{padding:"16px 12px",maxWidth:${DESKTOP_CAP},margin:"0 auto"`)
    );
  });

  test("Admin's desktop content wrapper uses the new cap", () => {
    const body = functionBody(ADMIN, "AdminPanel");
    expect(body).toMatch(
      new RegExp(`style=\\{isDesktop \\? \\{padding:"16px",maxWidth:${DESKTOP_CAP},margin:"0 auto"`)
    );
  });

  test("positive control: a cap that never rose (still 620 on desktop) is detected as wrong", () => {
    const stillNarrow = 'style={isDesktop ? {padding:"16px",maxWidth:620,margin:"0 auto"';
    expect(stillNarrow).not.toMatch(new RegExp(`maxWidth:${DESKTOP_CAP}`));
  });
});

describe("below 1024px, the content stays capped at the original 620px, byte for byte", () => {
  test("Agencia's mobile content wrapper is unchanged", () => {
    const body = functionBody(AGENCIA, "AgenciaPanel");
    expect(body).toMatch(
      /\} : \{padding:"16px 12px",maxWidth:620,margin:"0 auto",\s*\n\s*paddingBottom:"calc\(28px \+ env\(safe-area-inset-bottom\)\)"\}\}>/
    );
  });

  test("Admin's mobile content wrapper is unchanged", () => {
    const body = functionBody(ADMIN, "AdminPanel");
    expect(body).toMatch(
      /\} : \{padding:"16px",maxWidth:620,margin:"0 auto",\s*\n\s*position:"relative",zIndex:1,\s*\n\s*paddingBottom:"calc\(140px \+ env\(safe-area-inset-bottom\)\)"\}\}>/
    );
  });

  test("positive control: the same Admin check fails against an altered mobile wrapper", () => {
    const body = functionBody(ADMIN, "AdminPanel");
    const altered = body.replace('paddingBottom:"calc(140px + env(safe-area-inset-bottom))"}}>', 'paddingBottom:"40px"}}>');
    expect(altered).not.toMatch(
      /\} : \{padding:"16px",maxWidth:620,margin:"0 auto",\s*\n\s*position:"relative",zIndex:1,\s*\n\s*paddingBottom:"calc\(140px \+ env\(safe-area-inset-bottom\)\)"\}\}>/
    );
  });
});
