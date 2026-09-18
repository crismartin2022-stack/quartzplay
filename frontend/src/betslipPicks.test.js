import { betslipPicks } from "./betslipPicks";

const scannedPick = {
  home: "Bayern de Múnich",
  away: "Union Berlin",
  market: "h2h",
  selection: "Bayern de Múnich",
  odd_original: 1.35,
  odd_final: 1.4,
};

describe("betslip payload from scanned picks", () => {
  test("keeps the selection read from the ticket", () => {
    expect(betslipPicks([scannedPick])).toEqual([
      {
        home: "Bayern de Múnich",
        away: "Union Berlin",
        sel: "Bayern de Múnich",
        odd: 1.4,
        sport: "",
      },
    ]);
  });

  test("accepts the corrected selection and the corrected teams", () => {
    const corrected = { ...scannedPick, selection: "Empate", home_real: "Bayern", away_real: "Union" };
    const [pick] = betslipPicks([corrected]);
    expect(pick.sel).toBe("Empate");
    // The correction carries the event as our feed names it, and that is the
    // name the ticket must travel with.
    expect(pick.home).toBe("Bayern");
  });

  test("supports the short shapes used elsewhere in the app", () => {
    const [pick] = betslipPicks([{ h: "Racing", a: "Sarmiento", sel: "Racing", odd_final: 2.1, sport: "soccer" }]);
    expect(pick).toEqual({ home: "Racing", away: "Sarmiento", sel: "Racing", odd: 2.1, sport: "soccer" });
  });

  test("prefers the names and identifiers our feed resolved", () => {
    const resolved = {
      ...scannedPick,
      home_real: "FC Bayern Munich",
      away_real: "1. FC Union Berlin",
      event_id: "evt-1",
      sport_key: "soccer_germany_bundesliga",
    };
    const [pick] = betslipPicks([resolved]);
    expect(pick.home).toBe("FC Bayern Munich");
    expect(pick.away).toBe("1. FC Union Berlin");
    expect(pick.event_id).toBe("evt-1");
    expect(pick.sport_key).toBe("soccer_germany_bundesliga");
  });

  test("drops picks without a final odd", () => {
    expect(betslipPicks([{ ...scannedPick, odd_final: null }])).toEqual([]);
  });

  test("never produces an empty selection for a pick it keeps", () => {
    const picks = betslipPicks([
      scannedPick,
      { home: "Brentford", away: "Chelsea", label: "Chelsea", odd_final: 1.9 },
      { home: "Racing", away: "Sarmiento", seleccion: "Racing", odd_final: 2.2 },
    ]);
    expect(picks).toHaveLength(3);
    picks.forEach((pick) => expect(pick.sel).not.toBe(""));
  });
});
