// ═══════════════════════════════════════════════════════════════
// cameraCapture — pure helpers for the in-app camera capture flow.
// No JSX here: kept framework-free so it stays trivial to test and
// is shared between the public site (Web.jsx) and the player app
// (App.jsx) via the CameraCapture component.
// ═══════════════════════════════════════════════════════════════

const REASON_PERMISSION_BLOCKED =
  "Permiso de cámara bloqueado. Habilitalo en los permisos del sitio.";
const REASON_NO_CAMERA = "No encontramos una cámara disponible.";
const REASON_CAMERA_BUSY = "La cámara está ocupada por otra aplicación.";
const REASON_UNSUPPORTED = "Este navegador no permite abrir la cámara.";
const REASON_GENERIC = "No se pudo abrir la cámara.";

const REASON_BY_ERROR_NAME = {
  NotAllowedError: REASON_PERMISSION_BLOCKED,
  SecurityError: REASON_PERMISSION_BLOCKED,
  NotFoundError: REASON_NO_CAMERA,
  OverconstrainedError: REASON_NO_CAMERA,
  NotReadableError: REASON_CAMERA_BUSY,
};

export function isCameraSupported(nav) {
  return Boolean(nav && nav.mediaDevices && typeof nav.mediaDevices.getUserMedia === "function");
}

export async function startCamera(nav, { facingMode = "environment" } = {}) {
  if (!isCameraSupported(nav)) {
    return { ok: false, reason: REASON_UNSUPPORTED };
  }
  try {
    const stream = await nav.mediaDevices.getUserMedia({ video: { facingMode } });
    return { ok: true, stream };
  } catch (error) {
    const reason = REASON_BY_ERROR_NAME[error && error.name] || REASON_GENERIC;
    return { ok: false, reason };
  }
}

export function stopStream(stream) {
  if (!stream || typeof stream.getTracks !== "function") return;
  stream.getTracks().forEach((track) => {
    try { track.stop(); } catch (e) { /* already stopped, ignore */ }
  });
}

export function captureFrame(video, canvas, { quality = 0.85 } = {}) {
  const width = (video && video.videoWidth) || 0;
  const height = (video && video.videoHeight) || 0;
  if (!width || !height) return null;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, width, height);
  const preview = canvas.toDataURL("image/jpeg", quality);
  const b64 = preview.split(",")[1] || "";
  return { b64, tipo: "image/jpeg", preview };
}
