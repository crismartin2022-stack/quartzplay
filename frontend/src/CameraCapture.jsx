// ═══════════════════════════════════════════════════════════════
// CameraCapture — shared camera overlay for the ticket scanner.
// Thin wrapper: all camera/DOM-free logic lives in cameraCapture.js.
// Used from both Web.jsx (public site) and App.jsx (player app),
// which each pass their own Q palette and F_BODY font stack.
// ═══════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from "react";
import { startCamera, stopStream, captureFrame } from "./cameraCaptureLogic";

const MAX_FILE_BYTES = 8 * 1024 * 1024;

export default function CameraCapture({ onCapture, onClose, Q, F_BODY }) {
  const [phase, setPhase] = useState("requesting"); // requesting | preview | error
  const [reason, setReason] = useState("");
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await startCamera(typeof navigator !== "undefined" ? navigator : undefined);
      if (cancelled) {
        if (result.ok) stopStream(result.stream);
        return;
      }
      if (result.ok) {
        streamRef.current = result.stream;
        setPhase("preview");
      } else {
        setReason(result.reason);
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (phase === "preview" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [phase]);

  const cerrarYLimpiar = () => {
    stopStream(streamRef.current);
    streamRef.current = null;
    onClose && onClose();
  };

  const sacarFoto = () => {
    const frame = captureFrame(videoRef.current, canvasRef.current);
    if (!frame) return;
    onCapture && onCapture(frame);
    cerrarYLimpiar();
  };

  const elegirArchivo = (e) => {
    const file = (e.target.files || [])[0];
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setReason("Una imagen supera 8MB");
      e.target.value = "";
      return;
    }
    const rd = new FileReader();
    rd.onload = () => {
      onCapture && onCapture({
        b64: rd.result.split(",")[1],
        tipo: file.type || "image/jpeg",
        preview: rd.result,
      });
      onClose && onClose();
    };
    rd.readAsDataURL(file);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 500,
      background: "rgba(5,9,20,.92)", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 420, background: Q.void,
        border: `1px solid ${Q.border}`, borderRadius: 14, padding: 16 }}>
        {phase === "preview" && (
          <>
            <video ref={videoRef} autoPlay playsInline muted
              style={{ width: "100%", borderRadius: 10, background: "#000",
                display: "block" }} />
            <canvas ref={canvasRef} style={{ display: "none" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={cerrarYLimpiar} aria-label="Cancelar"
                style={{ flex: 1, background: Q.pink, border: "none",
                  borderRadius: 10, padding: "12px", color: "#fff",
                  fontWeight: 700, fontSize: 13, cursor: "pointer",
                  fontFamily: F_BODY }}>
                Cancelar
              </button>
              <button onClick={sacarFoto} aria-label="Sacar foto"
                style={{ flex: 1,
                  background: `linear-gradient(135deg,${Q.cyan},${Q.violet})`,
                  border: "none", borderRadius: 10, padding: "12px",
                  color: "#fff", fontWeight: 700, fontSize: 13,
                  cursor: "pointer", fontFamily: F_BODY }}>
                📸 Sacar foto
              </button>
            </div>
          </>
        )}

        {phase === "requesting" && (
          <div style={{ color: Q.muted, fontSize: 12, textAlign: "center",
            padding: 20, fontFamily: F_BODY }}>
            Abriendo la cámara...
          </div>
        )}

        {phase === "error" && (
          <div>
            <div style={{ color: Q.red, fontSize: 12, lineHeight: 1.4,
              marginBottom: 12, fontFamily: F_BODY }}>
              {reason}
            </div>
            <label style={{ display: "block", border: `2px dashed ${Q.border}`,
              borderRadius: 12, padding: "18px 10px", textAlign: "center",
              cursor: "pointer", marginBottom: 10 }}>
              <input type="file" accept="image/*" onChange={elegirArchivo}
                style={{ display: "none" }} />
              <div style={{ color: Q.text, fontWeight: 700, fontSize: 12,
                fontFamily: F_BODY }}>
                Elegir archivo
              </div>
            </label>
            <button onClick={cerrarYLimpiar} aria-label="Cancelar"
              style={{ width: "100%", background: "transparent",
                border: `1px solid ${Q.border}`, borderRadius: 10,
                padding: "10px", color: Q.muted, fontWeight: 700,
                fontSize: 12, cursor: "pointer", fontFamily: F_BODY }}>
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
