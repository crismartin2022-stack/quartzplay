import fs from "fs";
import path from "path";
import {
  interpretarConfigSportsbook, SPORTSBOOK_APAGADO,
  AVISO_SPORTSBOOK_APAGADO, AVISO_APUESTA_SIN_RESOLVER,
} from "./configSportsbook";

// Source-based, como los demás de este repo: no hay DOM para App/Web/Admin.
const leer = (f) => fs.readFileSync(path.resolve(__dirname, f), "utf8");

// El jugador solo ve la entrada si el servidor dice que está prendido Y hay
// un juego que abrir. Cualquier otra cosa es apagado: una entrada que no abre
// nada es peor que ninguna.
describe("interpretarConfigSportsbook", () => {
  test("sin respuesta, o apagado, no hay entrada", () => {
    expect(interpretarConfigSportsbook(null)).toBe(SPORTSBOOK_APAGADO);
    expect(interpretarConfigSportsbook(undefined)).toBe(SPORTSBOOK_APAGADO);
    expect(interpretarConfigSportsbook({ activo: false })).toBe(SPORTSBOOK_APAGADO);
  });

  test("solo el booleano true lo prende, no un texto", () => {
    const juego = { id: "1140", titulo: "Sports", integracion: "content360" };
    expect(interpretarConfigSportsbook({ activo: "false", juego }).activo).toBe(false);
    expect(interpretarConfigSportsbook({ activo: 1, juego }).activo).toBe(false);
  });

  test("prendido pero sin juego que abrir cuenta como apagado", () => {
    expect(interpretarConfigSportsbook({ activo: true }).activo).toBe(false);
    expect(interpretarConfigSportsbook({ activo: true, juego: { id: "" } }).activo).toBe(false);
  });

  test("prendido con juego devuelve lo necesario para lanzarlo", () => {
    expect(interpretarConfigSportsbook({
      activo: true,
      juego: { id: 1140, titulo: "Sports", integracion: "content360" },
    })).toEqual({
      activo: true,
      conHistorial: false,
      juego: { id: "1140", titulo: "Sports", integracion: "content360" },
    });
  });

  test("apagado, quien ya apostó conserva la entrada pero sin juego que abrir", () => {
    expect(interpretarConfigSportsbook({ activo: false, con_historial: true }))
      .toEqual({ activo: false, juego: null, conHistorial: true });
  });

  test("apagado, solo el booleano true de con_historial conserva la entrada", () => {
    expect(interpretarConfigSportsbook({ activo: false, con_historial: "true" }))
      .toBe(SPORTSBOOK_APAGADO);
    expect(interpretarConfigSportsbook({ activo: false })).toBe(SPORTSBOOK_APAGADO);
  });
});

// Cada palabra de estos textos está elegida para no prometer lo que no
// controlamos: sin "te vamos a avisar" (no hay aviso) ni "tenés una apuesta
// abierta" (no se puede saber). Esta prueba existe para que nadie los
// "mejore" sin leer por qué.
describe("el aviso del sportsbook apagado", () => {
  test("dice exactamente lo aprobado", () => {
    expect(AVISO_SPORTSBOOK_APAGADO)
      .toBe("El sportsbook no está disponible por ahora.");
    expect(AVISO_APUESTA_SIN_RESOLVER).toBe(
      "Si tenés una apuesta sin resolver, se te va a acreditar igual\n"
      + "cuando el resultado llegue. No hace falta que hagas nada.");
  });

  test("no promete avisos ni afirma que haya una apuesta abierta", () => {
    const todo = `${AVISO_SPORTSBOOK_APAGADO} ${AVISO_APUESTA_SIN_RESOLVER}`;
    expect(todo).not.toMatch(/avis(ar|aremos|amos)/i);
    expect(todo).not.toMatch(/tenés una apuesta abierta/i);
  });

  test("la pantalla muestra el segundo párrafo solo a quien ya apostó", () => {
    const pantalla = leer("SportsbookC360.jsx");
    expect(pantalla).toMatch(/config\.conHistorial && \(/);
    expect(pantalla).toMatch(/AVISO_APUESTA_SIN_RESOLVER/);
  });
});

describe("el sportsbook está cableado en las dos pantallas y en el admin", () => {
  test("la mini-app muestra la tarjeta solo con la bandera y tiene su pantalla", () => {
    const app = leer("App.jsx");
    expect(app).toMatch(/useSportsbookC360\(user\?\.id\)/);
    expect(app).toMatch(/sportsbook\.visible&&\(\s*<div onClick=\{\(\)=>onNav\("sportsbook"\)\}/);
    expect(app).toMatch(/screen==="sportsbook"&&<SportsbookC360/);
  });

  test("el sitio muestra portada y barra lateral solo con la bandera", () => {
    const web = leer("Web.jsx");
    expect(web).toMatch(/useSportsbookC360\(sesion\?\.user\?\.id\)/);
    expect(web).toMatch(/if\(sportsbook\) NAV\.splice/);
    expect(web).toMatch(/sportsbook=\{sportsbook\.visible\}/);
    expect(web).toMatch(/vista==="sportsbook"/);
    expect(leer("InicioWeb.jsx")).toMatch(/\{sportsbook&&\(\s*<Carta/);
  });

  test("la pantalla reusa el marco existente y no arma otro iframe", () => {
    const pantalla = leer("SportsbookC360.jsx");
    expect(pantalla).toMatch(/import JuegoEnMarco from "\.\/JuegoEnMarco"/);
    expect(pantalla).not.toMatch(/<iframe/);
  });

  test("el admin tiene el interruptor en la config del casino", () => {
    const admin = leer("Admin.jsx");
    expect(admin).toMatch(/\/api\/admin\/sportsbook-c360/);
    expect(admin).toMatch(/solapa==="sportsbook"&&/);
  });
});
