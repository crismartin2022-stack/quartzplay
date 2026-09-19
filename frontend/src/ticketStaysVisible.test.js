// The generated ticket code used to vanish the instant it arrived.
//
// Both scanner screens render the code panel inside the block guarded by the
// scan result, and `generarBoleto` cleared that result in the same breath as
// it stored the ticket. The code was created on the server, returned, stored
// in state — and then unmounted with the block around it. What the player saw
// was the screen resetting with no trace of the code.
//
// These assertions read the source, the way scanPanel.test.js does: there is
// no DOM renderer in this project, and the defect is structural rather than
// behavioural, so the structure is what is pinned.
const fs = require("fs");
const path = require("path");

const PANTALLAS = [
  ["Web.jsx", "function BetBestWeb", "function ModalNoSesion"],
  ["App.jsx", "function ScreenMejorar", "const STEPS="],
];

const cortar = (fuente, desde, hasta) => {
  const inicio = fuente.indexOf(desde);
  expect(inicio).toBeGreaterThan(-1);
  const fin = fuente.indexOf(hasta, inicio + desde.length);
  expect(fin).toBeGreaterThan(inicio);
  return fuente.slice(inicio, fin);
};

describe.each(PANTALLAS)("%s keeps the generated code on screen", (archivo, desde, hasta) => {
  const fuente = fs.readFileSync(path.resolve(__dirname, archivo), "utf8");
  const pantalla = cortar(fuente, desde, hasta);
  // Hasta la siguiente declaracion hermana: las de adentro del cuerpo van
  // con mas sangria, asi que el salto de linea y los dos espacios son el
  // limite real de la funcion.
  const generar = cortar(pantalla, "const generarBoleto=async()=>{", "\n  const ");

  test("the code panel is inside the block the scan result guards", () => {
    // If this ever stops being true the defect changes shape, and the test
    // below stops being the thing that protects the player from it.
    const abre = pantalla.indexOf("{res&&(");
    const panel = pantalla.indexOf("{boleto&&(");
    expect(abre).toBeGreaterThan(-1);
    expect(panel).toBeGreaterThan(abre);
  });

  test("generating the code does not clear the scan result", () => {
    expect(generar).toContain("setBoleto(d)");
    expect(generar).not.toMatch(/res\s*:\s*null/);
  });

  test("the photos are still cleared once they have done their job", () => {
    expect(generar).toMatch(/imagenes\s*:\s*\[\]/);
  });

  test("discarding the scan is still offered on its own control", () => {
    expect(pantalla).toContain("¿Descartar lo escaneado?");
    expect(pantalla).toContain("setEscaneo(null)");
  });
});
