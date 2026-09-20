// App.jsx used to write `fontFamily:"'Inter',system-ui"` inline in about 365
// style objects. Inter is never served — fonts.css only declares @font-face
// for Poppins — so every one of those sites rendered in system-ui instead
// of the brand typeface. The fix is mechanical: replace the hardcoded
// literal with the imported F_BODY constant everywhere it appears.
//
// Read the way theme.test.js and noThemeSwitch.test.js read App.jsx: from
// source, since there is no testing-library in this project. This test
// pins the absence of the hardcoded literal so it cannot come back.
import fs from "fs";
import path from "path";

const SRC = path.resolve(__dirname);
const appSource = fs.readFileSync(path.join(SRC, "App.jsx"), "utf8");

describe("App.jsx has no hardcoded font-family literal", () => {
  test("does not hardcode the Inter/system-ui font-family string", () => {
    expect(appSource).not.toMatch(/fontFamily\s*:\s*["']'Inter',\s*system-ui["']/);
  });

  test("does not hardcode 'Inter' as a font-family anywhere, in any shape", () => {
    // Broader than the exact literal above: no style object should name
    // Inter as a font-family value in any quoting/spacing variant. It must
    // come from the theme module's F_BODY constant instead. This does not
    // reach the two unrelated, pre-existing literals in this file —
    // `monospace` on the error boundary's stack-trace display, and the
    // `system-ui` fallback on the registration wrapper — which name a
    // different typeface on purpose and are out of this change's scope.
    expect(appSource).not.toMatch(/fontFamily\s*:\s*"[^"]*Inter[^"]*"|fontFamily\s*:\s*'[^']*Inter[^']*'/);
  });

  test("still uses the theme's font constants", () => {
    // A positive control: proves the file still has font-family sites at
    // all, so the checks above are testing something rather than passing
    // on an empty file.
    expect(appSource).toMatch(/fontFamily\s*:\s*F_BODY/);
    expect(appSource).toMatch(/import\s*\{[^}]*\bF_BODY\b[^}]*\}\s*from\s*"\.\/theme"/s);
  });
});
