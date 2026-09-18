// Builds the payload the betslip endpoint expects from the picks the scanner
// returns. Two traps this covers:
//
// 1. The scanner names the chosen bet `selection`; the endpoint expects `sel`
//    and rejects an empty one, which left the visitor stuck on
//    "Faltan datos de la selección" right after a successful read.
// 2. Production validates every odd against the live feed. The names read from
//    a photo rarely match the feed spelling, so whenever our own search already
//    resolved the event we send its names and identifiers instead.

function firstFilled(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function betslipPicks(picks) {
  return (picks || [])
    .filter((pick) => pick && pick.odd_final)
    .map((pick) => {
      const payload = {
        home: firstFilled(pick.home_real, pick.home, pick.h),
        away: firstFilled(pick.away_real, pick.away, pick.a),
        sel: firstFilled(pick.selection, pick.sel, pick.seleccion, pick.label),
        odd: pick.odd_final,
        sport: firstFilled(pick.sport),
      };
      const eventId = firstFilled(pick.event_id, pick.id);
      const sportKey = firstFilled(pick.sport_key);
      if (eventId) payload.event_id = eventId;
      if (sportKey) payload.sport_key = sportKey;
      return payload;
    });
}

export default betslipPicks;
