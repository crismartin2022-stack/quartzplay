import fs from "fs";
import path from "path";

// The document's background and text colour are declared once, in the entry
// point, for every screen the app can mount.
//
// The first version of this fix put the declaration inside `aplicarTema()`,
// and this test pinned that function in App.jsx, Web.jsx and Box.jsx. Both
// were wrong in the same way: **those are the only three screens that had
// such a function**. Casino.jsx, Agencia.jsx and Admin.jsx never did, so they
// kept inheriting the browser's default black on a near-black background —
// and a test that only reads three files can never notice the other three.
//
// The symptom was visible and reported: drawn icons rendering black in the
// admin panel's bottom bar. The cause is that `Icon` defaults to
// `currentColor` — correct, an icon should take the colour of the text it
// sits beside — and there was no current colour to take.
//
// So the assertion moved to where the truth is: `index.js` mounts all six
// screens, and declaring it there covers every one of them, including
// anything a screen renders outside its own root element.
const SRC = path.resolve(__dirname);

const entry = fs.readFileSync(path.join(SRC, "index.js"), "utf8");
const SCREENS = [
  "App.jsx",
  "Web.jsx",
  "Box.jsx",
  "Casino.jsx",
  "Agencia.jsx",
  "Admin.jsx",
];

describe("the entry point declares the document's colours", () => {
  test("it reads them from the theme rather than repeating hex values", () => {
    expect(entry).toMatch(/import\s*\{[^}]*\boscuro\b[^}]*\}\s*from\s*["']\.\/theme["']/);
  });

  test("it paints the background", () => {
    expect(entry).toMatch(/document\.body\.style\.background\s*=\s*oscuro\.void/);
  });

  test("it paints the text colour", () => {
    // The one that was missing, and the reason icons rendered black.
    expect(entry).toMatch(/document\.body\.style\.color\s*=\s*oscuro\.text/);
  });

  test("it runs before the first render", () => {
    // Declared above createRoot: a colour applied after the first paint
    // would still flash black text on the screens that set none.
    const declaration = entry.indexOf("document.body.style.color");
    const render = entry.indexOf("createRoot");
    expect(declaration).toBeGreaterThan(-1);
    expect(render).toBeGreaterThan(-1);
    expect(declaration).toBeLessThan(render);
  });
});

describe("no screen keeps its own copy of the declaration", () => {
  // Two places declaring the same thing is how they drift apart. The
  // per-screen `aplicarTema()` became redundant the moment the entry point
  // took this over, and it ran on every render to do it.
  test.each(SCREENS)("%s does not declare document.body colours itself", (name) => {
    const source = fs.readFileSync(path.join(SRC, name), "utf8");
    expect(source).not.toMatch(/document\.body\.style\.(color|background)\s*=/);
  });

  test("the entry point is the one place that does", () => {
    // Positive control: proves the matcher above can actually match, so the
    // six assertions are not passing against a pattern that never fires.
    expect(entry).toMatch(/document\.body\.style\.(color|background)\s*=/);
  });
});
