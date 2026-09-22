import { oscuro as Q, F_BODY, RADII, SPACING, TEXT, inkOn } from "./theme";
import { getFrontendConfig } from "./config";

// What a player sees on the roulette's address while it is switched off
// (see features.js). It says plainly that the game is not available and
// sends them back to the app, rather than showing a table that cannot
// take a bet or an error they would read as their own fault.
const { appOrigin } = getFrontendConfig();

export default function RouletteOff() {
  return (
    <main style={{
      minHeight: "100vh", display: "grid", placeItems: "center",
      padding: SPACING[24], background: Q.void, fontFamily: F_BODY,
    }}>
      <div style={{
        maxWidth: 420, width: "100%", textAlign: "center",
        background: Q.card, borderRadius: RADII.lg,
        padding: `${SPACING[32]}px ${SPACING[24]}px`,
      }}>
        <h1 style={{
          margin: 0, color: Q.text, fontSize: TEXT[20], fontWeight: 700,
        }}>La ruleta no está disponible por ahora</h1>
        <p style={{
          margin: `${SPACING[12]}px 0 ${SPACING[24]}px`, color: Q.muted,
          fontSize: TEXT[14], lineHeight: 1.5,
        }}>
          Tu saldo sigue intacto y lo podés usar en el resto de la app.
        </p>
        <a href={appOrigin} style={{
          display: "inline-block", textDecoration: "none",
          background: Q.violet, color: inkOn(Q.violet),
          fontSize: TEXT[14], fontWeight: 700, borderRadius: RADII.md,
          padding: `${SPACING[12]}px ${SPACING[24]}px`,
        }}>Volver a iaqp</a>
      </div>
    </main>
  );
}
