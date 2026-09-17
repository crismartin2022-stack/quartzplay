import {
  isCameraSupported,
  startCamera,
  stopStream,
  captureFrame,
} from "./cameraCaptureLogic";

function makeStream(tracks) {
  return { getTracks: () => tracks };
}

function makeTrack() {
  return { stop: jest.fn() };
}

describe("isCameraSupported", () => {
  test("true when getUserMedia exists on mediaDevices", () => {
    expect(isCameraSupported({ mediaDevices: { getUserMedia: () => {} } })).toBe(true);
  });

  test("false when nav has no mediaDevices", () => {
    expect(isCameraSupported({})).toBe(false);
  });

  test("false when mediaDevices has no getUserMedia", () => {
    expect(isCameraSupported({ mediaDevices: {} })).toBe(false);
  });

  test("false when nav is undefined", () => {
    expect(isCameraSupported(undefined)).toBe(false);
  });
});

describe("startCamera", () => {
  test("returns unsupported reason when the browser has no camera API", async () => {
    const result = await startCamera({});
    expect(result).toEqual({
      ok: false,
      reason: "Este navegador no permite abrir la cámara.",
    });
  });

  test("requests the rear camera by default and returns the stream", async () => {
    const stream = makeStream([]);
    const getUserMedia = jest.fn().mockResolvedValue(stream);
    const result = await startCamera({ mediaDevices: { getUserMedia } });
    expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: "environment" } });
    expect(result).toEqual({ ok: true, stream });
  });

  test("honors a custom facingMode", async () => {
    const stream = makeStream([]);
    const getUserMedia = jest.fn().mockResolvedValue(stream);
    await startCamera({ mediaDevices: { getUserMedia } }, { facingMode: "user" });
    expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: "user" } });
  });

  test.each([
    ["NotAllowedError", "Permiso de cámara bloqueado. Habilitalo en los permisos del sitio."],
    ["SecurityError", "Permiso de cámara bloqueado. Habilitalo en los permisos del sitio."],
    ["NotFoundError", "No encontramos una cámara disponible."],
    ["OverconstrainedError", "No encontramos una cámara disponible."],
    ["NotReadableError", "La cámara está ocupada por otra aplicación."],
    ["AbortError", "No se pudo abrir la cámara."],
  ])("maps %s to the expected reason", async (name, reason) => {
    const error = new Error("boom");
    error.name = name;
    const getUserMedia = jest.fn().mockRejectedValue(error);
    const result = await startCamera({ mediaDevices: { getUserMedia } });
    expect(result).toEqual({ ok: false, reason });
  });
});

describe("stopStream", () => {
  test("stops every track", () => {
    const t1 = makeTrack();
    const t2 = makeTrack();
    stopStream(makeStream([t1, t2]));
    expect(t1.stop).toHaveBeenCalledTimes(1);
    expect(t2.stop).toHaveBeenCalledTimes(1);
  });

  test("tolerant of null/undefined stream", () => {
    expect(() => stopStream(null)).not.toThrow();
    expect(() => stopStream(undefined)).not.toThrow();
  });

  test("tolerant of a track whose stop() throws", () => {
    const bad = { stop: () => { throw new Error("nope"); } };
    const good = makeTrack();
    expect(() => stopStream(makeStream([bad, good]))).not.toThrow();
    expect(good.stop).toHaveBeenCalledTimes(1);
  });
});

describe("captureFrame", () => {
  function makeVideo(width, height) {
    return { videoWidth: width, videoHeight: height };
  }

  function makeCanvas(toDataURLResult) {
    const drawImage = jest.fn();
    return {
      width: 0,
      height: 0,
      getContext: jest.fn(() => ({ drawImage })),
      toDataURL: jest.fn(() => toDataURLResult),
      _drawImage: drawImage,
    };
  }

  test("returns null when the video has no dimensions yet", () => {
    const video = makeVideo(0, 0);
    const canvas = makeCanvas("data:image/jpeg;base64,AAAA");
    expect(captureFrame(video, canvas)).toBeNull();
  });

  test("sizes the canvas to the video intrinsic size and draws it", () => {
    const video = makeVideo(1280, 720);
    const canvas = makeCanvas("data:image/jpeg;base64,ZZZZ");
    captureFrame(video, canvas);
    expect(canvas.width).toBe(1280);
    expect(canvas.height).toBe(720);
    expect(canvas._drawImage).toHaveBeenCalledWith(video, 0, 0, 1280, 720);
  });

  test("returns b64/tipo/preview from toDataURL with default quality", () => {
    const video = makeVideo(640, 480);
    const canvas = makeCanvas("data:image/jpeg;base64,ZZZZ");
    const result = captureFrame(video, canvas);
    expect(canvas.toDataURL).toHaveBeenCalledWith("image/jpeg", 0.85);
    expect(result).toEqual({
      b64: "ZZZZ",
      tipo: "image/jpeg",
      preview: "data:image/jpeg;base64,ZZZZ",
    });
  });

  test("honors a custom quality", () => {
    const video = makeVideo(640, 480);
    const canvas = makeCanvas("data:image/jpeg;base64,YYYY");
    captureFrame(video, canvas, { quality: 0.5 });
    expect(canvas.toDataURL).toHaveBeenCalledWith("image/jpeg", 0.5);
  });
});
