import fs from "fs";
import path from "path";
import { User } from "lucide-react";

// T3 of odd/tasks/player-chrome-batch.md — four small, unrelated fixes in
// App.jsx. Structural, source-based assertions — no DOM renderer for
// App.jsx here, the way boxIcons.test.js and screenHomeIconsAndAccents
// .test.js read this project's mega-components.
const APP = fs.readFileSync(path.resolve(__dirname, "App.jsx"), "utf8");

test("positive control: lucide-react actually exports a person icon", () => {
  // Icon.jsx's own 36-mark set has no single-person icon (only `users`,
  // a group), which is why this fix reaches for lucide-react.
  expect(User).toBeTruthy();
});

describe("the avatar beside the balance renders a person icon, not a dot", () => {
  function barraSuperiorBody() {
    const start = APP.indexOf("function BarraSuperior(");
    expect(start).toBeGreaterThan(-1);
    const end = APP.indexOf("\nfunction ", start);
    expect(end).toBeGreaterThan(start);
    return APP.slice(start, end);
  }

  test("the middle-dot fallback is gone", () => {
    expect(barraSuperiorBody()).not.toMatch(/\{ini\|\|"·"\}/);
  });

  test("the initial still renders when the account has a name", () => {
    // The fix is surgical: only the no-name fallback changes.
    expect(barraSuperiorBody()).toMatch(/\{ini\s*\?/);
  });

  test("the fallback branch renders the User icon", () => {
    expect(barraSuperiorBody()).toMatch(/<User\b/);
  });

  test("App.jsx imports User from lucide-react, named explicitly", () => {
    expect(APP).toMatch(/import\s*\{[^}]*\bUser\b[^}]*\}\s*from\s*"lucide-react";/);
  });
});

describe("the ✕ that removes a scanned image is round, not an oval", () => {
  function quitarImagenButton() {
    const at = APP.indexOf('onClick={()=>quitarImagen(i)}');
    expect(at).toBeGreaterThan(-1);
    const end = APP.indexOf("</button>", at);
    return APP.slice(at, end);
  }

  test("the button now declares its own padding", () => {
    // Width/height/border-radius alone deform under the browser's default
    // button padding; the fix is the missing declaration, nothing else.
    expect(quitarImagenButton()).toMatch(/padding:0\b/);
  });

  test("it keeps its 18×18 circular shape", () => {
    const button = quitarImagenButton();
    expect(button).toMatch(/width:18/);
    expect(button).toMatch(/height:18/);
    expect(button).toMatch(/borderRadius:"50%"/);
  });
});

describe("the Bet Builder cart sits above the bottom bar, not under it", () => {
  function carritoBlock() {
    const at = APP.indexOf("CARRITO VISIBLE fijo abajo");
    expect(at).toBeGreaterThan(-1);
    const end = APP.indexOf("}}>", at) + 3;
    return APP.slice(at, end);
  }

  test("it no longer pins to bottom:0", () => {
    expect(carritoBlock()).not.toMatch(/\bbottom:0\b/);
  });

  test("it starts where the bar's own height ends", () => {
    // BarraInferior is calc(68px + env(safe-area-inset-bottom)) tall
    // (App.jsx's own BarraInferior); the cart's bottom offset must match
    // it exactly, not approximate it with a guessed pixel value.
    expect(carritoBlock()).toMatch(
      /bottom:"calc\(68px \+ env\(safe-area-inset-bottom\)\)"/
    );
  });
});

describe("Bet Builder's header no longer carries its emoji", () => {
  test("the tools emoji is gone from the header", () => {
    // docs/icon-inventory.md marks 🛠️ as "none — no tools": the icon set
    // has nothing that draws a wrench, so the fix removes the emoji
    // rather than reaching for an approximation.
    expect(APP).not.toMatch(/🛠️\s*Bet Builder/);
  });

  test("the plain label survives", () => {
    expect(APP).toMatch(/>Bet Builder</);
  });
});
