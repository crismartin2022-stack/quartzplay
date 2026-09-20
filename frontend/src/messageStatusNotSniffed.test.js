// A message's colour used to come from reading the first character of its
// own text: `msg.startsWith("✅") ? Q.green : Q.red`. It worked only because
// every setMsg call in the two components that did this happened to prefix
// "✅" on success and "⚠️" on failure — a convention nothing enforced. The
// day the emoji move out of the text (the icon migration this guard exists
// for), every message in those components turns red, including successful
// ones. The fix moves the status into its own piece of state; this test
// keeps the sniffing pattern from coming back, in any shape it could take —
// a style object, a bare JSX colour prop, single or double quotes.
//
// Read from source, the way theme.test.js and noThemeSwitch.test.js do:
// this project has no testing-library, so the screen is checked as text.
import fs from "fs";
import path from "path";

const SRC = path.resolve(__dirname);
const source = fs.readFileSync(path.join(SRC, "App.jsx"), "utf8");

// Matches `.startsWith("✅")` / `.startsWith('✅')` with any whitespace, used
// as a boolean to pick between two things — the shape a colour decision
// takes whether it sits inside a style object or is passed as a bare prop.
const SNIFFS_STATUS_EMOJI = /\.startsWith\(\s*["']✅["']\s*\)/;

// Broader still: any `.startsWith` call reading either status glyph, not
// just the exact "✅" one used today, so a rewrite that keys off the warning
// icon instead does not slip past this guard.
const SNIFFS_EITHER_STATUS_GLYPH = /\.startsWith\(\s*["'](?:✅|⚠️)["']\s*\)/;

describe("App.jsx no longer decides a message's colour from its own text", () => {
  test("there is something to check: the guard's own pattern can match", () => {
    // Positive control. Proves SNIFFS_STATUS_EMOJI is capable of matching,
    // so the assertions below are testing something rather than a regex
    // that can never fire.
    expect("msg.startsWith(\"✅\")").toMatch(SNIFFS_STATUS_EMOJI);
    expect("msg.startsWith('✅')").toMatch(SNIFFS_STATUS_EMOJI);
  });

  test("does not call .startsWith(\"✅\") anywhere", () => {
    expect(source).not.toMatch(SNIFFS_STATUS_EMOJI);
  });

  test("does not call .startsWith on either status glyph anywhere", () => {
    expect(source).not.toMatch(SNIFFS_EITHER_STATUS_GLYPH);
  });

  test("CrearDesafio and PanelIacoin still carry the ✅/⚠️ prefixes in their messages", () => {
    // The emoji stay in the message text for now — only the colour decision
    // moves. This is the next slice's job, not this one's.
    expect(source).toMatch(/✅ "\+\(d\.aviso/);
    expect(source).toMatch(/⚠️ "\+e\.message/);
  });
});
