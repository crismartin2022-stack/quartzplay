import fs from "fs";
import path from "path";

// Source-based, como los demás de este repo: no hay DOM para Admin.
const admin = fs.readFileSync(path.resolve(__dirname, "Admin.jsx"), "utf8");

// El interruptor vive en la pantalla de Cash out del admin, y se guarda con
// el mismo camino que el del sportsbook: GET para leer, POST {activo} para
// escribir, y se muestra lo que el servidor devolvió.
describe("el interruptor de cash out de la casa", () => {
  test("está en la vista de Cash out y no en una pantalla nueva", () => {
    expect(admin).toMatch(
      /vista==="cashout"&&<>\s*<InterruptorCashoutCasa adminKey=\{adminKey\}/);
  });

  test("lee y guarda contra el endpoint del admin", () => {
    expect(admin).toMatch(/\/api\/admin\/cashout-casa/);
    expect(admin).toMatch(/JSON\.stringify\(\{activo:!activo\}\)/);
  });

  test("avisa que no cambia el permiso de quien tiene agencia", () => {
    expect(admin).toMatch(/siguen dependiendo del permiso de su agencia/);
  });
});
