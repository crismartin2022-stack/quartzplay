// The product used to draw its own name by hand: a small SVG hexagon
// beside `<span>IAQP</span>` in some places, "IA" and a separately-gold
// "QP" as two spans in others — the second form is why a first pass built
// from a literal search for the contiguous string "IAQP" missed four
// sites (App.jsx, Web.jsx, Casino.jsx, Box.jsx) entirely. The shared
// BrandMark component (logo.png) replaces both forms everywhere they show
// up, in every screen file — except the two printed ticket templates,
// which are HTML strings for a physical thermal printer and have no image
// path to carry a PNG.
//
// These are structural assertions, the way ticketStaysVisible.test.js and
// scanPanel.test.js read this project's mega-components: there is no DOM
// renderer for App.jsx/Web.jsx/Casino.jsx/Box.jsx/Agencia.jsx/Admin.jsx in
// this project. brandNeverTypedAsText.test.js is the general regression
// guard for "any screen, any split of the letters"; this file pins each
// specific site by name.
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

// For a mark that sits inside the file's default-exported root component
// (Casino.jsx, Box.jsx, Web.jsx's header), there is no following
// "\nfunction " to bound `cortar` with — it is the last function in the
// file, thousands of characters long. A short window right after the
// header `<div>`/`<header>`'s own closing `>` is enough to look at the
// mark itself without reading to end of file.
const ventana = (fuente, desde, largo = 200) => {
  const inicio = fuente.indexOf(desde);
  expect(inicio).toBeGreaterThan(-1);
  return fuente.slice(inicio, inicio + largo);
};

describe.each([
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

// App.jsx's own QPLogo drew the same hexagon-and-gradient-text, but it was
// never rendered anywhere in the file (confirmed: no `<QPLogo` in src/, and
// it was not exported) — so it was deleted rather than updated to draw
// BrandMark, which would have shipped a second, dead answer beside the
// real one below (BarraSuperior).
describe("App.jsx's QPLogo was dead code and is gone, not updated-but-unused", () => {
  const source = read("App.jsx");

  test("the function no longer exists", () => {
    expect(source).not.toMatch(/function QPLogo/);
  });

  test("its real header, BarraSuperior, draws BrandMark instead of a split IA/QP span", () => {
    const body = cortar(source, "function BarraSuperior", "\nfunction ");
    expect(body).toContain("<BrandMark");
    expect(body).not.toMatch(/>IA</);
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

// App.jsx's BotMsg is Web.jsx's BotMsgWeb's twin (the Telegram-app chat
// sender label vs. the web-app one) and had the exact same contiguous
// ">IAQP<" a plain grep for the string should have caught the first time.
describe("App.jsx's BotMsg sender label draws BrandMark, not literal text", () => {
  test("no leftover literal IAQP", () => {
    const body = cortar(read("App.jsx"), "function BotMsg(", "\nfunction ");
    expect(body).toContain("<BrandMark");
    expect(body).not.toMatch(/>IAQP</);
  });
});

// The four sites below were missed by the first pass because none of them
// spell "IAQP" as one contiguous string: each draws "IA" and a
// separately-colored "QP" as two spans, which a literal search for
// ">IAQP<" cannot match. See brandNeverTypedAsText.test.js for the general
// regression guard; these pin the four specific fixes.
describe("Web.jsx's own header (BarraSuperior's counterpart) draws BrandMark", () => {
  test("no leftover split IA/QP spans", () => {
    const body = ventana(read("Web.jsx"), 'position:"sticky",top:0,zIndex:100}}>');
    expect(body).toContain("<BrandMark");
    expect(body).not.toMatch(/>IA</);
  });
});

describe("Casino.jsx's header draws BrandMark", () => {
  test("no leftover split IA/QP spans", () => {
    const body = ventana(read("Casino.jsx"), 'position:"sticky",top:0,zIndex:20}}>');
    expect(body).toContain("<BrandMark");
    expect(body).not.toMatch(/>IA</);
  });

  test("imports BrandMark", () => {
    expect(read("Casino.jsx")).toMatch(/import BrandMark from ["']\.\/BrandMark["'];?/);
  });
});

describe("Box.jsx's header draws BrandMark", () => {
  test("no leftover split IA/QP spans", () => {
    const body = ventana(read("Box.jsx"), 'position:"sticky",top:0,zIndex:50}}>');
    expect(body).toContain("<BrandMark");
    expect(body).not.toMatch(/>IA</);
  });

  test("imports BrandMark", () => {
    expect(read("Box.jsx")).toMatch(/import BrandMark from ["']\.\/BrandMark["'];?/);
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
