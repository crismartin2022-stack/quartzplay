import fs from "fs";
import path from "path";

// The two scanner screens read the same `estado` the API sends. A state
// missing from the map falls through to a grey badge showing the raw
// key, so a backend state with no label here is a visible defect.
const pantallas = {
  "Web.jsx": fs.readFileSync(path.resolve(__dirname, "Web.jsx"), "utf8"),
  "App.jsx": fs.readFileSync(path.resolve(__dirname, "App.jsx"), "utf8"),
};

describe.each(Object.entries(pantallas))("%s scanner", (_nombre, fuente) => {
  const mapa = fuente.slice(fuente.indexOf("const estados={"),
                            fuente.indexOf("sin_partido:") + 80);

  test("labels the substituted line beside the states it already knows", () => {
    expect(mapa).toContain('otra_linea:{t:"Otra línea"');
  });

  test("marks it as careful rather than as an error", () => {
    expect(mapa).toMatch(/otra_linea:\{t:"Otra línea",c:Q\.amber\}/);
  });

  test("names the line the ticket asked for beside the one we quote", () => {
    expect(fuente).toContain("p.selection_leida");
    expect(fuente).toContain("en tu boleto decía");
  });
});
