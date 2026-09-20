// The prototype's `.brand img` is 82px wide (html/styles.css:180-184), and
// at the shipped logo's own 503:244 ratio (see BrandMark.test.js, which
// reads the PNG's IHDR chunk directly) that is 82 * 244/503 ≈ 39.77px
// tall, rounded to 40 — BrandMark takes a height, so the top bar (App.jsx's
// BarraSuperior) has to ask for size={40} to draw the mark at its real
// size, not the 20px it drew before.
//
// Measured with headless Chromium (real layout, not jsdom, which does not
// compute box heights) against the exact markup and inline styles
// BarraSuperior renders: at the old padding (9px top/bottom), a 40px-tall
// logo makes the row 59px instead of 51px, because it is taller than the
// 32px avatar circle that used to be the tallest thing in the row. Cutting
// the row's vertical padding to 5px top/bottom brings it back to exactly
// 51px — the same height the bar had before this change, on a 360px-wide
// phone viewport.
//
// Structural, source-based assertions: the way brandMarkReplacesText.test.js
// and emptyStatesShowMascot.test.js read App.jsx, since there is no DOM
// renderer for it here.
const fs = require("fs");
const path = require("path");

const APP = fs.readFileSync(path.resolve(__dirname, "App.jsx"), "utf8");

function barraSuperiorBody() {
  const start = APP.indexOf("function BarraSuperior");
  expect(start).toBeGreaterThan(-1);
  const end = APP.indexOf("\nfunction ", start);
  expect(end).toBeGreaterThan(start);
  return APP.slice(start, end);
}

describe("the top bar draws the mark at the prototype's real size", () => {
  const body = barraSuperiorBody();

  test("BrandMark is asked for a 40px-tall mark, not 20", () => {
    expect(body).toMatch(/<BrandMark\s+size=\{40\}\s*\/>/);
  });

  test("the row's vertical padding was cut to keep the bar the height it already was", () => {
    // 9px top/bottom (the old value) would make the row 59px once the logo
    // is 40px tall; 5px keeps it at 51px, unchanged from before.
    expect(body).not.toMatch(/padding:"9px 13px/);
    expect(body).toMatch(/padding:"5px 13px 5px"/);
  });
});
