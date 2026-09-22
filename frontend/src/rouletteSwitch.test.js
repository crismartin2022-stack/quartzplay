import fs from "fs";
import path from "path";
import { ROULETTE_ENABLED } from "./features";

const read = (name) => fs.readFileSync(path.join(path.resolve(__dirname), name), "utf8");
const INDEX = read("index.js");

// The roulette has two ways in: the /casino path and any host listed in
// REACT_APP_CASINO_HOSTS. Switching it off has to close both. A guard that
// only checked the path would let the dedicated casino domain keep serving
// the table.
function doorsFor(source) {
  return {
    path: (source.match(/path\.startsWith\('\/casino'\)\s*\?\s*(\w+)/) || [])[1],
    host: (source.match(/esCasino\s*\?\s*(\w+)/) || [])[1],
  };
}

describe("the roulette switch closes every way in", () => {
  test("both doors are found at all", () => {
    // Positive control: if the router is reshaped and neither pattern
    // matches, the assertions below would pass on undefined.
    const doors = doorsFor(INDEX);
    expect(doors.path).toBeDefined();
    expect(doors.host).toBeDefined();
  });

  test("both doors go through the switch, never straight to the table", () => {
    const doors = doorsFor(INDEX);
    expect(doors.path).toBe("Roulette");
    expect(doors.host).toBe("Roulette");
  });

  test("the switch picks the notice when the roulette is off", () => {
    expect(INDEX).toMatch(/const Roulette = ROULETTE_ENABLED \? Casino : RouletteOff;/);
  });

  test("positive control: a door wired straight to Casino is caught", () => {
    const leaky = "path.startsWith('/casino')  ? Casino\n : esCasino ? Roulette";
    expect(doorsFor(leaky).path).toBe("Casino");
  });
});

describe("the roulette is off today", () => {
  // A decision, not a default: this test is the record of it. Turning the
  // roulette back on means changing this expectation in the same PR, on
  // purpose, where a reviewer can see it.
  test("ROULETTE_ENABLED is false", () => {
    expect(ROULETTE_ENABLED).toBe(false);
  });

  test("the screen and its components stay in the repository", () => {
    // Switched off, not deleted: it may come back.
    for (const name of ["Casino.jsx", "Rueda3D.jsx"]) {
      expect(fs.existsSync(path.join(path.resolve(__dirname), name))).toBe(true);
    }
  });
});

describe("the notice screen", () => {
  const OFF = read("RouletteOff.jsx");

  test("sends the player back to the app instead of a dead end", () => {
    expect(OFF).toMatch(/href=\{appOrigin\}/);
  });

  test("uses the theme's type scale, nothing below the 12px floor", () => {
    const literal = [...OFF.matchAll(/fontSize\s*:\s*(\d+)/g)].map((m) => Number(m[1]));
    expect(literal.filter((v) => v < 12)).toEqual([]);
    expect(OFF).toMatch(/fontSize: TEXT\[/);
  });
});
