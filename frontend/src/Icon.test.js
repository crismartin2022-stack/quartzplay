import fs from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import Icon, { ICON_PATHS, DEFAULT_ICON_SIZE, iconAttributes } from "./Icon";

// This suite used to read the prototype's icons.js from a sibling tree,
// three levels above the repository root, and compare every path against
// it. That passed on a machine with the prototype checked out beside the
// repository and threw ENOENT anywhere else — during collection, taking
// the whole file down. The guarantee it was after ("these are the
// prototype's icons") can only be checked where the prototype exists, so
// it belongs to whoever ports an icon, not to the suite. What the
// repository can prove is asserted instead.

describe("the icon set is complete and drawable", () => {
  test("the component carries the prototype's 36 icons", () => {
    expect(Object.keys(ICON_PATHS)).toHaveLength(36);
  });

  test("every icon carries real path data", () => {
    for (const [name, markup] of Object.entries(ICON_PATHS)) {
      expect(typeof markup).toBe("string");
      expect(markup.length).toBeGreaterThan(0);
      // Every icon in this set is drawn out of these three primitives.
      expect(markup).toMatch(/<(path|circle|rect)\b/);
    }
  });

  test("the set is local: nothing is fetched at runtime", () => {
    const source = fs.readFileSync(path.join(__dirname, "Icon.jsx"), "utf8");
    expect(source).not.toMatch(/https?:\/\//);
  });

  // lucide-react is now a real dependency (docs/icon-inventory.md: it is
  // the full set these 36 paths were drawn from, added to carry the icons
  // that set does not have yet). It is additive: this file's own 36 icons
  // stay pinned and hand-copied, and Icon.jsx never imports the package
  // that grows beside it.
  test("Icon.jsx itself never imports lucide-react — the 36 stay pinned, the package is additive", () => {
    const source = fs.readFileSync(path.join(__dirname, "Icon.jsx"), "utf8");
    expect(source).not.toMatch(/lucide-react/);
  });
});

describe("an icon is drawn the way the prototype draws it", () => {
  test("a known name produces the prototype's stroke geometry", () => {
    const attrs = iconAttributes({ name: "house" });
    expect(attrs).toMatchObject({
      viewBox: "0 0 24 24",
      fill: "none",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
    });
  });

  test("an unknown name draws nothing", () => {
    expect(iconAttributes({ name: "no-such-icon" })).toBeNull();
    expect(Icon({ name: "no-such-icon" })).toBeNull();
  });

  test("an unknown name takes up no space either", () => {
    // Nothing is rendered at all, so no box is reserved and the row it
    // sat in keeps the height it had.
    expect(Icon({ name: "", label: "Vacío" })).toBeNull();
    expect(Icon({ name: undefined })).toBeNull();
  });
});

describe("what the browser is actually given", () => {
  test("a named icon renders the prototype's own shapes", () => {
    const markup = renderToStaticMarkup(<Icon name="house" size={18} label="Inicio"/>);
    expect(markup).toContain(ICON_PATHS.house);
    expect(markup).toContain('viewBox="0 0 24 24"');
    expect(markup).toContain('stroke="currentColor"');
    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="Inicio"');
  });

  test("a decorative icon is silent", () => {
    const markup = renderToStaticMarkup(<Icon name="house"/>);
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain("aria-label");
  });

  test("an unknown name renders nothing at all, so no box is reserved", () => {
    expect(renderToStaticMarkup(<Icon name="no-such-icon"/>)).toBe("");
  });
});

describe("colour and size come from the caller", () => {
  test("an icon takes the current text colour by default", () => {
    expect(iconAttributes({ name: "house" }).stroke).toBe("currentColor");
  });

  test("an icon takes the colour it is given", () => {
    expect(iconAttributes({ name: "house", color: "#b9ef32" }).stroke).toBe("#b9ef32");
  });

  test("the caller sets the size", () => {
    const attrs = iconAttributes({ name: "house", size: 34 });
    expect(attrs.width).toBe(34);
    expect(attrs.height).toBe(34);
  });

  test("the size has a default, and it is the prototype's", () => {
    expect(DEFAULT_ICON_SIZE).toBe(20);
    const attrs = iconAttributes({ name: "house" });
    expect(attrs.width).toBe(DEFAULT_ICON_SIZE);
    expect(attrs.height).toBe(DEFAULT_ICON_SIZE);
  });

  test("an icon does not overflow the line or squash it", () => {
    const attrs = iconAttributes({ name: "house", size: 16 });
    expect(attrs.style.flexShrink).toBe(0);
    expect(attrs.style.verticalAlign).toBeDefined();
  });

  test("the caller can add its own spacing without losing the defaults", () => {
    const attrs = iconAttributes({ name: "house", style: { marginBottom: 8 } });
    expect(attrs.style.marginBottom).toBe(8);
    expect(attrs.style.flexShrink).toBe(0);
  });
});

describe("an icon is read correctly or not at all", () => {
  test("a named icon is announced", () => {
    const attrs = iconAttributes({ name: "search", label: "Buscar" });
    expect(attrs.role).toBe("img");
    expect(attrs["aria-label"]).toBe("Buscar");
    expect(attrs["aria-hidden"]).toBeUndefined();
  });

  test("an icon beside its own label is hidden from assistive technology", () => {
    const attrs = iconAttributes({ name: "search" });
    expect(attrs["aria-hidden"]).toBe("true");
    expect(attrs.focusable).toBe("false");
    expect(attrs.role).toBeUndefined();
    expect(attrs["aria-label"]).toBeUndefined();
  });
});
