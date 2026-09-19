import fs from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import BrandMark, { brandMarkAttributes, DEFAULT_BRAND_MARK_SIZE } from "./BrandMark";

// The logo is a real PNG, not a drawn shape, so its own pixels are the
// source of truth for the aspect ratio the component must honour. Reading
// the IHDR chunk here means the test cannot drift from the shipped file
// the way a hardcoded ratio could.
function pngDimensions(file) {
  const buf = fs.readFileSync(file);
  // Signature (8 bytes) + IHDR length (4) + "IHDR" (4) = 16, then width
  // and height as two big-endian uint32s.
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

const LOGO_FILE = path.resolve(__dirname, "assets", "logo.png");
const { width: LOGO_W, height: LOGO_H } = pngDimensions(LOGO_FILE);

describe("the brand mark is the product's own logo, not a typeface", () => {
  // The assets were copied from the prototype, which lives beside this
  // repository and not inside it. A byte-equality check against that tree
  // passed here and threw ENOENT on any clean checkout, so the suite's
  // result depended on the developer's filesystem rather than on the code.
  // Whoever copies the file owns that guarantee; the tests below assert
  // only what the repository actually ships.
  test("it draws the logo asset, not text", () => {
    const markup = renderToStaticMarkup(<BrandMark />);
    expect(markup).toContain("<img");
    expect(markup).toContain('src="logo.png"');
    expect(markup).not.toContain("IAQP");
  });

  test("it carries the accessible name the prototype gives the logo", () => {
    expect(brandMarkAttributes({}).alt).toBe("iaqp");
    const markup = renderToStaticMarkup(<BrandMark />);
    expect(markup).toContain('alt="iaqp"');
  });
});

describe("the mark takes its size from the caller", () => {
  test("the caller sets the size", () => {
    expect(brandMarkAttributes({ size: 26 }).height).toBe(26);
  });

  test("the size has a sensible default", () => {
    expect(brandMarkAttributes({}).height).toBe(DEFAULT_BRAND_MARK_SIZE);
  });

  test("width follows the shipped file's own aspect ratio, not a guess", () => {
    const attrs = brandMarkAttributes({ size: 40 });
    const expectedWidth = Math.round(40 * (LOGO_W / LOGO_H));
    expect(attrs.width).toBe(expectedWidth);
  });

  test("both dimensions are explicit, so the mark reserves its box before it loads", () => {
    const attrs = brandMarkAttributes({ size: 20 });
    expect(typeof attrs.width).toBe("number");
    expect(typeof attrs.height).toBe("number");
  });

  test("a header that sized the old text mark at N keeps that footprint or less at size N", () => {
    // The text mark's own line-height (~1.2 x its font-size) was the tallest
    // thing in the row it sat in. The old call sites passed their font-size
    // as `size`; mapping `size` straight to the logo's pixel height means
    // the image is never taller than that old line-height, at every size
    // the app actually calls this with (11, 15, 16, 20, 26, 28).
    [11, 15, 16, 20, 26, 28].forEach((oldFontSize) => {
      const oldLineHeight = oldFontSize * 1.2;
      const attrs = brandMarkAttributes({ size: oldFontSize });
      expect(attrs.height).toBeLessThanOrEqual(oldLineHeight);
    });
  });

  test("the caller can add its own spacing without losing the defaults", () => {
    const attrs = brandMarkAttributes({ style: { marginBottom: 3 } });
    expect(attrs.style.marginBottom).toBe(3);
    expect(attrs.style.flexShrink).toBe(0);
  });
});
