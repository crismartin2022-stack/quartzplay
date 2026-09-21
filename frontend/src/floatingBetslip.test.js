import fs from "fs";
import path from "path";

// T6 of odd/tasks/player-chrome-batch.md: a floating betslip on sport
// screens. builderPicks already lives in the root component (survives
// navigation); nothing showed it before this. It takes the corner the
// Ayuda bubble vacated in T5, so the two never compete, and tapping it
// returns to the bet summary. Not on casino screens (owner's call), not
// on builder itself (the player is already looking at the slip there).
//
// Structural, source-based assertions — no DOM renderer for App.jsx here.
const APP = fs.readFileSync(path.resolve(__dirname, "App.jsx"), "utf8");

function functionBody(name) {
  const start = APP.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const end = APP.indexOf("\nfunction ", start);
  expect(end).toBeGreaterThan(start);
  return APP.slice(start, end);
}

describe("the floating betslip only shows with picks, off casino and builder", () => {
  function mountSite() {
    const at = APP.indexOf("<BurbujaBetslip");
    expect(at).toBeGreaterThan(-1);
    return APP.slice(Math.max(0, at - 300), at + 200);
  }

  test("it renders BurbujaBetslip", () => {
    expect(APP).toMatch(/<BurbujaBetslip\b/);
  });

  test("it is gated on builderPicks.length > 0", () => {
    expect(mountSite()).toMatch(/builderPicks\.length\s*>\s*0/);
  });

  test("it is hidden on exactly casino, casinovivo and builder — nowhere else", () => {
    const site = mountSite();
    const match = site.match(/\[("(?:casino|casinovivo|builder)"(?:,\s*"(?:casino|casinovivo|builder)")*)\]\.includes\(screen\)/);
    expect(match).toBeTruthy();
    const listed = match[1].match(/"(\w+)"/g).map((s) => s.replace(/"/g, ""));
    expect(listed.sort()).toEqual(["builder", "casino", "casinovivo"]);
    // The list must be negated, not required — the bubble hides on these
    // screens, it does not require one of them.
    expect(site).toMatch(/!\[.*\]\.includes\(screen\)/);
  });
});

describe("BurbujaBetslip", () => {
  function body() {
    return functionBody("BurbujaBetslip");
  }

  test("tapping it returns to the builder screen", () => {
    // The component itself only exposes onAbrir; the navigation target is
    // asserted at the call site below.
    const signature = body().slice(0, body().indexOf(")"));
    expect(signature).toMatch(/onAbrir/);
  });

  test("it takes the exact corner the Ayuda bubble vacated", () => {
    const b = body();
    expect(b).toMatch(/right:14/);
    expect(b).toMatch(/bottom:"calc\(84px \+ env\(safe-area-inset-bottom\)\)"/);
    expect(b).toMatch(/zIndex:150/);
  });

  test("it shows how many events are in the slip", () => {
    expect(body()).toMatch(/\{count\}/);
  });
});

describe("the call site wires the pick count and navigates to builder", () => {
  test("count comes from builderPicks.length", () => {
    const at = APP.indexOf("<BurbujaBetslip");
    const call = APP.slice(at, APP.indexOf("/>", at) + 2);
    expect(call).toMatch(/count=\{builderPicks\.length\}/);
  });

  test("opening it sets the screen to builder", () => {
    const at = APP.indexOf("<BurbujaBetslip");
    const call = APP.slice(at, APP.indexOf("/>", at) + 2);
    expect(call).toMatch(/onAbrir=\{[^}]*setScreen\("builder"\)/);
  });
});
