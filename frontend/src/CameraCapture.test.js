import React, { act } from "react";
import { createRoot } from "react-dom/client";
import CameraCapture from "./CameraCapture";

// react-dom/test-utils' act() needs this flag; @testing-library/react
// normally sets it for you, but this project has no RTL installed.
global.IS_REACT_ACT_ENVIRONMENT = true;

const Q = {
  void: "#050914", text: "#E9EFFF", muted: "#93A0C8", border: "#1E2A52",
  cyan: "#5A8CFF", violet: "#2B6BFF", pink: "#FF2D55", red: "#FF3B5C",
};
const F_BODY = "'Inter',system-ui,sans-serif";

let container;
let originalMediaDevices;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  originalMediaDevices = global.navigator.mediaDevices;
});

afterEach(() => {
  document.body.removeChild(container);
  container = null;
  Object.defineProperty(global.navigator, "mediaDevices", {
    value: originalMediaDevices,
    configurable: true,
  });
});

function setMediaDevices(value) {
  Object.defineProperty(global.navigator, "mediaDevices", {
    value,
    configurable: true,
  });
}

function makeTrack() {
  return { stop: jest.fn() };
}

function makeStream(tracks = [makeTrack()]) {
  return { getTracks: () => tracks };
}

async function renderCamera(props) {
  const root = createRoot(container);
  await act(async () => {
    root.render(<CameraCapture Q={Q} F_BODY={F_BODY} {...props} />);
  });
  return root;
}

test("shows a live preview with shutter and cancel controls when the camera is granted", async () => {
  const stream = makeStream();
  setMediaDevices({ getUserMedia: jest.fn().mockResolvedValue(stream) });

  await renderCamera({ onCapture: jest.fn(), onClose: jest.fn() });

  const video = container.querySelector("video");
  expect(video).not.toBeNull();
  expect(container.querySelector('button[aria-label="Sacar foto"]')).not.toBeNull();
  expect(container.querySelector('button[aria-label="Cancelar"]')).not.toBeNull();
});

test("stopping every track when the visitor cancels, without adding an image", async () => {
  const track = makeTrack();
  const stream = makeStream([track]);
  setMediaDevices({ getUserMedia: jest.fn().mockResolvedValue(stream) });
  const onCapture = jest.fn();
  const onClose = jest.fn();

  await renderCamera({ onCapture, onClose });

  const cancelButton = container.querySelector('button[aria-label="Cancelar"]');
  await act(async () => {
    cancelButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect(track.stop).toHaveBeenCalledTimes(1);
  expect(onCapture).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("shows the blocked-permission reason and keeps the file fallback available", async () => {
  const error = new Error("denied");
  error.name = "NotAllowedError";
  setMediaDevices({ getUserMedia: jest.fn().mockRejectedValue(error) });

  await renderCamera({ onCapture: jest.fn(), onClose: jest.fn() });

  expect(container.textContent).toContain(
    "Permiso de cámara bloqueado. Habilitalo en los permisos del sitio."
  );
  const fallbackInput = container.querySelector('input[type="file"]');
  expect(fallbackInput).not.toBeNull();
  expect(fallbackInput.getAttribute("accept")).toBe("image/*");
});

test("shows the unsupported-browser reason when there is no camera API at all", async () => {
  setMediaDevices(undefined);

  await renderCamera({ onCapture: jest.fn(), onClose: jest.fn() });

  expect(container.textContent).toContain("Este navegador no permite abrir la cámara.");
  expect(container.querySelector('input[type="file"]')).not.toBeNull();
});
