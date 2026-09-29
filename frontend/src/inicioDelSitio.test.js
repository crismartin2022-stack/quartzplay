import {
  normalizarVivos, elegirCombo, cuotaDelCombo, picksDelCombo, cuotasDelPartido,
} from "./inicioDelSitio";

describe("normalizarVivos", () => {
  test("lee {matches} que es lo que manda el servidor", () => {
    const r = normalizarVivos({ matches: [{ id: "1", home: "A", away: "B", liga: "L" }] });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: "1", h: "A", a: "B", liga: "L" });
  });
  test("sigue aceptando las formas viejas", () => {
    const r = normalizarVivos({
      sports: [{ name: "Liga X", events: [{ id: "2", home: "C", away: "D" }] }],
      events: [{ id: "3", home: "E", away: "F" }],
    });
    expect(r.map(e => e.id)).toEqual(["2", "3"]);
    expect(r[0].liga).toBe("Liga X");
  });
  test("sin respuesta no revienta", () => {
    expect(normalizarVivos(null)).toEqual([]);
    expect(normalizarVivos({})).toEqual([]);
  });
});

describe("elegirCombo", () => {
  test("el de la casa le gana al de la IA", () => {
    const c = elegirCombo({ combos: [{ id: "m1" }] }, { combos: [{ id: "ia1" }] });
    expect(c.id).toBe("m1");
  });
  test("sin manuales, el primero de la IA", () => {
    expect(elegirCombo({ combos: [] }, { combos: [{ id: "ia1" }] }).id).toBe("ia1");
  });
  test("sin nada, null", () => {
    expect(elegirCombo(null, undefined)).toBeNull();
  });
});

describe("cuotaDelCombo", () => {
  test("multiplica las cuotas", () => {
    expect(cuotaDelCombo({ picks: [{ odd: 2 }, { odd: 1.5 }] })).toBeCloseTo(3);
  });
  test("un pick sin cuota cuenta como 1", () => {
    expect(cuotaDelCombo({ picks: [{ odd: 2 }, {}] })).toBe(2);
  });
  test("sin picks es 1", () => {
    expect(cuotaDelCombo(null)).toBe(1);
  });
});

describe("picksDelCombo", () => {
  test("convierte al formato del boleto", () => {
    const [p] = picksDelCombo({ picks: [{ event_id: "e1", h: "A", a: "B", sel: "A gana", odd: 1.8 }] });
    expect(p).toMatchObject({ id: "e1", label: "A gana", odd: 1.8, market: "h2h", h: "A", a: "B" });
  });
  test("sin event_id, dos partidos distintos no chocan", () => {
    const r = picksDelCombo({ picks: [
      { h: "A", a: "B", sel: "A gana", odd: 2 },
      { h: "C", a: "D", sel: "C gana", odd: 2 },
    ] });
    expect(new Set(r.map(p => p.id)).size).toBe(2);
  });
  test("respeta el mercado si viene", () => {
    expect(picksDelCombo({ picks: [{ h: "A", a: "B", sel: "Más de 2.5", odd: 1.9, market: "totals" }] })[0].market)
      .toBe("totals");
  });
});

describe("cuotasDelPartido", () => {
  test("hasta tres cuotas en orden", () => {
    const r = cuotasDelPartido({ markets: { h2h: { A: 2, Draw: 3, B: 4, extra: 9 } } });
    expect(r.map(x => x.nombre)).toEqual(["A", "Draw", "B"]);
  });
  test("sin mercado, vacío", () => {
    expect(cuotasDelPartido({})).toEqual([]);
  });
});
