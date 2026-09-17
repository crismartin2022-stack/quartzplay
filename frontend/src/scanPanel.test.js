import fs from "fs";
import path from "path";

const web = fs.readFileSync(path.resolve(__dirname, "Web.jsx"), "utf8");
const scanner = web.slice(web.indexOf("function BetBestWeb"), web.indexOf("function CampanaWeb"));

describe("public site scanner panel", () => {
  test("presents a clean panel instead of a chat bubble", () => {
    expect(scanner).toContain("Escanear y mejorar");
    expect(scanner).not.toContain("BotMsgWeb");
  });

  test("offers exactly two capture options labelled Camara and Archivo", () => {
    expect(scanner).toContain(">Cámara<");
    expect(scanner).toMatch(/Agregar más"\s*:\s*"Archivo"/);
    expect(scanner).not.toContain("Sacar foto");
    expect(scanner).not.toContain("Galería");
  });

  test("the camera option opens the real camera overlay", () => {
    expect(scanner).toContain("setCamaraAbierta(true)");
    expect(scanner).toContain("<CameraCapture");
  });
});
