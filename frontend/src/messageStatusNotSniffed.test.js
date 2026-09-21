// A message's colour used to come from reading the first character of its
// own text: `msg.startsWith("✅") ? Q.green : Q.red`. It worked only because
// every setMsg call in the components that did this happened to prefix "✅"
// on success and "⚠️" on failure — a convention nothing enforced. The day
// the emoji move out of the text (the icon migration this guard exists for),
// every message in those components turns red, including successful ones.
// The fix moves the status into its own piece of state; this test keeps the
// sniffing pattern from coming back, in any shape it could take — a style
// object, a bare JSX colour prop, single or double quotes.
//
// Read from source, the way theme.test.js and noThemeSwitch.test.js do:
// this project has no testing-library, so the screens are checked as text.
//
// Admin.jsx (17 sites) was the last screen still carrying the pattern; with
// it fixed, nothing in the product decides a message's colour by reading
// its own text anymore, and the emoji-to-icon migration is safe to start.
import fs from "fs";
import path from "path";

const SRC = path.resolve(__dirname);

// The screens whose messages already carry their own status.
const FIXED_SCREENS = ["App.jsx", "Web.jsx", "Agencia.jsx", "Admin.jsx"];

// Files where message-status-colour has now reached every message display,
// so no ✅/⚠️ prefix remains anywhere in the file.
const EMOJI_PREFIX_FULLY_RETIRED = ["App.jsx", "Web.jsx"];

const sourceOf = (file) => fs.readFileSync(path.join(SRC, file), "utf8");

// Matches `.startsWith("✅")` / `.startsWith('✅')` with any whitespace, used
// as a boolean to pick between two things — the shape a colour decision
// takes whether it sits inside a style object or is passed as a bare prop.
const SNIFFS_STATUS_EMOJI = /\.startsWith\(\s*["']✅["']\s*\)/;

// Broader still: any `.startsWith` call reading either status glyph, not
// just the exact "✅" one used today, so a rewrite that keys off the warning
// icon instead does not slip past this guard.
const SNIFFS_EITHER_STATUS_GLYPH = /\.startsWith\(\s*["'](?:✅|⚠️)["']\s*\)/;

test("there is something to check: the guard's own pattern can match", () => {
  // Positive control, run once. Proves the patterns are capable of matching,
  // so the assertions below are testing something rather than regexes that
  // can never fire.
  expect('msg.startsWith("✅")').toMatch(SNIFFS_STATUS_EMOJI);
  expect("msg.startsWith('✅')").toMatch(SNIFFS_STATUS_EMOJI);
  expect('msg.startsWith("⚠️")').toMatch(SNIFFS_EITHER_STATUS_GLYPH);
});

describe.each(FIXED_SCREENS)("%s does not decide a message's colour from its own text", (file) => {
  const source = sourceOf(file);

  test('does not call .startsWith("✅") anywhere', () => {
    expect(source).not.toMatch(SNIFFS_STATUS_EMOJI);
  });

  test("does not call .startsWith on either status glyph anywhere", () => {
    expect(source).not.toMatch(SNIFFS_EITHER_STATUS_GLYPH);
  });

  test("the status travels beside the text, not inside it", () => {
    // The shape the fix settled on: message state holds {text, ok}. This
    // pins it so a later edit cannot quietly go back to a bare string.
    expect(source).toMatch(/setMsg\(\{\s*text\s*:/);
    expect(source).toMatch(/msg\.ok\s*\?/);
  });

  test("the ✅/⚠️ prefixes are still in the message text, where that slice hasn't landed yet", () => {
    // The emoji stayed after this file's sniffing fix — only the colour
    // decision moved — because taking them out was a later slice: the
    // message-status-colour change (see odd/tasks/message-status-colour.md),
    // which gives every message here its own {text, ok} status and, only
    // then, retires the prefix as decoration. App.jsx and Web.jsx have now
    // had every one of their message displays carried through that slice
    // (both the ones fixed here and the ones fixed by it), so neither file
    // has a ✅/⚠️ prefix left to find; Agencia.jsx and Admin.jsx still carry
    // theirs on the components that slice hasn't reached.
    if (EMOJI_PREFIX_FULLY_RETIRED.includes(file)) {
      expect(source).not.toMatch(/✅/);
      expect(source).not.toMatch(/⚠️/);
    } else {
      expect(source).toMatch(/✅/);
      expect(source).toMatch(/⚠️/);
    }
  });
});

describe("Agencia.jsx does not report a successful action in red", () => {
  const source = sourceOf("Agencia.jsx");

  test("blocking a client is confirmed in green, like unblocking", () => {
    // Blocking and unblocking are one operation with opposite sign. The old
    // sniffing render coloured the block confirmation red purely because its
    // text starts with 🔒 instead of ✅, so an agency was told an action that
    // had worked did not. Both now report ok:true.
    const confirmation = source.match(
      /setMsg\(\{\s*text:\s*bloquear\s*\?[^}]*\}\)/
    );
    expect(confirmation).not.toBeNull();
    expect(confirmation[0]).toMatch(/ok:\s*true/);
    expect(confirmation[0]).not.toMatch(/ok:\s*!bloquear/);
  });
});
