import fs from "fs";
import path from "path";

// T4 of odd/tasks/page-headers.md: every one of the panels' 29 tab
// components must render <PageHeader/> in its opening view, except two
// named below. Both exceptions are asserted, not merely excluded, so
// neither can rot into an accidental omission.
//
//   global — opens on the dashboard's own KPI grid, which is its hero.
//   chat   — its three buttons already name the three things a header
//            would describe, and its sub-views are chat viewports sized
//            from the viewport height, so a header would cost them a
//            permanent strip of conversation to restate those buttons.
//
// The obvious guard — scanning for the fontWeight:700,fontSize:15 title
// pattern PageHeader itself renders with — does not work: 18 legitimate,
// unrelated uses of that exact pattern remain in Agencia.jsx alone (a
// card title, a bet amount, a betting odd, a sub-view heading — this
// codebase's general emphasis size, not a page-header signature). This
// guard asserts the outcome instead: each tab component's body contains
// a literal <PageHeader usage.
//
// Structural, source-based — no DOM renderer for these panels here (see
// sidebarGroupKeysMatchTabs.test.js for the same constraint solved the
// same way). The tab -> component mapping is read from the actual
// dispatch lists in the source, not pasted in by hand, so a real edit to
// either dispatch list is what this test sees.

const SRC = path.resolve(__dirname);
const AGENCIA = fs.readFileSync(path.join(SRC, "Agencia.jsx"), "utf8");
const ADMIN = fs.readFileSync(path.join(SRC, "Admin.jsx"), "utf8");

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

// The `{tab==="key" && <Component .../>}` shape both panels' dispatch
// lists use.
function keysAndComponentsFromDispatch(dispatchText) {
  return [...dispatchText.matchAll(/\{tab===["'](\w+)["']\s*&&\s*<(\w+)/g)].map(
    (m) => ({ key: m[1], component: m[2] })
  );
}

// The Agencia panel's dispatch sits inside its own <CazaError> block;
// the same file has a second, unrelated dispatch further down for the
// influencer panel, so this is bounded to just the agency one.
const agenciaDispatch = sliceBetween(AGENCIA, '{tab==="codigo"', "</CazaError>");
// Admin has a single dispatch list; bounded to just past its last entry
// (where the sidebar layout markup starts) so nothing after it leaks in.
const adminDispatch = sliceBetween(
  ADMIN,
  '{tab==="global"   &&<TabGlobal',
  'gridColumn:"1",gridRow:"1 / span 2"'
);

const TABS = [
  ...keysAndComponentsFromDispatch(agenciaDispatch).map((t) => ({
    ...t, file: "Agencia.jsx", source: AGENCIA,
  })),
  ...keysAndComponentsFromDispatch(adminDispatch).map((t) => ({
    ...t, file: "Admin.jsx", source: ADMIN,
  })),
];

// Isolates one top-level `function Name(...){ ... }` declaration's body,
// from its own header up to the next top-level function declaration (or
// EOF). Every tab component in both files is declared this way.
function extractFunctionBody(source, componentName) {
  const startRe = new RegExp(`^function ${componentName}\\(`, "m");
  const startMatch = startRe.exec(source);
  if (!startMatch) return null;
  const start = startMatch.index;
  const nextFnRe = /^function \w+\(/gm;
  nextFnRe.lastIndex = start + 1;
  const nextMatch = nextFnRe.exec(source);
  const end = nextMatch ? nextMatch.index : source.length;
  return source.slice(start, end);
}

// True if the component's body renders <PageHeader, following one level
// of bare delegation when it does not: a body whose only `return <X/>`
// is its single statement (e.g. TabBilletera, which renders nothing of
// its own — `return <TabPSP .../>;` — its header lives in TabPSP).
// Bodies with more than one such return (an early sub-view branch ahead
// of the real opening-view return, e.g. TabUsuarios/FichaCliente) are
// never bare delegates and are not followed — they are expected to
// contain <PageHeader directly, checked above.
function rendersPageHeader(source, componentName, depth = 0) {
  if (depth > 3) return false;
  const body = extractFunctionBody(source, componentName);
  if (body == null) return false;
  if (body.includes("<PageHeader")) return true;
  const returns = [...body.matchAll(/return\s*<([A-Z]\w*)\b/g)];
  if (returns.length === 1 && returns[0][1] !== componentName) {
    return rendersPageHeader(source, returns[0][1], depth + 1);
  }
  return false;
}

describe("the matcher can see the dispatch lists at all", () => {
  test("both panels' dispatch lists were read and add up to 29 tabs", () => {
    expect(TABS.length).toBe(29);
  });
});

const EXCEPTIONS = {
  global: "TabGlobal",
  chat: "PanelComunicacion",
};

describe("every tab component renders a PageHeader in its opening view", () => {
  const requiredTabs = TABS.filter((t) => !(t.key in EXCEPTIONS));

  test.each(requiredTabs.map((t) => [`${t.file} ${t.key} -> ${t.component}`, t]))(
    "%s",
    (_label, t) => {
      expect(rendersPageHeader(t.source, t.component)).toBe(true);
    }
  );
});

describe("the two named exceptions", () => {
  test.each(Object.entries(EXCEPTIONS))(
    "%s deliberately has no PageHeader",
    (key, component) => {
      const tab = TABS.find((t) => t.key === key);
      expect(tab).toBeDefined();
      expect(tab.component).toBe(component);
      // Honesty check, not just the exclusion above: if either ever
      // started rendering a PageHeader, this catches it.
      expect(rendersPageHeader(tab.source, tab.component)).toBe(false);
    }
  );
});

describe("positive control: the matcher actually finds components", () => {
  test("a synthetic component with <PageHeader is detected", () => {
    const fixture = [
      'function FakeTab({ x }){',
      '  return(',
      '    <div>',
      '      <PageHeader title="Fake"/>',
      '    </div>',
      '  );',
      '}',
      'function NextThing(){',
      '  return null;',
      '}',
      '',
    ].join("\n");
    expect(rendersPageHeader(fixture, "FakeTab")).toBe(true);
  });

  test("a synthetic component without <PageHeader is correctly rejected", () => {
    const fixture = [
      'function FakeTab({ x }){',
      '  return(',
      '    <div>',
      '      <div>No header here</div>',
      '    </div>',
      '  );',
      '}',
      '',
    ].join("\n");
    expect(rendersPageHeader(fixture, "FakeTab")).toBe(false);
  });

  test("a synthetic bare delegate is followed to the component that actually renders the header", () => {
    const fixture = [
      'function FakeDelegate({ x }){',
      '  return <FakeReal x={x}/>;',
      '}',
      'function FakeReal({ x }){',
      '  return(',
      '    <div>',
      '      <PageHeader title="Real"/>',
      '    </div>',
      '  );',
      '}',
      '',
    ].join("\n");
    expect(rendersPageHeader(fixture, "FakeDelegate")).toBe(true);
  });

  test("a synthetic component with an early sub-view return is not treated as a bare delegate", () => {
    const fixture = [
      'function FakeTab({ sel }){',
      '  if(sel) return <FakeSubView/>;',
      '  return(',
      '    <div>',
      '      <div>Still no header here</div>',
      '    </div>',
      '  );',
      '}',
      '',
    ].join("\n");
    expect(rendersPageHeader(fixture, "FakeTab")).toBe(false);
  });
});
