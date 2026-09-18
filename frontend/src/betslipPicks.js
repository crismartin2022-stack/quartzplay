// Builds the payload the betslip endpoint expects from the picks the scanner
// returns. The scanner names the chosen bet `selection`; the endpoint expects
// `sel` and rejects the request when it arrives empty, which left the visitor
// stuck on "Faltan datos de la selección" after a successful read.

function firstFilled(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function betslipPicks(picks) {
  return (picks || [])
    .filter((pick) => pick && pick.odd_final)
    .map((pick) => ({
      home: firstFilled(pick.home, pick.h, pick.home_real),
      away: firstFilled(pick.away, pick.a, pick.away_real),
      sel: firstFilled(pick.selection, pick.sel, pick.seleccion, pick.label),
      odd: pick.odd_final,
      sport: firstFilled(pick.sport),
    }));
}

export default betslipPicks;
