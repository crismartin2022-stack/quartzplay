// App.jsx reads its API destination at module load time
// (getFrontendConfig()), so these env vars have to be set before the
// module is required — a static top-level `import` would run before
// any `process.env` assignment in this file.
const STAGING_ENV = {
  REACT_APP_ENV: "staging",
  REACT_APP_API_URL: "https://api.staging.quartzplay.example",
  REACT_APP_IAQP_URL: "https://casino.staging.iaqp.example",
  REACT_APP_APP_ORIGIN: "https://staging.quartzplay.example",
  REACT_APP_CASINO_HOSTS: "casino.staging.iaqp.example",
  REACT_APP_BOT_USERNAME: "quartzplay_staging_bot",
};

let normalizarPicks;
let picksDeCombo;

beforeAll(() => {
  Object.assign(process.env, STAGING_ENV);
  ({ normalizarPicks, picksDeCombo } = require("./App"));
});

describe("normalizarPicks", () => {
  const scanned = {
    home: "Bayern de Munich",
    away: "Union Berlin",
    home_real: "FC Bayern Munich",
    away_real: "1. FC Union Berlin",
    selection: "FC Bayern Munich gana",
    label: "should never win over selection",
    odd: 1.4,
    event_id: "evt-1",
    sport_key: "soccer_germany_bundesliga",
    market: "h2h",
    commence_time: "2026-09-20T18:00:00+00:00",
  };

  test("keeps the corrected teams over the ones originally read", () => {
    const [pick] = normalizarPicks([scanned]);
    expect(pick.home).toBe("FC Bayern Munich");
    expect(pick.away).toBe("1. FC Union Berlin");
  });

  test("keeps the scanner's selection", () => {
    const [pick] = normalizarPicks([scanned]);
    expect(pick.sel).toBe("FC Bayern Munich gana");
  });

  test("keeps market and commence_time", () => {
    const [pick] = normalizarPicks([scanned]);
    expect(pick.market).toBe("h2h");
    expect(pick.commence_time).toBe("2026-09-20T18:00:00+00:00");
  });

  test("still supports the label/sel shape used by the rest of the app", () => {
    const [pick] = normalizarPicks([{ h: "Racing", a: "Sarmiento", label: "Racing", odd: 2.1 }]);
    expect(pick.home).toBe("Racing");
    expect(pick.sel).toBe("Racing");
  });

  test("never puts a team name in event_id when the pick carries a real one", () => {
    const [pick] = normalizarPicks([scanned]);
    expect(pick.event_id).toBe("evt-1");
    expect(pick.event_id).not.toBe(scanned.home_real);
    expect(pick.event_id).not.toBe(scanned.home);
  });
});

describe("picksDeCombo", () => {
  const comboPick = {
    h: "River", a: "Boca", sel: "River gana", odd: 1.9,
    event_id: "evt-9", sport_key: "soccer_argentina_primera_division",
    market: "h2h", commence_time: "2026-09-22T21:00:00+00:00",
  };

  test("uses the event id, never the home team name, as id", () => {
    const [pick] = picksDeCombo([comboPick]);
    expect(pick.id).toBe("evt-9");
    expect(pick.id).not.toBe(comboPick.h);
  });

  test("keeps event_id, sport_key, market and commence_time", () => {
    const [pick] = picksDeCombo([comboPick]);
    expect(pick.event_id).toBe("evt-9");
    expect(pick.sport_key).toBe("soccer_argentina_primera_division");
    expect(pick.market).toBe("h2h");
    expect(pick.commence_time).toBe("2026-09-22T21:00:00+00:00");
  });

  test("keeps the teams and the selection", () => {
    const [pick] = picksDeCombo([comboPick]);
    expect(pick.h).toBe("River");
    expect(pick.a).toBe("Boca");
    expect(pick.label).toBe("River gana");
  });

  test("normalizarPicks then keeps the same identity, never a team name in event_id", () => {
    const [pick] = normalizarPicks(picksDeCombo([comboPick]));
    expect(pick.event_id).toBe("evt-9");
    expect(pick.event_id).not.toBe(comboPick.h);
  });
});
