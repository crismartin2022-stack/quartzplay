import fs from "fs";
import path from "path";

// ── The one place the icon migration structurally could not reach ─────
//
// Everywhere else an emoji became an <Icon/> component. Inside a <select>
// that is impossible: an <option> renders text and nothing else, so the
// migration had to leave those alone — and four of them survived into
// production-bound code, where the owner found one on a phone.
//
// There is no icon to put there. The rule is simply that an option carries
// no emoji: the label alone has to say what it is.
const SRC = path.resolve(__dirname);
const SCREENS = ["App.jsx", "Web.jsx", "Box.jsx", "Casino.jsx", "Agencia.jsx", "Admin.jsx"];

// The ranges the panels actually used: pictographs, dingbats, misc symbols.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
const OPTION = /<option\b[^>]*>([\s\S]*?)<\/option>/g;

const sources = Object.fromEntries(
  SCREENS.map((name) => [name, fs.readFileSync(path.join(SRC, name), "utf8")])
);

function optionsWithEmoji(source) {
  return [...source.matchAll(OPTION)]
    .map((m) => m[1])
    .filter((label) => EMOJI.test(label));
}

describe("the matcher can see options at all", () => {
  // A matcher that finds no options would pass the assertion below for a
  // reason that proves nothing.
  test("the panels declare <option> elements to check", () => {
    const total = SCREENS.reduce(
      (n, name) => n + [...sources[name].matchAll(OPTION)].length, 0
    );
    expect(total).toBeGreaterThan(0);
  });
});

describe("no <option> carries an emoji", () => {
  test.each(SCREENS)("%s", (name) => {
    expect(optionsWithEmoji(sources[name])).toEqual([]);
  });

  test("positive control: an emoji in an option is detected", () => {
    expect(optionsWithEmoji('<option value="">\u{1F31F} Asignar</option>'))
      .toEqual([expect.stringContaining("Asignar")]);
  });

  test("positive control: a plain option is not", () => {
    expect(optionsWithEmoji('<option value="">Asignar</option>')).toEqual([]);
  });

  test("an option holding a JSX expression is still checked", () => {
    // The surviving ones looked like `<option ...>{c.nombre}</option>` with
    // the emoji beside the expression, so the matcher must read the whole
    // child text, not just literal words.
    expect(optionsWithEmoji("<option key={c.id}>\u{1F464} {c.nombre}</option>"))
      .toHaveLength(1);
  });
});
