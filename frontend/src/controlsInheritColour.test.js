import fs from "fs";
import path from "path";

// A <button> does not inherit the document's text colour. The browser gives
// it one of its own — `buttontext`, near-black — so `document.body.style.color`
// never reaches inside it, and anything within that relies on inheriting a
// colour renders black on a near-black background.
//
// That is what happened to the admin panel's bottom navigation after the
// document colour was declared: each item's label set its own colour and was
// visible, while the icon beside it set none and vanished. A scan found 25
// controls across the six screens holding an icon with no colour of its own,
// every one of them relying on inheritance a button never delivers.
//
// The fix is one rule, not 25 patches — and a control that declares its own
// colour still wins, so nothing already correct changes. Form fields are
// deliberately excluded: an input may sit on a light background of its own.
const SRC = path.resolve(__dirname);

const base = fs.readFileSync(path.join(SRC, "base.css"), "utf8");
const entry = fs.readFileSync(path.join(SRC, "index.js"), "utf8");

// Strip comments so the assertions read the rule, not the explanation of it —
// the trap every source-text guard in this suite has hit at least once.
const rules = base.replace(/\/\*[\s\S]*?\*\//g, " ");

describe("controls inherit the document's colour", () => {
  test("the stylesheet is loaded by the entry point", () => {
    expect(entry).toMatch(/import\s+["']\.\/base\.css["']/);
  });

  test("button and label are both covered", () => {
    // Both, because a file input's control is a <label> in this codebase and
    // carries an icon the same way a button does.
    expect(rules).toMatch(/\bbutton\b/);
    expect(rules).toMatch(/\blabel\b/);
    expect(rules).toMatch(/color\s*:\s*inherit/);
  });

  test("form fields are left alone", () => {
    // Asserting the absence, because including them would be a bug in the
    // other direction: a field on a light background would inherit light text.
    expect(rules).not.toMatch(/\binput\b/);
    expect(rules).not.toMatch(/\bselect\b/);
    expect(rules).not.toMatch(/\btextarea\b/);
  });

  test("the matcher reads the rule, not the comment explaining it", () => {
    // Positive control. The comment above the rule names `input` and `select`
    // while explaining why they are excluded, so a matcher that did not strip
    // comments would fail the assertion above for the wrong reason — and a
    // matcher that stripped everything would pass every assertion here.
    expect(base).toMatch(/\binput\b/);
    expect(rules).not.toMatch(/\binput\b/);
    expect(rules.length).toBeGreaterThan(0);
  });
});
