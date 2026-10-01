// Un proveedor del casino en el panel de admin: qué es, si está encendido,
// y el interruptor para cambiarlo sin abrir el formulario.
//
// La fila no decide nada: recibe el estado ya resuelto por
// `proveedoresApi.js` y avisa con `onCambiar`. Que el interruptor vuelva
// atrás cuando el servidor rechaza el cambio no se hace acá sino en esa
// máquina; acá solo se dibuja lo que ella dice, incluido el error.
import { oscuro as Q, F_NUM, F_BODY, RADII, SPACING, ELEVATION, inkOn } from "./theme";
import { Lock } from "lucide-react";
import Icon from "./Icon";
import { estadoClave, resumenIps, textoJuegos } from "./proveedoresApi";

const ANCHO_PISTA = 46;
const ALTO_PISTA = 26;
const DIAMETRO = 20;
const MARGEN = 3;

function Interruptor({ activa, ocupado, nombre, onCambiar }) {
  const color = activa ? Q.green : Q.border;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activa}
      aria-busy={ocupado}
      aria-label={`${activa ? "Apagar" : "Encender"} ${nombre}`}
      disabled={ocupado}
      onClick={() => onCambiar(!activa)}
      style={{
        position: "relative", flexShrink: 0, cursor: ocupado ? "progress" : "pointer",
        width: ANCHO_PISTA, height: ALTO_PISTA, padding: 0,
        background: color, border: "none", borderRadius: RADII.full,
        opacity: ocupado ? 0.6 : 1,
        // La pista se mueve con el objetivo (optimista) pero la opacidad
        // avisa que el servidor todavía no confirmó.
        transition: "background 160ms ease, opacity 160ms ease",
      }}
    >
      <span style={{
        position: "absolute", top: MARGEN,
        left: activa ? ANCHO_PISTA - DIAMETRO - MARGEN : MARGEN,
        width: DIAMETRO, height: DIAMETRO, borderRadius: RADII.full,
        background: activa ? inkOn(Q.green) : Q.muted,
        transition: "left 160ms ease",
      }} />
    </button>
  );
}

function Etiqueta({ texto, color = Q.muted, icono }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: SPACING[4],
      padding: "4px 8px", borderRadius: RADII.sm,
      background: `${color}1a`, color, fontSize: 12, fontFamily: F_BODY,
      lineHeight: 1.3,
    }}>
      {icono}{texto}
    </span>
  );
}

export default function FilaProveedor({
  proveedor: p, ocupado, error, deshabilitado,
  onCambiar, onEditar, onTraer, onQuitar,
}) {
  const clave = estadoClave(p);
  const ips = resumenIps(p);
  const botonSecundario = {
    background: "transparent", border: `1px solid ${Q.border}`,
    borderRadius: RADII.sm, padding: "8px 12px", color: Q.muted,
    fontSize: 12, fontFamily: F_BODY, cursor: "pointer",
  };

  return (
    <div style={{
      background: Q.card, border: `1px solid ${error ? `${Q.red}66` : Q.border}`,
      borderRadius: RADII.lg, boxShadow: ELEVATION,
      padding: SPACING[16], marginBottom: SPACING[8],
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: SPACING[12] }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            color: p.activa ? Q.text : Q.dim, fontWeight: 700, fontSize: 14,
            fontFamily: F_BODY,
          }}>
            {p.nombre}
            <span style={{
              marginLeft: SPACING[8], fontSize: 12, fontWeight: 400,
              color: p.activa ? Q.green : Q.dim,
            }}>{p.activa ? "activo" : "apagado"}</span>
          </div>
          <div style={{ color: Q.muted, fontSize: 12, marginTop: SPACING[4], fontFamily: F_BODY }}>
            <span style={{ fontFamily: F_NUM }}>{p.codigo}</span>
            {p.adaptador && <> · adaptador {p.adaptador}</>}
            {" · "}prioridad {p.prioridad}
          </div>
        </div>
        <Interruptor
          activa={p.activa} ocupado={ocupado} nombre={p.nombre}
          onCambiar={onCambiar}
        />
      </div>

      {error && (
        <div role="alert" style={{
          color: Q.red, fontSize: 12, marginTop: SPACING[8], lineHeight: 1.45,
          fontFamily: F_BODY,
        }}>
          <Icon name="triangle-alert" size={12} /> No se pudo {p.activa ? "apagar" : "encender"}{" "}
          {p.nombre}: {error}. Sigue {p.activa ? "activo" : "apagado"}.
        </div>
      )}

      <div style={{
        display: "flex", flexWrap: "wrap", gap: SPACING[8], marginTop: SPACING[12],
      }}>
        <Etiqueta texto={textoJuegos(p.juegos)} />
        {p.monedas && <Etiqueta texto={p.monedas} />}
        <Etiqueta
          texto={clave.texto}
          color={clave.alerta ? Q.red : clave.id === "cifrada" ? Q.green : Q.muted}
          icono={clave.id === "cifrada" ? <Lock size={12} />
            : clave.alerta ? <Icon name="triangle-alert" size={12} /> : null}
        />
      </div>

      <div style={{ marginTop: SPACING[12], fontFamily: F_BODY }}>
        <div style={{ color: Q.dim, fontSize: 12, marginBottom: SPACING[4] }}>IPs permitidas</div>
        {ips.vacia ? (
          <div style={{ color: Q.amber, fontSize: 12, lineHeight: 1.45 }}>
            Sin IPs registradas. Revisar si el proveedor las necesita.
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: SPACING[4] }}>
            {ips.visibles.map((ip) => (
              <span key={ip} style={{
                fontFamily: F_NUM, fontSize: 12, color: Q.text,
                background: Q.raised, padding: "4px 8px", borderRadius: RADII.sm,
              }}>{ip}</span>
            ))}
            {ips.resto > 0 && (
              <span style={{ color: Q.muted, fontSize: 12, padding: "4px 8px" }}>
                +{ips.resto} más
              </span>
            )}
          </div>
        )}
      </div>

      {p.ultimoSync && (
        <div style={{ color: Q.dim, fontSize: 12, marginTop: SPACING[8], fontFamily: F_BODY }}>
          Última carga del catálogo: {p.ultimoSync}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: SPACING[8], marginTop: SPACING[12] }}>
        <button type="button" onClick={onEditar} disabled={deshabilitado}
          style={{ ...botonSecundario, color: Q.cyan, border: `1px solid ${Q.violet}66` }}>
          Editar
        </button>
        <button type="button" onClick={onTraer} disabled={deshabilitado} style={botonSecundario}>
          Traer catálogo
        </button>
        {p.activa && (
          <button type="button" onClick={onQuitar} disabled={deshabilitado}
            style={{ ...botonSecundario, color: Q.red, border: `1px solid ${Q.red}44` }}>
            Quitar
          </button>
        )}
      </div>
    </div>
  );
}
