import fs from "fs";
import path from "path";

// T2 of odd/tasks/player-chrome-batch.md: GCard's `glow` prop drew a 2px
// gradient bar (`position:absolute; top:0; left:0; right:0`) on top of a
// card with `borderRadius:12` and `overflow:visible`. The bar cannot
// follow the rounded corner and cannot be clipped, so it jutted out at
// both top corners — reported three times from different screens because
// all 30 `glow` call sites share this one component.
//
// Owner's decision, verbatim: "No nos compliquemos quiero un borde
// simple, conservando el color que corresponda." The border already
// changes colour with `glow` (`glow?glow+"55":Q.border`); the fix is to
// delete the bar and keep that border, nothing else.
//
// Structural, source-based assertion — no DOM renderer for App.jsx here.
const APP = fs.readFileSync(path.resolve(__dirname, "App.jsx"), "utf8");

function gCardBody() {
  const start = APP.indexOf("function GCard(");
  expect(start).toBeGreaterThan(-1);
  const end = APP.indexOf("\nfunction ", start);
  expect(end).toBeGreaterThan(start);
  return APP.slice(start, end);
}

describe("GCard draws a simple border for glow, not a bar", () => {
  test("the border still carries the glow colour, at the same alpha, when glow is set", () => {
    const body = gCardBody();
    expect(body).toMatch(/border:`1px solid \$\{glow\?glow\+"55":Q\.border\}`/);
  });

  test("the 2px absolute-positioned glow bar is gone", () => {
    const body = gCardBody();
    expect(body).not.toMatch(/position:"absolute",top:0,left:0,right:0,height:2/);
    expect(body).not.toMatch(/linear-gradient\(90deg,\$\{glow\},transparent\)/);
  });

  test("glow no longer renders a second element — only the card's own div", () => {
    const body = gCardBody();
    // The only JSX element this component returns is its own <div>;
    // a leftover `{glow&&<div` would be a second one.
    expect(body).not.toMatch(/\{glow&&</);
  });
});

describe("all 30 call sites keep asking for glow the same way", () => {
  test("the call-site count did not drop — this is a component fix, not a callers' cleanup", () => {
    const uses = (APP.match(/<GCard\b[^>]*\bglow=/g) || []).length;
    expect(uses).toBeGreaterThanOrEqual(30);
  });
});
