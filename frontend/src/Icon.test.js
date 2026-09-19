import fs from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import Icon, { ICON_PATHS, DEFAULT_ICON_SIZE, iconAttributes } from "./Icon";

// The prototype's own set, read from disk rather than hand-typed, so the
// component cannot drift from the file the designs were drawn with.
const PROTOTYPE_SET = path.resolve(
  __dirname, "..", "..", "..", "html", "assets", "icons.js"
);

function prototypeIcons() {
  const source = fs.readFileSync(PROTOTYPE_SET, "utf8");
  const block = source.slice(
    source.indexOf("const paths = {"),
    source.indexOf("window.iaqpIcons")
  );
  const entries = [...block.matchAll(/^\s*"?([a-z0-9-]+)"?:\s*'([^']*)'/gm)];
  return Object.fromEntries(entries.map(([, name, markup]) => [name, markup]));
}

describe("the icon set is the prototype's own", () => {
  const prototype = prototypeIcons();

  test("the prototype ships the 36 icons this test reads", () => {
    expect(Object.keys(prototype)).toHaveLength(36);
  });

  test("the component carries exactly the prototype's icon names", () => {
    expect(Object.keys(ICON_PATHS).sort()).toEqual(Object.keys(prototype).sort());
  });

  test.each(Object.keys(prototypeIcons()))(
    "%s is drawn with the prototype's own path data",
    (name) => {
      expect(ICON_PATHS[name]).toBe(prototype[name]);
    }
  );

  test("the set is local: nothing is fetched at runtime", () => {
    const source = fs.readFileSync(path.join(__dirname, "Icon.jsx"), "utf8");
    expect(source).not.toMatch(/https?:\/\//);
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")
    );
    expect(Object.keys(pkg.dependencies)).not.toContain("lucide-react");
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
