import fs from "fs";
import path from "path";

// El cash out del Box, ahora con credencial.
//
// El Box tuvo este botón, lo perdió, y volvió. Importa POR QUÉ lo perdió: el
// endpoint que llamaba no pedía nada, así que la terminal cerraba boletos con
// solo tipear el código del ticket —y lo mismo podía hacer cualquiera desde
// cualquier parte—. Ese era el agujero, y esta pantalla era su puerta más
// visible.
//
// Volvió porque la terminal ahora tiene identidad propia. Lo que esta prueba
// cuida es que no vuelva a perderla sin que nadie se entere: son tres cosas que
// se pueden romper en una línea y que no se ven en pantalla hasta que alguien
// cashea un boleto ajeno.
const box = fs.readFileSync(path.resolve(__dirname, "Box.jsx"), "utf8");
const agencia = fs.readFileSync(path.resolve(__dirname, "Agencia.jsx"), "utf8");

// Las dos llamadas al cash out que hace el Box: consultar el valor y ejecutar.
const LLAMADAS_CASHOUT = box.match(/\/api\/betslip\/[^`]*cashout[^`]*/g) || [];

describe("el Box entra por la puerta de la ventanilla", () => {
  test("hace las dos llamadas de cash out", () => {
    // Si esto baja a 0, el botón se fue de nuevo; si sube, apareció una
    // llamada que nadie revisó.
    expect(LLAMADAS_CASHOUT).toHaveLength(2);
  });

  test("ninguna va a la puerta del JUGADOR", () => {
    // `/cashout` a secas es la puerta del jugador: pide la identidad del dueño
    // del boleto y exige que el boleto sea suyo. La terminal no es el dueño de
    // nada, y el boleto de mostrador no es de ningún jugador. Apuntar ahí le
    // daría un 401 permanente, que es exactamente el cartel rojo en el local
    // que se quiso evitar.
    for (const llamada of LLAMADAS_CASHOUT) {
      expect(llamada).toContain("/cashout/agencia");
    }
  });

  test("las dos mandan la credencial de la terminal", () => {
    // Sin el encabezado es 401, y es correcto que lo sea. Lo que no es correcto
    // es que alguien lo saque y el botón quede llamando a un endpoint cerrado.
    const usos = box.match(/cabeceraDeTerminal\(/g) || [];
    expect(usos.length).toBeGreaterThanOrEqual(2);
  });

  test("no manda `ejecutor` en el cuerpo", () => {
    // El rótulo del movimiento de billetera lo pone el servidor con el código
    // de ESTA terminal. Antes lo elegía el cliente ('box', o lo que quisiera):
    // una firma de auditoría que se puede falsificar.
    expect(box).not.toContain('ejecutor:"box"');
    expect(box).not.toContain("ejecutor: \"box\"");
    expect(box).not.toMatch(/ejecutor\s*:/);
  });

  test("el botón solo aparece con credencial Y con permiso", () => {
    // Tres estados y cada uno dice qué falta: sin credencial, el campo del
    // alta; con credencial y sin permiso, a quién pedírselo; con las dos, el
    // botón. Un botón que aparece sin credencial es el cartel rojo de nuevo.
    expect(box).toContain("terminal&&terminal.puede_cashout");
    expect(box).toContain("!credProbando&&!terminal");
  });

  test("la identidad sale del servidor, no del código de la dirección", () => {
    // `/box/AGE002` lo escribe cualquiera. La terminal se identifica contra el
    // servidor y de ahí sale `puede_cashout`.
    expect(box).toContain("identificarse(API, agenciaCode)");
  });

  test("el token lo maneja el módulo de la credencial, no la pantalla", () => {
    // Dónde vive el token y por qué está razonado en un solo lugar
    // (`credencialTerminal.js`). La pantalla no lo lee ni lo escribe a mano:
    // una segunda forma de guardarlo es cómo una se queda vieja.
    // Se miran las LLAMADAS, no la palabra: el comentario de la pantalla nombra
    // `localStorage` para explicar la decisión, y nombrarla es justamente lo que
    // se quiere que siga haciendo.
    expect(box).toContain('from "./credencialTerminal"');
    expect(box).not.toMatch(/localStorage\s*\.\s*(getItem|setItem|removeItem)/);
    expect(box).not.toMatch(/sessionStorage\s*\./);
  });
});

describe("el panel de la agencia emite el alta", () => {
  test("llama al endpoint de la credencial de una terminal suya", () => {
    expect(agencia).toContain("/credencial`");
    expect(agencia).toContain("generarAlta");
  });

  test("manda la sesión de la agencia", () => {
    // Emitir la credencial de una terminal es un acto de la agencia dueña. Sin
    // `authHeaders` es 401 — y del lado del servidor, además, la terminal tiene
    // que ser suya.
    const emision = agencia.slice(agencia.indexOf("const generarAlta"),
                                  agencia.indexOf("const generarAlta") + 900);
    expect(emision).toContain("authHeaders(agencia.token)");
  });

  test("el código de alta no se guarda en ninguna parte", () => {
    // Vive en memoria del componente: no se puede volver a mirar y si se pierde
    // se emite otro. Un código de alta releíble es un secreto a la vista del
    // próximo que abra el panel, y emitir otro cuesta un clic.
    const emision = agencia.slice(agencia.indexOf("const generarAlta"),
                                  agencia.indexOf("const generarAlta") + 900);
    expect(emision).not.toMatch(/localStorage|sessionStorage/);
  });
});
