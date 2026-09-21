import fs from "fs";
import path from "path";

// T1 of odd/tasks/player-chrome-batch.md: `aplicarTema()` painted the
// document's background but never its text colour. With no colour
// declared anywhere up the tree, any element that relies on
// `currentColor` (every <Icon>, by design) resolved to the browser
// default — black — on a near-black background. 329 icons across the
// product had no explicit colour; two of them (the scanner's camera, the
// empty-state ticket in Boletos) were the reported symptom, but nothing
// says they were the only two.
//
// Structural, source-based assertion: the way boxIcons.test.js and
// screenHomeIconsAndAccents.test.js read this project's mega-components,
// since there is no DOM renderer for App.jsx/Web.jsx/Box.jsx here.
const SRC = path.resolve(__dirname);
const SCREENS = ["App.jsx", "Web.jsx", "Box.jsx"];

function aplicarTemaBody(source) {
  const start = source.indexOf("function aplicarTema(){");
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf("\n}", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + 2);
}

describe("aplicarTema declares the document's text colour, not only its background", () => {
  test.each(SCREENS)("%s's aplicarTema still paints the background", (name) => {
    const source = fs.readFileSync(path.join(SRC, name), "utf8");
    const body = aplicarTemaBody(source);
    expect(body).toMatch(/document\.body\.style\.background\s*=\s*Q\.void/);
  });

  test.each(SCREENS)("%s's aplicarTema now also paints the text colour", (name) => {
    const source = fs.readFileSync(path.join(SRC, name), "utf8");
    const body = aplicarTemaBody(source);
    expect(body).toMatch(/document\.body\.style\.color\s*=\s*Q\.text/);
  });

  test.each(SCREENS)("%s's aplicarTema keeps its try/catch shape — one declaration added, not reshaped", (name) => {
    const source = fs.readFileSync(path.join(SRC, name), "utf8");
    const body = aplicarTemaBody(source);
    // Exactly one try block: the fix adds a declaration, it does not
    // split the function into two guarded statements.
    expect((body.match(/\btry\{/g) || []).length).toBe(1);
    expect((body.match(/\}catch\(e\)\{\}/g) || []).length).toBe(1);
  });
});
