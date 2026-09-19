// The public site's scanner is for people we know: without an identity the
// camera and the file picker open the not-signed-in modal and do nothing
// else, and the bet says so before it asks for an amount.
//
// BetBestWeb pulls the whole app's config in at module load, so it is pinned
// the way scanPanel.test.js and screenMejorarActions.test.js pin their
// screens: by reading the source and asserting on the wiring, since there is
// no testing-library in this project. The assertions below are ordering
// assertions on purpose — a gate that is present but runs after the
// FileReader, or after the stake check, is not a gate.
import fs from "fs";
import path from "path";

const web = fs.readFileSync(path.resolve(__dirname, "Web.jsx"), "utf8");

const cortar = (desde, hasta) => {
  const inicio = web.indexOf(desde);
  expect(inicio).toBeGreaterThan(-1);
  const fin = web.indexOf(hasta, inicio + desde.length);
  expect(fin).toBeGreaterThan(inicio);
  return web.slice(inicio, fin);
};

const scanner = cortar("function BetBestWeb", "function ModalNoSesion");
const elegir = cortar("const elegir=(e)=>{", "const quitarImagen=");
const apostar = cortar("const apostar=async()=>{", "const analizar=async()=>{");

describe("the scanner asks one question about identity", () => {
  test("imports the rule instead of restating it", () => {
    expect(web).toMatch(/import\s*\{[^}]*\bhasIdentity\b[^}]*\}\s*from\s*"\.\/betBestActions"/s);
  });

  test("answers it in exactly one place", () => {
    expect(scanner.match(/hasIdentity\(/g)).toHaveLength(1);
  });

  test("counts the identity Telegram provides, not only the browser session", () => {
    const regla = cortar("const identified=", ";");
    expect(regla).toContain("sesion");
    expect(regla).toContain("window.Telegram?.WebApp?.initData");
  });

  test("the gate opens the modal and reports that it stopped the caller", () => {
    const puerta = cortar("const requireIdentity=", "};");
    expect(puerta).toContain("identified()");
    expect(puerta).toContain("setPideSesion(true)");
    expect(puerta).toContain("return false;");
  });
});

describe("the camera, with no identity", () => {
  test("asks the gate before opening the camera", () => {
    expect(scanner).toMatch(/onClick=\{\(\)=>\{\s*if\(!requireIdentity\(\)\) return;\s*setCamaraAbierta\(true\);/);
  });

  test("no longer opens the camera unconditionally", () => {
    expect(scanner).not.toContain("onClick={()=>setCamaraAbierta(true)}");
  });
});

describe("the file picker, with no identity", () => {
  test("does not even open the file dialog", () => {
    expect(scanner).toMatch(/<label[^>]*onClick=\{[^}]*requireIdentity\(\)[^}]*preventDefault\(\)/s);
  });

  test("gates before a single byte of the image is read", () => {
    expect(elegir).toContain("requireIdentity()");
    expect(elegir.indexOf("requireIdentity()")).toBeLessThan(elegir.indexOf("new FileReader"));
    expect(elegir.indexOf("requireIdentity()")).toBeLessThan(elegir.indexOf("readAsDataURL"));
    expect(elegir.indexOf("requireIdentity()")).toBeLessThan(elegir.indexOf("e.target.files"));
  });

  test("the gate is the first thing the handler does, and it returns", () => {
    expect(elegir).toMatch(/const elegir=\(e\)=>\{\s*(\/\/[^\n]*\n\s*)*if\(!requireIdentity\(\)\)\{[^}]*return;\s*\}/);
  });
});

describe("the missing account is the first thing said", () => {
  test("apostar asks about the identity before the amount", () => {
    expect(apostar).toContain("requireIdentity()");
    expect(apostar.indexOf("requireIdentity()")).toBeLessThan(apostar.indexOf("stakeValido(stakeTexto)"));
    expect(apostar.indexOf("requireIdentity()")).toBeLessThan(apostar.indexOf("Ingresá un monto válido"));
  });

  test("still refuses to bet without the browser token the endpoint needs", () => {
    expect(apostar).toContain("if(!sesion?.token){ setPideSesion(true); return; }");
  });
});

describe("the screen does not promise otherwise", () => {
  // Scoped to the scanner on purpose. The terminal landing still says an
  // account is unnecessary, and it is still right: choosing matches and
  // generating a code to pay at the counter never asks for one. Only
  // scanning does.
  test("the scanner does not tell a visitor an account is unnecessary", () => {
    expect(scanner).not.toContain("No hace falta cuenta");
    expect(scanner).not.toMatch(/sin registrarse/i);
  });
});
