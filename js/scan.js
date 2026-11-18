// Camera barcode scanning: native BarcodeDetector (Chrome Android), else vendored ZXing (iPhone Safari).
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
const ZXING_SRC = 'vendor/zxing-library-0.23.0/zxing.min.js';

async function nativeDetector() {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats();
    const formats = FORMATS.filter((f) => supported.includes(f));
    if (!formats.length) return null;
    const d = new window.BarcodeDetector({ formats });
    return async (video) => (await d.detect(video))[0]?.rawValue || null;
  } catch {
    return null;
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load the barcode reader.'));
    document.head.append(s);
  });
}

async function zxingDetector() {
  if (!window.ZXing) await loadScript(ZXING_SRC);
  const Z = window.ZXing;
  const reader = new Z.MultiFormatReader();
  const hints = new Map([
    [Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]],
    [Z.DecodeHintType.TRY_HARDER, true],
  ]);
  reader.setHints(hints);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;
    // Middle band only: smaller image, faster decode, and it matches the on-screen guide.
    const bandH = Math.round(h * 0.4);
    canvas.width = w;
    canvas.height = bandH;
    ctx.drawImage(video, 0, (h - bandH) / 2, w, bandH, 0, 0, w, bandH);
    try {
      const bitmap = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)));
      return reader.decodeWithState(bitmap).getText();
    } catch {
      return null; // no barcode in this frame
    }
  };
}

// Starts the camera in `video` and calls onCode(code) once. Returns a stop() function.
export async function startScanner(video, onCode) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot use the camera. Type the barcode instead.');
  const detect = (await nativeDetector()) || (await zxingDetector());
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  let running = true;
  const stop = () => {
    running = false;
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };
  const tick = async () => {
    if (!running) return;
    let code = null;
    try { code = await detect(video); } catch { /* frame not ready */ }
    if (code && running) {
      stop();
      onCode(code);
      return;
    }
    setTimeout(tick, 120);
  };
  tick();
  return stop;
}
