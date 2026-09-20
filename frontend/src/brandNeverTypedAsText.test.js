// The earlier pass replaced every `>IAQP<` it found with a literal grep
// for that exact spelling — and missed four sites where the mark is typed
// out as two spans, "IA" then a nested/sibling "QP" in gold, because a
// literal search for the contiguous string "IAQP" cannot match text that
// is split across elements.
//
// This test does not repeat that mistake: instead of one spelling, it
// looks for the mark being *typed* — the letters I, A, Q, P appearing in
// order with nothing between them but whitespace or other tags (up to a
// few levels of nesting, which is what "split across spans" or "split
// across elements" both reduce to structurally). The match is anchored
// to sit immediately after some opening tag and immediately before some
// closing tag, so it fails on an actual mark-as-text render, but not on:
//   - the word appearing inside a sentence ("Generados por IAQP IA",
//     "IAQP · Jugá con responsabilidad…") — not bounded by `>`…`<`
//     with nothing else in the run;
//   - a `//` comment or a canvas/Web-Share-API string
//     (`g.fillText("IAQP", …)`, `title:"IAQP"`) — same reason;
//   - the two printed-ticket templates in Agencia.jsx, which are HTML
//     strings for a thermal printer, not JSX — explicitly excluded below,
//     the same one deliberate exception `brandMarkReplacesText.test.js`
//     pins as staying literal text.
const fs = require("fs");
const path = require("path");

const read = (file) => fs.readFileSync(path.resolve(__dirname, file), "utf8");

// A whole tag (attributes and all) or a run of whitespace, each counted
// as one hop — not one character — so ordinary multi-space JSX indentation
// between the letters doesn't defeat the match the way a per-character
// bound would. Bounded to at most 4 hops (a small, fixed count, not the
// unbounded `*` a first draft of this used) so the alternation can't
// backtrack combinatorially over a 200KB+ file: each hop is deterministic
// once chosen, and there are only ever a handful of them for real.
const HOP = String.raw`(?:<[^<>]*>|\s+)`;
const GAP = `${HOP}{0,4}`;
const TYPED_MARK = new RegExp(`>${GAP}I${GAP}A${GAP}Q${GAP}P${GAP}<`);

function withoutPrintedTickets(source) {
  let out = source;
  ["function printTicket(", "function printCierre("].forEach((marker) => {
    const start = out.indexOf(marker);
    if (start === -1) return;
    const end = out.indexOf("\nfunction ", start);
    out = out.slice(0, start) + out.slice(end === -1 ? out.length : end);
  });
  return out;
}

const SCREENS = ["App.jsx", "Web.jsx", "Casino.jsx", "Box.jsx", "Admin.jsx", "Agencia.jsx"];

describe.each(SCREENS)("%s never types the brand mark out by hand", (file) => {
  const source = withoutPrintedTickets(read(file));

  test("no run of rendered text spells I-A-Q-P, contiguous or split across tags", () => {
    expect(source).not.toMatch(TYPED_MARK);
  });
});

describe("the detector actually catches what a literal 'IAQP' search cannot", () => {
  test("a split-span mark is caught, even though the contiguous string never appears", () => {
    const split = '<span style={{fontWeight:700}}>IA<span style={{color:"#fff"}}>QP</span></span>';
    expect(split).not.toContain("IAQP");
    expect(split).toMatch(TYPED_MARK);
  });

  test("prose mentioning the brand name is not a false positive", () => {
    expect('<div>Generados por IAQP IA</div>').not.toMatch(TYPED_MARK);
    expect('<div>IAQP · Jugá con responsabilidad.<br/></div>').not.toMatch(TYPED_MARK);
  });

  test("a comment or a canvas/share string is not a false positive", () => {
    expect('// IAQP SPORTS — Web App Telegram completa').not.toMatch(TYPED_MARK);
    expect('g.fillText("IAQP", 70, 110);').not.toMatch(TYPED_MARK);
    expect('await navigator.share({title:"IAQP", text:texto});').not.toMatch(TYPED_MARK);
  });

  test("the printed ticket template is excluded on purpose, not by accident", () => {
    const ticket = 'function printTicket(slip, tipo="apuesta"){\n  const html=`<div class="c b xl">IAQP</div>`;\n}\nfunction siguiente(){}';
    expect(withoutPrintedTickets(ticket)).not.toMatch(TYPED_MARK);
  });
});
