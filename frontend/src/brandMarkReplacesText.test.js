// The product used to draw its own name: a small SVG hexagon beside
// `<span>IAQP</span>` in a gradient, repeated per screen. The prototype
// ships a real logo file and uses it plainly, with no hexagon beside it,
// so the shared BrandMark component (logo.png) replaces both the hexagon
// and the text everywhere that pattern shows up — except the two printed
// ticket templates, which are HTML strings for a physical thermal printer
// and have no image path to carry a PNG.
//
// These are structural assertions, the way ticketStaysVisible.test.js and
// scanPanel.test.js read this project's mega-components: there is no DOM
// renderer for App.jsx/Web.jsx/Agencia.jsx/Admin.jsx in this project.
const fs = require("fs");
const path = require("path");

const read = (file) => fs.readFileSync(path.resolve(__dirname, file), "utf8");

const cortar = (fuente, desde, hasta) => {
  const inicio = fuente.indexOf(desde);
  expect(inicio).toBeGreaterThan(-1);
  const fin = fuente.indexOf(hasta, inicio + desde.length);
  expect(fin).toBeGreaterThan(inicio);
  return fuente.slice(inicio, fin);
};

describe.each([
  ["App.jsx"],
  ["Admin.jsx"],
  ["Agencia.jsx"],
])("%s's QPLogo draws the real logo, not a hexagon and gradient text", (file) => {
  const source = read(file);

  test("imports BrandMark", () => {
    expect(source).toMatch(/import BrandMark from ["']\.\/BrandMark["'];?/);
  });

  test("QPLogo renders BrandMark, with no leftover hexagon or literal IAQP text", () => {
    const body = cortar(source, "function QPLogo", "\nfunction ");
    expect(body).toContain("<BrandMark");
    expect(body).not.toContain("<svg");
    expect(body).not.toMatch(/>IAQP</);
  });
});

describe("Web.jsx's two inline marks (no hexagon in either, so none to remove)", () => {
  const source = read("Web.jsx");

  test("imports BrandMark", () => {
    expect(source).toMatch(/import BrandMark from ["']\.\/BrandMark["'];?/);
  });

  test("the terminal screen's kicker draws BrandMark, not literal text", () => {
    const body = cortar(source, "function PantallaTerminal", "\nfunction ");
    expect(body).toContain("<BrandMark");
    expect(body).not.toMatch(/>IAQP</);
  });

  test("the bot message sender label draws BrandMark, not literal text", () => {
    const body = cortar(source, "function BotMsgWeb", "\nfunction ");
    expect(body).toContain("<BrandMark");
    expect(body).not.toMatch(/>IAQP</);
  });
});

describe("the two printed tickets keep the literal text (thermal printer HTML string, no image path)", () => {
  const source = read("Agencia.jsx");

  test("printTicket's header is still plain text", () => {
    expect(source).toContain('<div class="c b xl">IAQP</div>');
  });

  test("printCierre's header is still plain text", () => {
    const occurrences = source.split('<div class="c b xl">IAQP</div>').length - 1;
    // Both printTicket and printCierre share this exact literal line.
    expect(occurrences).toBe(2);
  });
});
