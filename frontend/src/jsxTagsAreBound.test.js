import fs from "fs";
import path from "path";

// Every capitalised JSX tag a screen uses must resolve to something that
// screen actually has: an import, or a component declared in the file.
//
// Nothing else in this project checks that. Proven, not assumed: removing
// `Handshake` from Web.jsx's lucide-react import leaves both
//
//   npx eslint src/Web.jsx --no-eslintrc --rule '{"no-undef":"error"}'
//   CI=true npx react-scripts test --watchAll=false
//
// completely green — the first because this invocation has no React plugin,
// so it never resolves a JSX tag to a binding, and the second because every
// guard here reads these files as text and none of them renders anything.
// The build compiles too: an undefined identifier inside JSX is valid
// JavaScript right up until it runs, and then the screen throws
// "Handshake is not defined" and shows nothing.
//
// That nearly shipped twice in one change: the pass that added ~55 lucide
// icons used `Bell` and `Moon` in Agencia.jsx without importing them, and
// only a throwaway script caught it. This is that script, kept.
const SRC = path.resolve(__dirname);
const SCREENS = ["App.jsx", "Web.jsx", "Box.jsx", "Casino.jsx", "Agencia.jsx", "Admin.jsx"];

// `<Foo`, `<Foo.Bar` — only the root name matters, and only capitalised
// names are component references; lowercase ones are DOM elements.
const JSX_TAG = /<([A-Z][A-Za-z0-9_]*)/g;

// Tags are read from code lines only. A source-text guard reads comments
// too, and this one reported `QPLogo` missing on its first run — a component
// deleted months ago, named only in the comment explaining that it was
// deleted and that no `<QPLogo` remains.
//
// The first attempt stripped comments with a regex and made things worse: a
// `/*` inside a string opened a comment that was never really opened, and
// everything up to the next `*/` vanished — including two real component
// declarations, which the guard then reported as unbound. Stripping comments
// from JavaScript with a regex is not safe on this codebase.
//
// So: bindings are collected from the untouched source, which can only ever
// find more of them and never invent a failure; and a tag is ignored when
// every line it appears on is a pure comment line. A tag commented out
// mid-code still counts, which errs toward stricter.
const COMMENT_LINE = /^\s*(\/\/|\*|\/\*)/;

function tagsUsed(source) {
  const used = new Set();
  for (const line of source.split("\n")) {
    if (COMMENT_LINE.test(line)) continue;
    for (const [, name] of line.matchAll(JSX_TAG)) used.add(name);
  }
  return used;
}

function namesBound(source) {
  const bound = new Set();

  // import Default, { Named, Other as Alias } from "..."
  for (const [, clause] of source.matchAll(/import\s+([^;]+?)\s+from\s*["'][^"']+["']/g)) {
    const braces = clause.match(/\{([^}]*)\}/);
    const beforeBraces = clause.replace(/\{[^}]*\}/, "");
    for (const piece of beforeBraces.split(",")) {
      const name = piece.trim().replace(/^\*\s+as\s+/, "");
      if (/^[A-Za-z_$][\w$]*$/.test(name)) bound.add(name);
    }
    if (braces) {
      for (const piece of braces[1].split(",")) {
        const alias = piece.split(/\s+as\s+/);
        const name = alias[alias.length - 1].trim();
        if (/^[A-Za-z_$][\w$]*$/.test(name)) bound.add(name);
      }
    }
  }

  // Declared in the file: function Foo(), const Foo = ..., class Foo
  for (const [, name] of source.matchAll(/(?:^|\n)\s*(?:export\s+)?function\s+([A-Za-z_$][\w$]*)/g)) bound.add(name);
  for (const [, name] of source.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) bound.add(name);
  for (const [, name] of source.matchAll(/(?:^|\n)\s*(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/g)) bound.add(name);

  return bound;
}

const sources = Object.fromEntries(
  SCREENS.map((name) => [name, fs.readFileSync(path.join(SRC, name), "utf8")])
);

describe("the matcher reads JSX tags and bindings", () => {
  // Positive controls. A tag matcher that finds nothing, or a binding
  // collector that finds everything, would pass the real assertion below
  // for reasons that prove nothing.
  test.each(SCREENS)("%s uses capitalised JSX tags", (name) => {
    expect(tagsUsed(sources[name]).size).toBeGreaterThan(0);
  });

  test("an unbound tag is actually detected", () => {
    const sample = 'import { Bell } from "lucide-react";\nconst x = <Bell/>;\nconst y = <Moon/>;\n';
    const missing = [...tagsUsed(sample)].filter((tag) => !namesBound(sample).has(tag));
    expect(missing).toEqual(["Moon"]);
  });
});

describe("no screen uses a JSX tag it has not bound", () => {
  test.each(SCREENS)("%s binds every component it renders", (name) => {
    const source = sources[name];
    const bound = namesBound(source);
    const missing = [...tagsUsed(source)].filter((tag) => !bound.has(tag));
    expect(missing).toEqual([]);
  });
});
