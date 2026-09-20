// The screens used to write their font-family inline, naming typefaces the
// app never serves: App.jsx and Box.jsx asked for `'Inter',system-ui`, and
// Admin.jsx and Agencia.jsx asked for `'Space Grotesk',system-ui`. fonts.css
// declares @font-face only for Poppins. Every one of those sites rendered in
// system-ui — the viewer's operating-system default — instead of the brand
// typeface. The fix is mechanical: the family comes from the theme module's
// F_BODY/F_NUM constants, never from a literal.
//
// Read from source, the way theme.test.js and noThemeSwitch.test.js do:
// this project has no testing-library, so the screens are checked as text.
//
// Admin.jsx and Agencia.jsx were the internal panels, still on their own
// unserved typeface. The owner decided on 2026-09-20 that they adopt Poppins
// like the player-facing screens, rather than actually shipping Space
// Grotesk: one visual system, and no extra font download on every load.
import fs from "fs";
import path from "path";

const SRC = path.resolve(__dirname);

// Every screen whose font-family is expected to come from the theme module.
const CLEAN_SCREENS = ["App.jsx", "Web.jsx", "Casino.jsx", "Box.jsx", "Admin.jsx", "Agencia.jsx"];

const sourceOf = (file) => fs.readFileSync(path.join(SRC, file), "utf8");

describe.each(CLEAN_SCREENS)("%s takes its typeface from the theme", (file) => {
  const source = sourceOf(file);

  test("does not hardcode the Inter/system-ui font-family string", () => {
    expect(source).not.toMatch(/fontFamily\s*:\s*["']'Inter',\s*system-ui["']/);
  });

  test("does not name Inter as a font-family in any shape", () => {
    // Broader than the exact literal above: no style object may name Inter
    // as a font-family value in any quoting or spacing variant.
    expect(source).not.toMatch(
      /fontFamily\s*:\s*"[^"]*Inter[^"]*"|fontFamily\s*:\s*'[^']*Inter[^']*'/
    );
  });

  test("does not name Space Grotesk as a font-family either", () => {
    // The same defect under a different name, kept out of the clean screens
    // so it cannot spread from the panels that still carry it.
    expect(source).not.toMatch(/fontFamily\s*:\s*["'][^"']*Space Grotesk[^"']*["']/);
  });

  test("still uses the theme's font constants", () => {
    // A positive control: proves the file has font-family sites at all, so
    // the checks above are testing something rather than passing on a file
    // that simply never sets a font.
    expect(source).toMatch(/fontFamily\s*:\s*F_(BODY|NUM)/);
    expect(source).toMatch(/import\s*\{[^}]*\bF_(BODY|NUM)\b[^}]*\}\s*from\s*"\.\/theme"/s);
  });
});
