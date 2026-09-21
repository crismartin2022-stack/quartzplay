import fs from "fs";
import path from "path";

// T1 of odd/tasks/page-headers.md: `PageHeader` is the one title/description
// standard 18 of the panels' 29 tabs already followed, written down once and
// given to the rest. No renderer for these panels in this repo (see
// jsxTagsAreBound.test.js / sidebarGroupKeysMatchTabs.test.js for the same
// constraint solved the same way) — this reads the component's own source
// text and checks it wires every prop into JSX and leans on theme tokens
// rather than inventing its own numbers.
const SRC = fs.readFileSync(path.resolve(__dirname, "PageHeader.jsx"), "utf8");

describe("PageHeader renders every prop", () => {
  test("destructures icon, title, description, action and eyebrow", () => {
    expect(SRC).toMatch(
      /export default function PageHeader\(\{\s*icon,\s*title,\s*description,\s*action,\s*eyebrow\s*\}\)/
    );
  });

  test("renders the title", () => {
    expect(SRC).toMatch(/\{title\}/);
  });

  test("renders the description, conditionally", () => {
    expect(SRC).toMatch(/\{description&&\(/);
    expect(SRC).toMatch(/\{description\}/);
  });

  test("renders the action, conditionally, on the title's row", () => {
    expect(SRC).toMatch(/\{action&&<div/);
    expect(SRC).toMatch(/\{action\}/);
  });

  test("renders the eyebrow, conditionally", () => {
    expect(SRC).toMatch(/\{eyebrow&&\(/);
    expect(SRC).toMatch(/\{eyebrow\}/);
  });

  test("forces the title icon to size 20 rather than trusting the caller's own size", () => {
    expect(SRC).toMatch(/cloneElement\(icon,\s*\{\s*size:\s*TEXT\[20\]\s*\}\)/);
  });
});

describe("PageHeader uses theme tokens, not hardcoded numbers", () => {
  test("imports the tokens it needs from ./theme", () => {
    expect(SRC).toMatch(
      /import\s*\{\s*oscuro as Q,\s*F_BODY,\s*TEXT,\s*SPACING\s*\}\s*from\s*"\.\/theme"/
    );
  });

  // TEXT[20], not TEXT[15]: 15 is also this codebase's card-title size, so a
  // page header set at 15 sits level with the card headings beneath it and
  // stops reading as a heading at all. 20 puts it a clear step above them.
  test("the title is TEXT[20]/fontWeight:700/Q.text", () => {
    expect(SRC).toMatch(/color:Q\.text,fontWeight:700,fontSize:TEXT\[20\]/);
  });

  test("the description is TEXT[13]/Q.muted/lineHeight:1.5", () => {
    expect(SRC).toMatch(/color:Q\.muted,fontSize:TEXT\[13\],lineHeight:1\.5/);
  });

  test("SPACING[4] sits under the title row", () => {
    expect(SRC).toMatch(/marginBottom:SPACING\[4\]\}\}>\s*\n\s*<div style=\{\{color:Q\.text,fontWeight:700,fontSize:TEXT\[20\]/);
  });

  test("SPACING[16] sits under the whole block", () => {
    expect(SRC).toMatch(/<div style=\{\{marginBottom:SPACING\[16\]\}\}>/);
  });

  test("declares no bare fontSize/margin/gap number where SPACING or TEXT already has that step", () => {
    // Mirrors spacingScale.test.js / fontSizeFloor.test.js: every fontSize,
    // margin(Bottom) and gap literal in this file is a SPACING or TEXT
    // step reference, never a plain digit — that is the whole point of
    // writing the component instead of hand-rolling another header.
    const PLAIN_NUMBER = /\b(?:fontSize|marginBottom|gap)\s*:\s*(\d+(?:\.\d+)?)\s*[,}]/g;
    const offenders = [...SRC.matchAll(PLAIN_NUMBER)];
    expect(offenders).toEqual([]);
  });
});

describe("positive control: the token-only check actually catches a hardcoded number", () => {
  test("a plain fontSize literal is caught by the same matcher", () => {
    const withHardcodedNumber = 'fontSize:15,fontWeight:700';
    const PLAIN_NUMBER = /\b(?:fontSize|marginBottom|gap)\s*:\s*(\d+(?:\.\d+)?)\s*[,}]/g;
    expect([...withHardcodedNumber.matchAll(PLAIN_NUMBER)].length).toBeGreaterThan(0);
  });
});
