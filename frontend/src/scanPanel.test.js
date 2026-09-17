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

const admin = fs.readFileSync(path.resolve(__dirname, "Admin.jsx"), "utf8");
const adminScanner = admin.slice(admin.indexOf("function EscanearComboAdmin"), admin.indexOf("function", admin.indexOf("function EscanearComboAdmin") + 40));

describe("admin scan screen", () => {
  test("the camera option opens the in-app camera instead of a file hint", () => {
    expect(adminScanner).toContain("<CameraCapture");
    expect(adminScanner).not.toContain("capture=\"environment\"");
  });

  test("keeps the file option", () => {
    expect(adminScanner).toMatch(/Agregar más"\s*:\s*"Archivo"/);
  });
});
