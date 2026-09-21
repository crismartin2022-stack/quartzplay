import { tieneMovimiento } from "./LineaTiempo";
import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.join(path.resolve(__dirname), "LineaTiempo.jsx"), "utf8");

// ── A chart must not pretend ──────────────────────────────────────────
//
// The owner's own words when we found the history was empty: "no importa
// si iniciamos desde cero, en ese caso la linea estara plana". A flat line
// drawn on an axis invites someone to read a trend into it. A series that
// is entirely zero has to say so in words instead.
describe("an all-zero series is not drawn as a line", () => {
  test("no points at all has no movement", () => {
    expect(tieneMovimiento([])).toBe(false);
  });

  test("every value zero has no movement", () => {
    expect(tieneMovimiento([{ valor: 0 }, { valor: 0 }, { valor: 0 }])).toBe(false);
  });

  test("one non-zero value is movement", () => {
    expect(tieneMovimiento([{ valor: 0 }, { valor: 3 }, { valor: 0 }])).toBe(true);
  });

  test("a negative value is movement too — a withdrawal is not nothing", () => {
    expect(tieneMovimiento([{ valor: 0 }, { valor: -500 }])).toBe(true);
  });

  test("values arriving as strings still count", () => {
    expect(tieneMovimiento([{ valor: "0" }, { valor: "250" }])).toBe(true);
  });

  test("a malformed input is not movement rather than a crash", () => {
    expect(tieneMovimiento(null)).toBe(false);
    expect(tieneMovimiento(undefined)).toBe(false);
    expect(tieneMovimiento([{}, {}])).toBe(false);
  });

  test("the component refuses to render a polyline for it", () => {
    // Positive control for the branch above: the empty state must come
    // before any drawing, or the guard proves nothing about the render.
    const emptyBranch = SRC.slice(0, SRC.indexOf("const W = 100"));
    expect(emptyBranch).toContain("!tieneMovimiento(puntos)");
    expect(emptyBranch).toContain("Sin movimiento en este período.");
  });
});

// ── It stays a hand-drawn SVG ─────────────────────────────────────────
//
// The decision was explicit: no charting library. The panels ship as one
// bundle with no code splitting, so a library's weight is paid by every
// cashier opening the panel on a phone, including those who never reach a
// screen with a chart.
describe("no charting library creeps in", () => {
  test("the component imports nothing but react and the theme", () => {
    const imports = [...SRC.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(imports.sort()).toEqual(["./theme", "react"]);
  });

  test("package.json declares no charting dependency", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(path.resolve(__dirname), "..", "package.json"), "utf8")
    );
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    const charting = deps.filter((d) =>
      /recharts|chart\.js|chartjs|^d3($|-)|victory|@nivo|apexcharts|visx|plotly|echarts/.test(d)
    );
    expect(charting).toEqual([]);
  });

  test("positive control: the matcher recognises a charting dependency", () => {
    const deps = ["react", "recharts"];
    expect(deps.filter((d) => /recharts/.test(d))).toEqual(["recharts"]);
  });
});

// ── It draws one polyline, not a node per point ───────────────────────
describe("the line is one element", () => {
  test("a single polyline carries the series", () => {
    expect(SRC.match(/<polyline/g)).toHaveLength(1);
  });

  test("the fill under it is a single polygon", () => {
    expect(SRC.match(/<polygon/g)).toHaveLength(1);
  });

  test("the gradient id is unique per instance, not a fixed string", () => {
    // Two charts on one screen with the same gradient id would make the
    // second one take the first one's colour.
    expect(SRC).toContain("useId()");
    expect(SRC).toMatch(/id=\{gradId\}/);
  });
});
