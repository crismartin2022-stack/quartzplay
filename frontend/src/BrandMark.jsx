// ═══════════════════════════════════════════════════════════════
// BRAND MARK — the product's own logo, not a typeface simulation.
//
// Every screen used to draw "IAQP" itself: a small SVG hexagon beside a
// <span> in a gradient, repeated per file (App.jsx, Web.jsx, Agencia.jsx,
// Admin.jsx). The prototype ships a real logo file instead
// (`html/assets/logo.png`) and uses it plainly, with no hexagon beside it
// — so the image itself is the mark, and the old hexagon is dropped along
// with the text it used to stand in for.
//
// Shipped through the bundler like the fonts (`./fonts.css`), not dropped
// raw into `public/`: the import below is what makes webpack content-hash
// the file and puts it under `static/media/`, covered by `public/serve.json`'s
// immutable-cache rule.
//
// `size` is the rendered height in pixels. The old call sites passed a
// font-size as `size` to the hexagon+text version; mapping `size` straight
// to the logo's pixel height keeps every one of those call sites at the
// same footprint or smaller (a line of text is roughly 1.2x its font-size
// tall, and 1x is always <= 1.2x), which is what keeps a topbar on a phone
// from getting taller than it already was. Width follows the file's own
// aspect ratio, so the mark is never stretched.
//
// Like Icon.jsx, the attributes are computed by a plain function so the
// component can be tested without a DOM renderer.
import logo from "./assets/logo.png";

// The file's own pixels (measured with `sips -g pixelWidth -g pixelHeight`):
// 503x244. Declaring it here, once, is what lets every caller ask for a
// height and get a width that never distorts the image.
const LOGO_ASPECT_RATIO = 503 / 244;

export const DEFAULT_BRAND_MARK_SIZE = 20;

export function brandMarkAttributes({ size = DEFAULT_BRAND_MARK_SIZE, style } = {}) {
  return {
    src: logo,
    // The prototype's own accessible name for this file, verbatim
    // (`<img src="assets/logo.png" alt="iaqp" .../>` in html/player-home.html
    // and every other screen that carries it).
    alt: "iaqp",
    width: Math.round(size * LOGO_ASPECT_RATIO),
    height: size,
    style: { display: "inline-block", verticalAlign: "middle", flexShrink: 0, ...style },
  };
}

export default function BrandMark(props) {
  return <img {...brandMarkAttributes(props)} />;
}
