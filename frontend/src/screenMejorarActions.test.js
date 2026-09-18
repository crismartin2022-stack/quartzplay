// ScreenMejorar (the Telegram mini-app version of the scanner) pulls in
// getFrontendConfig() at module load through App.jsx, same as the rest
// of the app's screens, so it is pinned the same way scanPanel.test.js
// pins Web.jsx and Admin.jsx: by slicing the function's source instead
// of rendering it, since there is no testing-library in this project.
import fs from "fs";
import path from "path";

const app = fs.readFileSync(path.resolve(__dirname, "App.jsx"), "utf8");
const start = app.indexOf("function ScreenMejorar");
const end = app.indexOf("// APP ROOT", start);
const screen = app.slice(start, end);

describe("Telegram scanner screen decisions", () => {
  test("derives what it offers from estadoDeAcciones, not from a raw picks_ok check", () => {
    expect(screen).toContain("const estado = estadoDeAcciones(res);");
    expect(screen).not.toContain("res.picks_ok>0&&!boleto");
  });

  test("never returns from generarBoleto in silence when nothing is playable", () => {
    expect(screen).not.toContain("if(!validos.length) return;");
    expect(screen).toContain("if(!estado.puedeJugar){ setErr(estado.mensaje); return; }");
  });

  test("shows the no-playable-picks message where the buttons would be", () => {
    expect(screen).toContain("!estado.puedeJugar&&!boleto&&(");
    expect(screen).toContain("{estado.mensaje}");
  });

  test("offers a stake field and bets through the shared confirm sheet, not a direct fetch", () => {
    expect(screen).toContain('id="qp-stake-mejorar"');
    expect(screen).toContain("Apostar con mi saldo");
    expect(screen).toContain("onBet(picks, stake, res.cuota_total);");
    expect(screen).not.toContain("/api/apuesta");
  });

  test("validates the stake before betting and sends no request for an invalid one", () => {
    expect(screen).toContain("const stake=stakeValido(stakeTexto);");
    expect(screen).toContain('if(stake===null){ setApuestaErr("Ingresá un monto válido para apostar."); return; }');
  });

  test("carries no not-signed-in modal: the mini-app always has init_data", () => {
    expect(screen).not.toContain("ModalNoSesion");
    expect(screen).not.toContain("pideSesion");
  });

  test("reads a dict-shaped refusal through mensajeDeDetalle instead of raw e.detail", () => {
    expect(screen).not.toMatch(/throw new Error\(e\.detail/);
    const detalleUsos = screen.match(/mensajeDeDetalle\(e\.detail\)/g) || [];
    expect(detalleUsos.length).toBe(2);
  });
});
