import fs from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import Mascot, { mascotAttributes, DEFAULT_MASCOT_SIZE } from "./Mascot";

function pngDimensions(file) {
  const buf = fs.readFileSync(file);
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

const MASCOT_FILE = path.resolve(__dirname, "assets", "bot-mascota-001.png");
const { width: MASCOT_W, height: MASCOT_H } = pngDimensions(MASCOT_FILE);

describe("the mascot is the prototype's own character image", () => {
  // The assets were copied from the prototype, which lives beside this
  // repository and not inside it. A byte-equality check against that tree
  // passed here and threw ENOENT on any clean checkout, so the suite's
  // result depended on the developer's filesystem rather than on the code.
  // Whoever copies the file owns that guarantee; the tests below assert
  // only what the repository actually ships.
  test("it draws the mascot asset", () => {
    const markup = renderToStaticMarkup(<Mascot />);
    expect(markup).toContain("<img");
    expect(markup).toContain('src="bot-mascota-001.png"');
  });
});

describe("the mascot is decorative: hidden from assistive technology", () => {
  test("it carries no accessible name of its own", () => {
    const attrs = mascotAttributes({});
    expect(attrs.alt).toBe("");
    expect(attrs["aria-hidden"]).toBe("true");
  });

  test("what the browser is actually given is silent to a screen reader", () => {
    const markup = renderToStaticMarkup(<Mascot />);
    expect(markup).toContain('alt=""');
    expect(markup).toContain('aria-hidden="true"');
  });
});

describe("the mascot takes its size from the caller", () => {
  test("the caller sets the size", () => {
    expect(mascotAttributes({ size: 64 }).height).toBe(64);
  });

  test("the size has a sensible default", () => {
    expect(mascotAttributes({}).height).toBe(DEFAULT_MASCOT_SIZE);
  });

  test("width follows the shipped file's own aspect ratio, not a guess", () => {
    const attrs = mascotAttributes({ size: 100 });
    const expectedWidth = Math.round(100 * (MASCOT_W / MASCOT_H));
    expect(attrs.width).toBe(expectedWidth);
  });

  test("the caller can add its own spacing without losing the defaults", () => {
    const attrs = mascotAttributes({ style: { margin: "0 auto 8px" } });
    expect(attrs.style.margin).toBe("0 auto 8px");
    expect(attrs.style.flexShrink).toBe(0);
  });
});
