import {
  picksJugables,
  estadoDeAcciones,
  stakeValido,
  mensajeDeDetalle,
  cuerpoDeApuesta,
  hasIdentity,
} from "./betBestActions";

const matched = { home: "River", away: "Boca", selection: "River", odd_final: 1.8 };
const unmatched = { home: "Talleres", away: "Belgrano", selection: "Talleres", odd_final: null };

describe("picksJugables", () => {
  test("keeps every pick when every pick was matched", () => {
    expect(picksJugables({ picks: [matched, { ...matched, selection: "Boca" }] })).toHaveLength(2);
  });

  test("keeps only the matched picks when some were not", () => {
    expect(picksJugables({ picks: [matched, unmatched] })).toEqual([matched]);
  });

  test("returns an empty list when none were matched", () => {
    expect(picksJugables({ picks: [unmatched] })).toEqual([]);
  });

  test("returns an empty list for a null or undefined result", () => {
    expect(picksJugables(null)).toEqual([]);
    expect(picksJugables(undefined)).toEqual([]);
  });
});

describe("estadoDeAcciones", () => {
  test("offers to play when every pick was matched", () => {
    const res = { picks: [matched, { ...matched, selection: "Boca" }], picks_total: 2 };
    const estado = estadoDeAcciones(res);
    expect(estado.puedeJugar).toBe(true);
    expect(estado.jugables).toHaveLength(2);
    expect(estado.faltantes).toBe(0);
    expect(estado.mensaje).toBe("");
  });

  test("offers the matched picks and counts the ones left out", () => {
    const res = { picks: [matched, unmatched], picks_total: 2 };
    const estado = estadoDeAcciones(res);
    expect(estado.puedeJugar).toBe(true);
    expect(estado.jugables).toEqual([matched]);
    expect(estado.faltantes).toBe(1);
    expect(estado.mensaje).toBe("");
  });

  test("offers nothing and states that the scan can be repeated when none matched", () => {
    const res = { picks: [unmatched], picks_total: 1 };
    const estado = estadoDeAcciones(res);
    expect(estado.puedeJugar).toBe(false);
    expect(estado.jugables).toEqual([]);
    expect(estado.faltantes).toBe(1);
    expect(estado.mensaje.length).toBeGreaterThan(0);
    expect(estado.mensaje).toMatch(/escane/i);
  });

  test("handles a null result without throwing", () => {
    const estado = estadoDeAcciones(null);
    expect(estado.puedeJugar).toBe(false);
    expect(estado.total).toBe(0);
  });
});

describe("stakeValido", () => {
  test("rejects an empty stake", () => {
    expect(stakeValido("")).toBeNull();
    expect(stakeValido("   ")).toBeNull();
  });

  test("rejects a zero stake", () => {
    expect(stakeValido("0")).toBeNull();
  });

  test("rejects a negative stake", () => {
    expect(stakeValido("-100")).toBeNull();
  });

  test("rejects a non-numeric stake", () => {
    expect(stakeValido("abc")).toBeNull();
    expect(stakeValido(undefined)).toBeNull();
    expect(stakeValido(null)).toBeNull();
  });

  test("rounds a decimal stake the way the rest of the app does", () => {
    expect(stakeValido("1500.6")).toBe(1501);
  });

  test("accepts a valid whole stake", () => {
    expect(stakeValido("2000")).toBe(2000);
    expect(stakeValido(2000)).toBe(2000);
  });
});

describe("mensajeDeDetalle", () => {
  test("passes a plain string through as the message", () => {
    expect(mensajeDeDetalle("Saldo insuficiente")).toEqual({
      reason: "",
      mensaje: "Saldo insuficiente",
    });
  });

  test("reads a dict's reason and message", () => {
    expect(mensajeDeDetalle({ reason: "login_required", message: "Iniciá sesión para apostar" }))
      .toEqual({ reason: "login_required", mensaje: "Iniciá sesión para apostar" });
  });

  test("falls back to a readable message when the dict has none", () => {
    const { reason, mensaje } = mensajeDeDetalle({ reason: "saldo_insuficiente" });
    expect(reason).toBe("saldo_insuficiente");
    expect(mensaje.length).toBeGreaterThan(0);
    expect(mensaje).not.toBe("[object Object]");
  });

  test("gives a generic message for an undefined detail", () => {
    const { reason, mensaje } = mensajeDeDetalle(undefined);
    expect(reason).toBe("");
    expect(mensaje.length).toBeGreaterThan(0);
  });
});

describe("cuerpoDeApuesta", () => {
  test("bets with balance, mapping picks through the ticket mapper", () => {
    const body = cuerpoDeApuesta({ picks: [matched], stake: 2000, initData: "", refCode: null });
    expect(body.modo).toBe("saldo");
    expect(body.stake).toBe(2000);
    expect(body.picks).toEqual([
      { home: "River", away: "Boca", sel: "River", odd: 1.8, sport: "" },
    ]);
  });

  test("carries the Telegram identity through init_data", () => {
    const body = cuerpoDeApuesta({ picks: [matched], stake: 500, initData: "query_id=abc", refCode: null });
    expect(body.init_data).toBe("query_id=abc");
  });

  test("carries no init_data for a browser session, leaving the bearer header to identify it", () => {
    const body = cuerpoDeApuesta({ picks: [matched], stake: 500, initData: "", refCode: null });
    expect(body.init_data).toBe("");
    expect(body.token).toBeUndefined();
  });

  test("carries the referral code when there is one", () => {
    const body = cuerpoDeApuesta({ picks: [matched], stake: 500, initData: "", refCode: "influ1" });
    expect(body.inf_code).toBe("influ1");
    expect(body.codigo_influencer).toBe("influ1");
  });

  test("omits the referral fields when there is none", () => {
    const body = cuerpoDeApuesta({ picks: [matched], stake: 500, initData: "", refCode: null });
    expect(body).not.toHaveProperty("inf_code");
    expect(body).not.toHaveProperty("codigo_influencer");
  });
});

describe("hasIdentity", () => {
  test("an open browser session counts", () => {
    expect(hasIdentity({ sesion: { token: "abc123" } })).toBe(true);
  });

  test("the identity Telegram provides counts, with no browser session", () => {
    expect(hasIdentity({ sesion: null, initData: "query_id=abc&user=%7B%7D" })).toBe(true);
  });

  test("neither present is no identity", () => {
    expect(hasIdentity({ sesion: null, initData: "" })).toBe(false);
    expect(hasIdentity({})).toBe(false);
    expect(hasIdentity()).toBe(false);
  });

  test("a session without a token is no identity", () => {
    expect(hasIdentity({ sesion: {} })).toBe(false);
    expect(hasIdentity({ sesion: { token: "" } })).toBe(false);
    expect(hasIdentity({ sesion: { user: { id: 7 } } })).toBe(false);
  });

  test("blank Telegram init data is no identity", () => {
    expect(hasIdentity({ sesion: null, initData: "   " })).toBe(false);
    expect(hasIdentity({ sesion: null, initData: undefined })).toBe(false);
  });

  test("a session and Telegram together still count", () => {
    expect(hasIdentity({ sesion: { token: "abc123" }, initData: "query_id=abc" })).toBe(true);
  });
});
