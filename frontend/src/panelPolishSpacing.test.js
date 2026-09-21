import fs from "fs";
import path from "path";

// T2 of odd/tasks/panel-polish.md: two spacing reports.
//
// 1. "The sidebar buttons touch the edge. Admin's do not." Checked
//    against Admin's own desktop sidebar button, the container padding
//    (24px/12px) is already identical between the two panels — what
//    Admin's button has and Agencia's does not is `minWidth:0` (so a
//    flex item can never be forced past the sidebar's inner edge by its
//    own content) and a transparent (not `Q.border`-coloured) inactive
//    border, which is what makes eighteen stacked outlined boxes read as
//    "boxed in against the edge" next to Admin's borderless list.
// 2. "The agency header is squashed" — the balance/name/code block is
//    two lines tall and the topbar had no explicit minimum height to
//    guarantee room for it.
//
// Structural, source-based assertions — no DOM renderer here (see
// jsxTagsAreBound.test.js for the same constraint solved the same way).
const AGENCIA = fs.readFileSync(path.resolve(__dirname, "Agencia.jsx"), "utf8");
const ADMIN = fs.readFileSync(path.resolve(__dirname, "Admin.jsx"), "utf8");

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const markers = ["\nfunction ", "\nexport default function "]
    .map((marker) => source.indexOf(marker, start + 1))
    .filter((i) => i > -1);
  const end = markers.length ? Math.min(...markers) : source.length;
  return source.slice(start, end);
}

describe("the desktop sidebar button matches Admin's edge safety", () => {
  test("Admin's desktop button already has minWidth:0 (reference)", () => {
    const body = functionBody(ADMIN, "AdminPanel");
    expect(body).toMatch(/minWidth:0,\s*\n\s*background:tab===t\.k/);
  });

  // odd/tasks/mobile-nav.md: this button now renders inside an
  // `{isDesktop&&(...)}` block — the sidebar's whole container no
  // longer mounts at all below 1024px, so the button's own style has no
  // mobile alternative left to branch on with a ternary.
  test("Agencia's desktop button still has minWidth:0", () => {
    const body = functionBody(AGENCIA, "AgenciaPanel");
    expect(body).toMatch(/<button key=\{t\.k\} onClick=\{\(\)=>setTab\(t\.k\)\} style=\{\{\s*\n\s*minWidth:0,/);
  });

  test("Agencia's desktop inactive border is transparent, matching Admin's, not Q.border", () => {
    const body = functionBody(AGENCIA, "AgenciaPanel");
    const desktopButton = body.slice(
      body.indexOf('<button key={t.k} onClick={()=>setTab(t.k)} style={{\n            minWidth:0'),
      body.indexOf('}}>', body.indexOf('<button key={t.k} onClick={()=>setTab(t.k)} style={{\n            minWidth:0'))
    );
    expect(desktopButton).toMatch(/border:`1px solid \$\{tab===t\.k\?Q\.violet:"transparent"\}`/);
  });
});

describe("the agency header has the height its content needs", () => {
  test("the desktop topbar declares an explicit minHeight", () => {
    const body = functionBody(AGENCIA, "AgenciaPanel");
    const desktopTopbar = body.slice(
      body.indexOf("isDesktop ? {background:Q.deep"),
      body.indexOf('} : {background:Q.deep,borderBottom:`1px solid ${Q.border}`,\n        padding:"12px 16px"')
    );
    expect(desktopTopbar).toMatch(/minHeight:64/);
  });
});

describe("below 1024px, the mobile styles this task touches are byte-for-byte untouched", () => {
  test("the mobile topbar style is unchanged (no minHeight, same padding)", () => {
    const body = functionBody(AGENCIA, "AgenciaPanel");
    expect(body).toMatch(
      /\} : \{background:Q\.deep,borderBottom:`1px solid \$\{Q\.border\}`,\s*\n\s*padding:"12px 16px",display:"flex",alignItems:"center",flexShrink:0,\s*\n\s*justifyContent:"space-between",zIndex:50,overflow:"hidden"\}\}>/
    );
  });

  test("positive control: the same check fails against an altered mobile topbar style", () => {
    const body = functionBody(AGENCIA, "AgenciaPanel");
    const altered = body.replace('justifyContent:"space-between",zIndex:50,overflow:"hidden"}}>', 'justifyContent:"space-between",zIndex:50}}>');
    expect(altered).not.toMatch(
      /\} : \{background:Q\.deep,borderBottom:`1px solid \$\{Q\.border\}`,\s*\n\s*padding:"12px 16px",display:"flex",alignItems:"center",flexShrink:0,\s*\n\s*justifyContent:"space-between",zIndex:50,overflow:"hidden"\}\}>/
    );
  });

  // odd/tasks/mobile-nav.md: the horizontal tab strip these two mobile
  // styles belonged to is gone, replaced by the hamburger's
  // MobileTabMenu overlay — see agenciaDesktopSidebar.test.js, which
  // guards the replacement.
  test("the old mobile nav button style (border colour Q.border, no minWidth) no longer appears", () => {
    const body = functionBody(AGENCIA, "AgenciaPanel");
    expect(body).not.toMatch(
      /border:`1px solid \$\{tab===t\.k\?Q\.violet:Q\.border\}`,\s*\n\s*borderRadius:RADII\.md,padding:"8px 16px",cursor:"pointer",flexShrink:0,/
    );
  });

  test("the old mobile nav container style (8/12 padding, overflow-x) no longer appears", () => {
    const body = functionBody(AGENCIA, "AgenciaPanel");
    expect(body).not.toMatch(
      /padding:"8px 12px",display:"flex",gap:SPACING\[4\],overflowX:"auto",\s*\n\s*flexShrink:0,zIndex:40,WebkitOverflowScrolling:"touch"/
    );
  });
});
