import { useId, useMemo, useState } from "react";
import { oscuro as Q, F_BODY, F_MONO, TEXT, SPACING, RADII } from "./theme";

// LineaTiempo — one cartesian line, drawn by hand.
//
// Deliberately not a charting library. The panels ship as a single bundle
// with no code splitting, so a library's 50-100 KB would be downloaded by
// every cashier opening the panel on a phone, including the ones who never
// reach a screen that draws a chart. A polyline is one SVG element and a
// couple of kilobytes of code; the browser rasterises it in one pass no
// matter how many points it holds.
//
// The real cost of a chart here is the GROUP BY behind it, not the drawing.
//
// What it will NOT do: pretend. A series that is entirely zero renders as a
// sentence saying there is no movement yet, not as a flat line on an axis
// that invites you to read a trend into it.

const PAD_L = 8;
const PAD_R = 8;
const PAD_T = 12;
const PAD_B = 20;

function extent(values) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (lo === Infinity) return [0, 0];
  // A series that never moves still needs a band to sit in, or it divides
  // by zero and lands on the top edge.
  if (lo === hi) return [Math.min(0, lo), hi === 0 ? 1 : hi * 1.2];
  return [Math.min(0, lo), hi];
}

export function tieneMovimiento(puntos) {
  // `Number.isFinite` and not just `!== 0`: a row arriving without its
  // `valor` reads as NaN, and NaN is not equal to zero, so the naive check
  // called a payload of empty objects "movement" and drew a line of NaN.
  return Array.isArray(puntos) && puntos.some((p) => {
    const v = Number(p?.valor);
    return Number.isFinite(v) && v !== 0;
  });
}

export default function LineaTiempo({
  puntos = [],
  color = Q.violet,
  alto = 140,
  formato = (v) => String(v),
  etiqueta = "",
}) {
  const gradId = useId();
  const [encima, setEncima] = useState(null);

  const serie = useMemo(
    () => (Array.isArray(puntos) ? puntos.map((p) => Number(p?.valor) || 0) : []),
    [puntos]
  );

  if (serie.length === 0 || !tieneMovimiento(puntos)) {
    return (
      <div style={{
        height: alto, display: "flex", alignItems: "center",
        justifyContent: "center", background: Q.inset,
        borderRadius: RADII.md, padding: SPACING[16],
        color: Q.dim, fontSize: TEXT[12], fontFamily: F_BODY,
        textAlign: "center",
      }}>
        {serie.length === 0
          ? "Todavía no hay datos para este período."
          : "Sin movimiento en este período."}
      </div>
    );
  }

  const W = 100;
  const H = alto;
  const [lo, hi] = extent(serie);
  const span = hi - lo || 1;
  const stepX = serie.length > 1 ? (W - PAD_L - PAD_R) / (serie.length - 1) : 0;
  const x = (i) => PAD_L + i * stepX;
  const y = (v) => PAD_T + (1 - (v - lo) / span) * (H - PAD_T - PAD_B);

  const linea = serie.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const area = `${PAD_L},${y(lo)} ${linea} ${x(serie.length - 1)},${y(lo)}`;

  const primero = puntos[0]?.fecha || "";
  const ultimo = puntos[puntos.length - 1]?.fecha || "";
  const punto = encima == null ? null : puntos[encima];

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={etiqueta || "Serie en el tiempo"}
        style={{ width: "100%", height: alto, display: "block", overflow: "visible" }}
        onMouseLeave={() => setEncima(null)}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          if (box.width === 0) return;
          const rel = ((e.clientX - box.left) / box.width) * W;
          const i = Math.round((rel - PAD_L) / (stepX || 1));
          setEncima(Math.max(0, Math.min(serie.length - 1, i)));
        }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Three rules, not a grid: enough to read a height against,
            not enough to compete with the line. */}
        {[0, 0.5, 1].map((t) => (
          <line
            key={t}
            x1={PAD_L} x2={W - PAD_R}
            y1={PAD_T + t * (H - PAD_T - PAD_B)}
            y2={PAD_T + t * (H - PAD_T - PAD_B)}
            stroke={Q.border} strokeOpacity="0.5" strokeWidth="0.15"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <polygon points={area} fill={`url(#${gradId})`} />
        <polyline
          points={linea} fill="none" stroke={color} strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {punto && (
          <circle
            cx={x(encima)} cy={y(serie[encima])} r="3.5"
            fill={color} stroke={Q.void} strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {/* The ends of the range, so the line is anchored in time without
          an axis full of dates nobody reads. */}
      <div style={{
        display: "flex", justifyContent: "space-between",
        color: Q.dim, fontSize: TEXT[11], fontFamily: F_BODY, marginTop: SPACING[4],
      }}>
        <span>{primero}</span>
        <span>{ultimo}</span>
      </div>

      {punto && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0,
          display: "flex", justifyContent: "center", pointerEvents: "none",
        }}>
          <div style={{
            background: Q.raised, borderRadius: RADII.md,
            padding: `${SPACING[4]}px ${SPACING[8]}px`,
            color: Q.text, fontSize: TEXT[12], fontFamily: F_MONO,
            fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
          }}>
            {punto.fecha} · {formato(Number(punto.valor) || 0)}
          </div>
        </div>
      )}
    </div>
  );
}
