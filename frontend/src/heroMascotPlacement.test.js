// The prototype puts the mascot inside the hero panel, not above it:
// html/player-home.html's `.hero-balance` carries `.mascot-header` as a
// direct child, absolutely positioned, bleeding off the panel's right and
// bottom edges and clipped (html/styles.css:876-891):
//   .mascot-header { position:absolute; right:-33px; bottom:-56px;
//     width:185px; opacity:.96; z-index:2; clip-path:inset(0 0 13% 0); }
//   .hero-balance:has(.mascot-header) { min-height:244px; padding-right:166px; }
//
// This screen (App.jsx's ScreenHome) has no literal balance hero — the
// panel that plays that role here is "Bet Best" (Q.violet gradient,
// headline, CTA button), the first big panel after the top bar, the same
// structural shape the prototype's hero fills. The mascot used to sit in
// a flex strip above it instead; this pins it moving inside, at the
// prototype's own numbers.
//
// Real headless-Chromium layout (not jsdom, which computes no box sizes)
// against this exact markup and this screen's actual, longer copy
// confirmed those exact numbers keep the mascot's bounding box clear of
// the headline, the paragraph and the button, at both 360px and 320px
// viewport widths — see the T3 note in odd/tasks/home-homologation.md.
//
// Structural, source-based assertions: the way brandMarkReplacesText.test.js
// and topBarLogoSize.test.js read App.jsx, since there is no DOM renderer
// for it here.
const fs = require("fs");
const path = require("path");

const APP = fs.readFileSync(path.resolve(__dirname, "App.jsx"), "utf8");

function screenHomeBody() {
  const start = APP.indexOf("function ScreenHome");
  expect(start).toBeGreaterThan(-1);
  const end = APP.indexOf("\nfunction ", start);
  expect(end).toBeGreaterThan(start);
  return APP.slice(start, end);
}

describe("the mascot lives inside the hero panel, not in a strip above it", () => {
  const body = screenHomeBody();
  const heroStart = body.indexOf('onClick={()=>onNav("mejorar")}');

  test("there is no more flex strip placing the mascot above the hero", () => {
    expect(body).not.toMatch(/justifyContent:"flex-end",marginBottom:8/);
  });

  test("the hero panel (Bet Best) exists", () => {
    expect(heroStart).toBeGreaterThan(-1);
  });

  test("the mascot sits inside the hero panel, after its own opening tag", () => {
    const heroEnd = body.indexOf("\n      {/*", heroStart + 1); // next top-level comment block
    const heroBody = body.slice(heroStart, heroEnd > -1 ? heroEnd : undefined);
    expect(heroBody).toContain("<Mascot");
  });

  test("the mascot is placed exactly the way the prototype places it", () => {
    const mascotAt = body.indexOf("<Mascot", heroStart);
    expect(mascotAt).toBeGreaterThan(heroStart);
    const mascotTag = body.slice(mascotAt, body.indexOf("/>", mascotAt) + 2);
    expect(mascotTag).toMatch(/position:"absolute"/);
    expect(mascotTag).toMatch(/right:-33/);
    expect(mascotTag).toMatch(/bottom:-56/);
    expect(mascotTag).toMatch(/clipPath:"inset\(0 0 13% 0\)"/);
    // size is the mascot's own height prop; 275 is what makes BrandMark's
    // sibling helper (mascotAttributes, 540:802 ratio) round to a 185px
    // width — the prototype's own mascot-header width.
    expect(mascotTag).toMatch(/size=\{275\}/);
  });

  // The reserved height became conditional when the hero moved into a row
  // beside the three cards: on the desktop shell the row is taller, so the
  // cards beside it read as tall and narrow. The guarantee is unchanged —
  // the mascot never gets less room than the prototype gave it — so this
  // asserts the floor rather than one literal number.
  test("the panel reserves the prototype's own space for it", () => {
    const divStart = body.lastIndexOf("<div", heroStart);
    const svgStart = body.indexOf("<svg", divStart);
    const heroOpenTag = body.slice(divStart, svgStart);
    expect(heroOpenTag).toMatch(/paddingRight:166/);

    const heights = [...heroOpenTag.matchAll(/minHeight:(?:[^,]*?\?)?\s*(\d+)\s*(?::\s*(\d+))?/g)]
      .flatMap((m) => [m[1], m[2]])
      .filter(Boolean)
      .map(Number);
    expect(heights.length).toBeGreaterThan(0);
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(244);
  });

  test("positive control: a hero that reserves less than the prototype is caught", () => {
    const shrunk = "minHeight:isDesktopShell?340:200,";
    const heights = [...shrunk.matchAll(/minHeight:(?:[^,]*?\?)?\s*(\d+)\s*(?::\s*(\d+))?/g)]
      .flatMap((m) => [m[1], m[2]])
      .filter(Boolean)
      .map(Number);
    expect(Math.min(...heights)).toBeLessThan(244);
  });
});
