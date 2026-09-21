import fs from "fs";
import path from "path";

// T5 of odd/tasks/player-chrome-batch.md: the bottom bar grows from two
// items + Bet Best + two items to three each side, and Ayuda moves into
// it — Deportes, Builder, Desafíos on the left; Bet Best centre;
// Boletos, Ayuda, Perfil on the right. BotonAyuda stops owning its own
// trigger and `abierto` state: the parent holds the state, the nav item
// opens it, and BotonAyuda renders only the modal.
//
// Structural, source-based assertions — no DOM renderer for App.jsx here.
const APP = fs.readFileSync(path.resolve(__dirname, "App.jsx"), "utf8");

function functionBody(name) {
  const start = APP.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const end = APP.indexOf("\nfunction ", start);
  expect(end).toBeGreaterThan(start);
  return APP.slice(start, end);
}

describe("BarraInferior carries six items around Bet Best", () => {
  function body() {
    return functionBody("BarraInferior");
  }

  test("the items array lists exactly six entries, in the requested order", () => {
    const matches = [...body().matchAll(/\{k:"(\w+)",\s*l:"([^"]+)"\}/g)]
      .map((m) => [m[1], m[2]]);
    expect(matches).toEqual([
      ["prematch", "Deportes"],
      ["builder", "Builder"],
      ["desafios", "Desafíos"],
      ["mybets", "Boletos"],
      ["ayuda", "Ayuda"],
      ["cuenta", "Perfil"],
    ]);
  });

  test("three go left, three go right of the centre Bet Best button", () => {
    expect(body()).toMatch(/items\.slice\(0,\s*3\)/);
    expect(body()).toMatch(/items\.slice\(3\)/);
  });

  test("the grid now fits seven columns (six items + the centre cell)", () => {
    expect(body()).toMatch(/gridTemplateColumns:"repeat\(7,1fr\)"/);
  });

  test("tapping Ayuda does not call onNav — it opens the modal instead", () => {
    expect(body()).toMatch(/onAyuda/);
  });

  test("Perfil reuses the existing ICONOS.cuenta icon — no new icon needed", () => {
    // it.k is "cuenta", which already indexes an existing local person
    // icon (ICONOS.cuenta): nothing new to draw for this nav item.
    expect(body()).not.toMatch(/perfil\s*:/);
  });
});

describe("BotonAyuda is controlled by its parent", () => {
  function body() {
    return functionBody("BotonAyuda");
  }

  test("it no longer keeps its own abierto state", () => {
    expect(body()).not.toMatch(/useState/);
  });

  test("it takes abierto and onCerrar as props", () => {
    const signature = body().slice(0, body().indexOf(")"));
    expect(signature).toMatch(/abierto/);
    expect(signature).toMatch(/onCerrar/);
  });

  test("the floating trigger bubble is gone", () => {
    expect(body()).not.toMatch(/aria-label="Ayuda"/);
  });

  test("it still renders the chat modal", () => {
    expect(body()).toMatch(/<ChatSoporte\b/);
  });
});

describe("the floating Ayuda bubble is removed from where it used to mount", () => {
  test("BotonAyuda is now called with abierto and onCerrar", () => {
    const at = APP.indexOf("<BotonAyuda ");
    expect(at).toBeGreaterThan(-1);
    const call = APP.slice(at, APP.indexOf("/>", at) + 2);
    expect(call).toMatch(/abierto=\{/);
    expect(call).toMatch(/onCerrar=\{/);
  });

  test("BarraInferior is now called with onAyuda", () => {
    const at = APP.indexOf("<BarraInferior ");
    expect(at).toBeGreaterThan(-1);
    const call = APP.slice(at, APP.indexOf("/>", at) + 2);
    expect(call).toMatch(/onAyuda=\{/);
  });
});
