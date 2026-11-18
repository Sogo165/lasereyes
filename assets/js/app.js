/*
 * LaserEyes - all processing runs locally in the browser.
 * Photos are never uploaded. Only the MediaPipe library and detection models are loaded.
 */

import { applyStatic, getLang, setLang, t } from "./i18n.js";

const VENDOR = new URL("../vendor/mediapipe/", import.meta.url).href;
const MP_MODULE = `${VENDOR}vision_bundle.js`;
const MP_WASM = `${VENDOR}wasm`;
const LIB_VENDOR = new URL("../vendor/libs/", import.meta.url).href;
const MODEL_PATH = "assets/models/blaze_face_full_range.tflite";
const MODEL_LANDMARKER = "assets/models/face_landmarker.task";
// Everything is served from this site; no third-party CDN is contacted.
const JSZIP_URL = `${LIB_VENDOR}jszip.min.js`;
const HEIC2ANY_URL = `${LIB_VENDOR}heic2any.min.js`;

const DEFAULT_OPTS = { laser: 1, glow: 1, blur: 1, cover: 1 };
const LASER_PRESETS = {
  original: "#ff4d2e",
  red: "#ff2020",
  yellow: "#ffd21e",
};
const DETECT_MAX_SIDE = 1400;
const PREVIEW_MAX_SIDE = 2400;
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;

// MediaPipe face oval ring from the 478-point landmark set.
const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];

const $ = (sel, root = document) => root.querySelector(sel);

const dom = {
  fileInput: $("#fileInput"),
  dropzone: $("#dropzone"),
  photoList: $("#photoList"),
  photoSheetList: $("#photoSheetList"),
  libraryCount: $("#libraryCount"),
  mobilePhotos: $("#mobilePhotos"),
  mobilePhotosBtn: $("#mobilePhotosBtn"),
  mobilePhotoCount: $("#mobilePhotoCount"),
  photoSheet: $("#photoSheet"),
  photoSheetBackdrop: $("#photoSheetBackdrop"),
  photoSheetClose: $("#photoSheetClose"),
  busy: $("#busy"),
  busyBar: $("#busyBar"),
  busyText: $("#busyText"),
  emptyState: $("#emptyState"),
  emptyPickBtn: $("#emptyPickBtn"),
  editor: $("#editor"),
  canvas: $("#canvas"),
  canvasBox: $("#canvasBox"),
  canvasScroll: $("#canvasScroll"),
  canvasLoading: $("#canvasLoading"),
  overlay: $("#overlay"),
  hint: $("#hint"),
  summary: $("#summary"),
  zoomChip: $("#zoomChip"),
  langSwitch: $("#langSwitch"),
  modeGroup: $("#modeGroup"),
  addFaceBtn: $("#addFaceBtn"),
  markersBtn: $("#markersBtn"),
  downloadBtn: $("#downloadBtn"),
  downloadAllBtn: $("#downloadAllBtn"),
  laserRange: $("#laserRange"),
  glowRange: $("#glowRange"),
  blurRange: $("#blurRange"),
  coverRange: $("#coverRange"),
  coverSelect: $("#coverSelect"),
  laserColors: $("#laserColors"),
  laserCustomSwatch: $("#laserCustomSwatch"),
  laserColorInput: $("#laserColorInput"),
  resetPositionsBtn: $("#resetPositionsBtn"),
  customFaceBtn: $("#customFaceBtn"),
  customFaceThumb: $("#customFaceThumb"),
  customFaceImg: $("#customFaceImg"),
  customFaceLabel: $("#customFaceLabel"),
  faceInput: $("#faceInput"),
  faceModal: $("#faceModal"),
  faceModalTitle: $("#faceModalTitle"),
  faceModalText: $("#faceModalText"),
  faceGrid: $("#faceGrid"),
  cropWrap: $("#cropWrap"),
  cropCanvas: $("#cropCanvas"),
  cropBox: $("#cropBox"),
  faceCancelBtn: $("#faceCancelBtn"),
  faceUseBtn: $("#faceUseBtn"),
  laserOut: $("#laserOut"),
  glowOut: $("#glowOut"),
  blurOut: $("#blurOut"),
  coverOut: $("#coverOut"),
  resetBtn: $("#resetBtn"),
  resetAllBtn: $("#resetAllBtn"),
  undoBtn: $("#undoBtn"),
  redoBtn: $("#redoBtn"),
  settingsPanel: $(".settings"),
  settingsFab: $("#settingsFab"),
  settingsBackdrop: $("#settingsBackdrop"),
  settingsCloseBtn: $("#settingsCloseBtn"),
  engineStatus: $("#engineStatus"),
  engineText: $("#engineText"),
  progress: $("#progress"),
  progressText: $("#progressText"),
  toasts: $("#toasts"),
};

const storedSettings = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem("lasereyes.opts") || "null");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
})();

const storedOpts = (() => {
  const out = {};
  for (const key of Object.keys(DEFAULT_OPTS)) {
    const value = Number(storedSettings[key]);
    if (Number.isFinite(value)) out[key] = value;
  }
  return out;
})();

const state = {
  photos: [],
  activeId: null,
  mode: "lasers",
  coverType: ["blur", "pixel", "solid"].includes(storedSettings.coverType) ? storedSettings.coverType : "blur",
  customFace: null,
  customPending: false,
  customBusy: false,
  laserColor: ["original", "red", "yellow", "custom"].includes(storedSettings.laserColor)
    ? storedSettings.laserColor
    : "original",
  laserCustom: /^#[0-9a-f]{6}$/i.test(storedSettings.laserCustom || "")
    ? storedSettings.laserCustom
    : LASER_PRESETS.original,
  zoom: 1,
  showMarkers: true,
  adding: false,
  addPoints: [],
  opts: { ...DEFAULT_OPTS, ...storedOpts },
  busy: false,
  detectors: { detector: null, promise: null, error: null, ready: false },
  landmarker: { instance: null, promise: null, error: null },
};

const queue = [];
let queueRunning = false;
let rafPending = false;
let heicNoticeShown = false;
let uidCounter = 0;
let drag = null;
let pressTimer = null;
let zoomHintShown = false;

/* ------------------------------------------------------------------ */
/* small helpers                                                       */
/* ------------------------------------------------------------------ */

function uid() {
  uidCounter += 1;
  return `f${Date.now().toString(36)}${uidCounter}`;
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

function toast(message, action) {
  const node = document.createElement("div");
  node.className = "toast";
  const text = document.createElement("span");
  text.textContent = message;
  node.append(text);
  if (action) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = action.label;
    button.addEventListener("click", () => {
      node.remove();
      action.onClick();
    });
    node.append(button);
  }
  dom.toasts.append(node);
  setTimeout(() => {
    node.classList.add("out");
    setTimeout(() => node.remove(), 300);
  }, action ? 6500 : 4200);
}

function setProgress(visible, text = "") {
  dom.progress.hidden = !visible;
  dom.progressText.textContent = text;
  state.busy = visible;
  dom.downloadBtn.disabled = visible;
  dom.downloadAllBtn.disabled = visible || state.photos.length === 0;
  updateBusy();
}

function updateBusy() {
  let text = "";
  if (!state.busy) {
    if (state.customBusy) {
      text = t("busy.detecting");
    } else if (!state.detectors.ready) {
      if (!state.detectors.error) text = t("busy.model");
    } else if (state.photos.some((photo) => photo.status === "queued" || photo.status === "decoding")) {
      text = t("busy.photo");
    } else if (state.photos.some((photo) => photo.detectStatus === "running")) {
      text = t("busy.detecting");
    }
  }

  const active = Boolean(text);
  dom.busy.hidden = !active;
  dom.busyBar.hidden = !active;
  if (active && dom.busyText.textContent !== text) dom.busyText.textContent = text;
}

function activePhoto() {
  return state.photos.find((photo) => photo.id === state.activeId) || null;
}

function isImageFile(file) {
  if (file.type && file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|avif|gif|bmp|tiff?|heic|heif)$/i.test(file.name || "");
}

function isHeic(file) {
  return /\.(heic|heif)$/i.test(file.name || "") || /hei[cf]/i.test(file.type || "");
}

function baseName(name) {
  return (name || "photo").replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80) || "photo";
}

/* ------------------------------------------------------------------ */
/* decoding                                                            */
/* ------------------------------------------------------------------ */

function photoWord(count) {
  return t(count === 1 ? "word.photo" : "word.photos");
}

async function ensureJSZip() {
  if (!window.JSZip) await loadScript(JSZIP_URL);
  if (!window.JSZip) throw new Error("Could not load the ZIP library");
  return window.JSZip;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.append(script);
  });
}

async function convertHeic(blob) {
  if (!heicNoticeShown) {
    heicNoticeShown = true;
    toast(t("toast.heic"));
  }
  if (!window.heic2any) await loadScript(HEIC2ANY_URL);
  const result = await window.heic2any({ blob, toType: "image/jpeg", quality: 0.92 });
  return Array.isArray(result) ? result[0] : result;
}

async function createBitmap(blob) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob, { imageOrientation: "from-image" });
    } catch {}
    try {
      return await createImageBitmap(blob);
    } catch {}
  }

  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await new Promise((resolve, reject) => {
      if (img.complete && img.naturalWidth > 0) return resolve();
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Image could not be decoded"));
    });
    try {
      return await createImageBitmap(img);
    } catch {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d").drawImage(img, 0, 0);
      return canvas;
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function decodePhoto(photo) {
  let source = photo.blob;
  if (isHeic(photo.blob)) source = await convertHeic(photo.blob);
  return createBitmap(source);
}

function makeThumb(source) {
  const max = 260;
  const scale = Math.min(1, max / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  try {
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return "";
  }
}

function ensureBitmap(photo) {
  if (photo.bitmap) return Promise.resolve(photo.bitmap);
  if (!photo.bitmapPromise) {
    photo.bitmapPromise = decodePhoto(photo)
      .then((bitmap) => {
        photo.bitmap = bitmap;
        photo.width = bitmap.width;
        photo.height = bitmap.height;
        return bitmap;
      })
      .finally(() => {
        photo.bitmapPromise = null;
      });
  }
  return photo.bitmapPromise;
}

function releaseBitmap(photo, force = false) {
  if (!photo || !photo.bitmap) return;
  if (!force && (photo.id === state.activeId || photo.detectStatus === "running" || photo.bitmapPromise)) return;
  try {
    photo.bitmap.close?.();
  } catch {}
  photo.bitmap = null;
}

/* ------------------------------------------------------------------ */
/* detection                                                           */
/* ------------------------------------------------------------------ */

function detectionEnvironmentHint() {
  if (typeof WebAssembly !== "object") {
    return t("detect.noWasm");
  }
  try {
    const canvas = document.createElement("canvas");
    if (!canvas.getContext("webgl2") && !canvas.getContext("webgl")) {
      return t("detect.noWebgl");
    }
  } catch {}
  return t("detect.loadFailed");
}

function setEngine(status, text) {
  dom.engineStatus.dataset.state = status;
  dom.engineStatus.disabled = status !== "error";
  dom.engineStatus.title = status === "error" ? t("engine.retryTitle") : t("engine.label");
  if (text) dom.engineText.textContent = text;
  else if (status === "loading") dom.engineText.textContent = t("engine.loading");
  else if (status === "ready") dom.engineText.textContent = t("engine.ready");
  else if (status === "error") dom.engineText.textContent = t("engine.error");
  updateBusy();
}

async function makeDetector(FaceDetector, vision, modelPath) {
  let lastError = null;
  for (const delegate of ["GPU", "CPU"]) {
    try {
      return await FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: modelPath, delegate },
        runningMode: "IMAGE",
        minDetectionConfidence: 0.4,
        minSuppressionThreshold: 0.3,
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Could not create the detector");
}

function resetDetector() {
  try {
    state.detectors.detector?.close?.();
  } catch {}
  state.detectors.detector = null;
  state.detectors.ready = false;
  state.detectors.promise = null;
}

function resetLandmarker() {
  try {
    state.landmarker.instance?.close?.();
  } catch {}
  state.landmarker.instance = null;
  state.landmarker.error = null;
  state.landmarker.promise = null;
}

let visionPromise = null;

function ensureVision() {
  if (!visionPromise) {
    visionPromise = (async () => {
      const mod = await import(MP_MODULE);
      const vision = await mod.FilesetResolver.forVisionTasks(MP_WASM);
      return { mod, vision };
    })().catch((error) => {
      visionPromise = null;
      throw error;
    });
  }
  return visionPromise;
}

async function ensureDetectors(force = false) {
  if (state.detectors.ready) return state.detectors;
  if (state.detectors.error && !force) throw state.detectors.error;
  if (state.detectors.promise) return state.detectors.promise;

  if (force) {
    state.detectors.error = null;
    state.detectors.ready = false;
  }

  setEngine("loading");
  state.detectors.promise = (async () => {
    const { mod, vision } = await ensureVision();
    const detector = await makeDetector(mod.FaceDetector, vision, MODEL_PATH);
    state.detectors.detector = detector;
    state.detectors.ready = true;
    setEngine("ready");
    return state.detectors;
  })().catch((error) => {
    state.detectors.error = error;
    state.detectors.promise = null;
    setEngine("error");
    console.warn("LaserEyes: detection unavailable", error);
    throw error;
  });

  return state.detectors.promise;
}

async function ensureLandmarker() {
  if (state.landmarker.instance) return state.landmarker.instance;
  if (state.landmarker.error) throw state.landmarker.error;
  if (state.landmarker.promise) return state.landmarker.promise;

  state.landmarker.promise = (async () => {
    const { mod, vision } = await ensureVision();
    let instance = null;
    let lastError = null;
    for (const delegate of ["GPU", "CPU"]) {
      try {
        instance = await mod.FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_LANDMARKER, delegate },
          runningMode: "IMAGE",
          numFaces: 2,
          minFaceDetectionConfidence: 0.2,
          minFacePresenceConfidence: 0.2,
          minTrackingConfidence: 0.2,
        });
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!instance) throw lastError || new Error("Could not create the landmarker");
    state.landmarker.instance = instance;
    return instance;
  })().catch((error) => {
    state.landmarker.error = error;
    state.landmarker.promise = null;
    console.warn("LaserEyes: eye refinement unavailable", error);
    throw error;
  });

  return state.landmarker.promise;
}

/**
 * Refine the eye centers with the face landmark model on a crop of each face.
 * The detector gives rough keypoints; this refines the pupil.
 */
async function refineEyes(photo, faces) {
  if (!faces.length) return;

  let landmarker;
  try {
    landmarker = await ensureLandmarker();
  } catch {
    return;
  }

  const bitmap = await ensureBitmap(photo);

  for (const face of faces) {
    if (face.manual) continue;
    try {
      const size = Math.round(Math.max(face.box.w, face.box.h) * 1.3);
      if (size < 40) continue;

      const cx = face.box.x + face.box.w / 2;
      const cy = face.box.y + face.box.h / 2;
      let sx = Math.round(cx - size / 2);
      let sy = Math.round(cy - size / 2);
      let sw = size;
      let sh = size;
      if (sx < 0) {
        sw += sx;
        sx = 0;
      }
      if (sy < 0) {
        sh += sy;
        sy = 0;
      }
      if (sx + sw > bitmap.width) sw = bitmap.width - sx;
      if (sy + sh > bitmap.height) sh = bitmap.height - sy;
      if (sw < 32 || sh < 32) continue;

      const crop = document.createElement("canvas");
      crop.width = sw;
      crop.height = sh;
      crop.getContext("2d").drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);

      const result = landmarker.detect(crop);
      const sets = result?.faceLandmarks || [];
      if (!sets.length) continue;

      let best = null;
      let bestDistance = Infinity;
      for (const points of sets) {
        let minX = 1;
        let minY = 1;
        let maxX = 0;
        let maxY = 0;
        for (const point of points) {
          if (point.x < minX) minX = point.x;
          if (point.y < minY) minY = point.y;
          if (point.x > maxX) maxX = point.x;
          if (point.y > maxY) maxY = point.y;
        }
        const distance = Math.hypot((minX + maxX) / 2 - 0.5, (minY + maxY) / 2 - 0.5);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = points;
        }
      }
      if (!best || best.length < 478) continue;

      const centroid = (indices) => {
        let x = 0;
        let y = 0;
        for (const index of indices) {
          x += best[index].x;
          y += best[index].y;
        }
        return {
          x: sx + (x / indices.length) * sw,
          y: sy + (y / indices.length) * sh,
        };
      };

      // 468-472 = right iris, 473-477 = left iris
      const eyeA = centroid([468, 469, 470, 471, 472]);
      const eyeB = centroid([473, 474, 475, 476, 477]);
      const distance = Math.hypot(eyeB.x - eyeA.x, eyeB.y - eyeA.y);
      if (distance < Math.max(4, face.box.w * 0.06)) continue;

      const margin = face.box.w * 0.2;
      const inside = (point) =>
        point.x > face.box.x - margin &&
        point.x < face.box.x + face.box.w + margin &&
        point.y > face.box.y - margin &&
        point.y < face.box.y + face.box.h + margin;
      if (!inside(eyeA) || !inside(eyeB)) continue;

      face.eyeA = eyeA;
      face.eyeB = eyeB;
      face.oval = FACE_OVAL.map((index) => ({
        x: sx + best[index].x * sw,
        y: sy + best[index].y * sh,
      }));
    } catch (error) {
      console.warn("LaserEyes: eye refinement failed", error);
      break;
    }
  }
}

function validEyes(a, b, box) {
  if (!a || !b) return false;
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  if (distance < box.w * 0.14) return false;
  const marginX = box.w * 0.25;
  const marginY = box.h * 0.25;
  const inside = (point) =>
    point.x > box.x - marginX &&
    point.x < box.x + box.w + marginX &&
    point.y > box.y - marginY &&
    point.y < box.y + box.h + marginY;
  return inside(a) && inside(b);
}

function expandBox(box, fx, fy) {
  return {
    x: box.x - box.w * fx,
    y: box.y - box.h * fy,
    w: box.w * (1 + fx * 2),
    h: box.h * (1 + fy * 2),
  };
}

function normalizeDetection(detection, width, height, invScale) {
  const bb = detection.boundingBox;
  if (!bb) return null;

  let x = bb.originX;
  let y = bb.originY;
  let w = bb.width;
  let h = bb.height;
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;

  // Some builds report a normalized box instead of pixels.
  if (w <= 1.5 && h <= 1.5) {
    x *= width;
    y *= height;
    w *= width;
    h *= height;
  }

  const box = { x: x * invScale, y: y * invScale, w: w * invScale, h: h * invScale };
  if (box.w < 14 || box.h < 14) return null;

  const keypoints = (detection.keypoints || []).map((point) => {
    let px = point.x;
    let py = point.y;
    if (px >= -0.001 && px <= 1.001 && py >= -0.001 && py <= 1.001) {
      px *= width;
      py *= height;
    }
    return { x: px * invScale, y: py * invScale };
  });

  let eyeA = keypoints[0];
  let eyeB = keypoints[1];
  if (!validEyes(eyeA, eyeB, box)) {
    eyeA = { x: box.x + box.w * 0.32, y: box.y + box.h * 0.4 };
    eyeB = { x: box.x + box.w * 0.68, y: box.y + box.h * 0.4 };
  }

  const score = detection.categories?.[0]?.score ?? detection.score ?? 0.5;

  return {
    box: expandBox(box, 0.4, 0.45),
    eyeA,
    eyeB,
    score,
  };
}

function sameFace(a, b) {
  const acx = a.x + a.w / 2;
  const acy = a.y + a.h / 2;
  const bcx = b.x + b.w / 2;
  const bcy = b.y + b.h / 2;
  const size = (Math.min(a.w, b.w) + Math.min(a.h, b.h)) / 2;
  if (Math.hypot(acx - bcx, acy - bcy) < size * 0.45) return true;

  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (intersection <= 0) return false;

  const union = a.w * a.h + b.w * b.h - intersection;
  const iou = union > 0 ? intersection / union : 0;
  const iom = intersection / Math.min(a.w * a.h, b.w * b.h);
  return iou > 0.34 || iom > 0.68;
}

function mergeFaces(candidates) {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const kept = [];
  for (const candidate of sorted) {
    if (kept.some((face) => sameFace(face.box, candidate.box))) continue;
    kept.push(candidate);
  }
  kept.sort((a, b) => a.box.x - b.box.x);
  return kept;
}

async function detectFaces(photo) {
  const bitmap = await ensureBitmap(photo);
  const scale = Math.min(1, DETECT_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const invScale = 1 / scale;
  let candidates = [];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const detector = state.detectors.detector;
    if (!detector) throw new Error("Detector is not ready");

    const found = [];
    try {
      const result = detector.detect(canvas);
      for (const detection of result?.detections || []) {
        const normalized = normalizeDetection(detection, canvas.width, canvas.height, invScale);
        if (normalized) found.push(normalized);
      }
      candidates = found;
      break;
    } catch (error) {
      console.warn("LaserEyes: detection failed, retrying", error);
      resetDetector();
      if (attempt === 1) throw error;
      await ensureDetectors();
    }
  }

  const faces = mergeFaces(candidates).map((face) => ({
    id: uid(),
    box: face.box,
    eyeA: face.eyeA,
    eyeB: face.eyeB,
    on: true,
    manual: false,
    score: face.score,
  }));

  await refineEyes(photo, faces);
  for (const face of faces) face.origin = faceOrigin(face);
  return faces;
}

function faceOrigin(face) {
  return {
    box: { ...face.box },
    eyeA: { ...face.eyeA },
    eyeB: { ...face.eyeB },
    oval: face.oval ? face.oval.map((point) => ({ ...point })) : null,
  };
}

function makeManualFace(a, b) {
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  const box = {
    x: cx - distance * 1.25,
    y: cy - distance * 1.24,
    w: distance * 2.5,
    h: distance * 3.1,
  };
  const face = {
    id: uid(),
    box,
    eyeA: { ...a },
    eyeB: { ...b },
    on: true,
    manual: true,
    score: 1,
  };
  face.origin = faceOrigin(face);
  return face;
}

/* ------------------------------------------------------------------ */
/* processing queue                                                    */
/* ------------------------------------------------------------------ */

function enqueue(photos) {
  for (const photo of photos) queue.push(photo);
  processQueue();
}

async function runDetection(photo) {
  photo.detectStatus = "running";
  photo.detectError = null;
  updateLibraryItem(photo);
  updateBusy();
  if (photo.id === state.activeId) updateSummary(photo);

  try {
    await ensureDetectors();
    const detected = await detectFaces(photo);
    const manual = photo.faces.filter((face) => face.manual);
    photo.faces = [...detected, ...manual];
    photo.detectStatus = "done";
  } catch (error) {
    photo.detectStatus = "failed";
    photo.detectError = error?.message || String(error);
    console.warn("LaserEyes: face detection failed", photo.name, error);
    if (photo.id === state.activeId) {
      toast(detectionEnvironmentHint() + t("hint.tryAgainManually"));
    }
  }

  updateLibraryItem(photo);
  updateBusy();
  if (photo.id === state.activeId) renderActive();
}

async function processQueue() {
  if (queueRunning) return;
  queueRunning = true;

  try {
    while (queue.length) {
      const photo = queue.shift();
      if (!photo || photo.status !== "queued") continue;

      photo.status = "decoding";
      updateLibraryItem(photo);
      if (photo.id === state.activeId) showCanvasLoading(true);

      try {
        const bitmap = await decodePhoto(photo);
        if (!state.photos.includes(photo)) {
          bitmap.close?.();
          continue;
        }

        photo.bitmap = bitmap;
        photo.width = bitmap.width;
        photo.height = bitmap.height;
        photo.thumb = makeThumb(bitmap);
        photo.status = "ready";

        if (!state.activeId) state.activeId = photo.id;
        renderLibrary();
        updateChrome();

        if (photo.id === state.activeId) {
          emptyStateHidden();
          showCanvasLoading(false);
          renderActive();
        }

        photo.detectStatus = "running";
        await runDetection(photo);
      } catch (error) {
        photo.status = "error";
        photo.detectStatus = "failed";
        photo.error = t("photo.couldNotLoad");
        console.warn("LaserEyes: image decoding failed", photo.name, error);
        toast(t("toast.couldNotLoadNamed", { name: photo.name }));
        updateLibraryItem(photo);

        if (photo.id === state.activeId) {
          showCanvasLoading(false);
          const alternative = state.photos.find((item) => item.id !== photo.id && item.status === "ready");
          if (alternative) {
            selectPhoto(alternative.id);
          } else {
            dom.editor.hidden = true;
            dom.emptyState.hidden = false;
            state.activeId = null;
          }
        }
      } finally {
        if (photo.id !== state.activeId) releaseBitmap(photo);
      }

      await nextTick();
    }
  } finally {
    queueRunning = false;
    updateChrome();
  }
}

/* ------------------------------------------------------------------ */
/* library                                                             */
/* ------------------------------------------------------------------ */

function photoSub(photo) {
  if (photo.status === "queued" || photo.status === "decoding") return { text: t("photo.loading"), cls: "" };
  if (photo.status === "error") return { text: t("photo.couldNotLoad"), cls: "bad" };
  if (photo.detectStatus === "running") return { text: t("photo.detecting"), cls: "" };
  if (photo.detectStatus === "failed") return { text: t("photo.detectionFailed"), cls: "bad" };
  if (photo.detectStatus === "done") {
    const total = photo.faces.length;
    if (!total) return { text: t("photo.noFaces"), cls: "" };
    const covered = photo.faces.filter((face) => face.on).length;
    const label = state.mode === "lasers" ? t("label.withLasers") : t("label.covered");
    return {
      text: `${covered}/${total} ${label}`,
      cls: covered === total ? "ok" : "warn",
    };
  }
  return { text: t("photo.waiting"), cls: "" };
}

function createLibraryItem(photo) {
  const item = document.createElement("div");
  item.className = "photo-item";
  item.dataset.id = photo.id;
  if (photo.id === state.activeId) item.classList.add("is-active");
  if (photo.status === "queued" || photo.status === "decoding") item.classList.add("is-loading");
  if (photo.status === "error") item.classList.add("has-error");

  const thumb = document.createElement("div");
  thumb.className = "thumb";
  const img = document.createElement("img");
  img.alt = "";
  img.src = photo.thumb || "";
  const thumbState = document.createElement("div");
  thumbState.className = "thumb-state";
  thumbState.textContent = photo.status === "error" ? "!" : "…";
  thumb.append(img, thumbState);

  const meta = document.createElement("div");
  meta.className = "meta";
  const name = document.createElement("div");
  name.className = "name";
  name.textContent = photo.name;
  name.title = photo.name;
  const sub = document.createElement("div");
  sub.className = "sub";
  const subInfo = photoSub(photo);
  sub.textContent = subInfo.text;
  if (subInfo.cls) sub.classList.add(subInfo.cls);
  if (photo.detectStatus === "failed" && photo.detectError) sub.title = photo.detectError;
  meta.append(name, sub);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "remove";
  remove.title = t("photo.removeTitle");
  remove.setAttribute("aria-label", t("photo.removeAria", { name: photo.name }));
  remove.textContent = "×";

  item.append(thumb, meta, remove);
  return item;
}

function renderLibrary() {
  for (const container of [dom.photoList, dom.photoSheetList]) {
    container.textContent = "";
    for (const photo of state.photos) container.append(createLibraryItem(photo));
  }
  updateChrome();
}

function updateLibraryItem(photo) {
  for (const container of [dom.photoList, dom.photoSheetList]) {
    const item = container.querySelector(`[data-id="${photo.id}"]`);
    if (!item) continue;
    item.classList.toggle("is-loading", photo.status === "queued" || photo.status === "decoding");
    item.classList.toggle("has-error", photo.status === "error");
    const sub = item.querySelector(".sub");
    if (sub) {
      const info = photoSub(photo);
      sub.textContent = info.text;
      sub.className = "sub";
      if (info.cls) sub.classList.add(info.cls);
      sub.title = photo.detectStatus === "failed" && photo.detectError ? photo.detectError : "";
    }
    const stateText = item.querySelector(".thumb-state");
    if (stateText) stateText.textContent = photo.status === "error" ? "!" : "…";
  }
  updateBusy();
}

function updateChrome() {
  dom.libraryCount.textContent = String(state.photos.length);
  dom.mobilePhotoCount.textContent = String(state.photos.length);
  document.body.classList.toggle("has-photos", state.photos.length > 0);
  if (!state.photos.length) {
    dom.editor.hidden = true;
    dom.emptyState.hidden = false;
    closePhotoSheet();
    closeSettings();
  }
  dom.downloadAllBtn.disabled = state.busy || state.photos.length === 0;
  dom.downloadAllBtn.title = state.photos.length ? t("downloadAll.titleReady") : t("downloadAll.titleEmpty");
  syncHistoryButtons();
  updateBusy();
}

function emptyStateHidden() {
  const wasHidden = dom.editor.hidden;
  dom.emptyState.hidden = true;
  dom.editor.hidden = false;
  setHint(defaultHint());
  if (!zoomHintShown && window.matchMedia?.("(pointer: coarse)").matches) {
    zoomHintShown = true;
    setTimeout(() => toast(t("hint.zoomTouch")), 1400);
  }
  if (wasHidden && window.matchMedia("(max-width: 800px)").matches) {
    requestAnimationFrame(() => {
      dom.editor.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

function addFiles(fileList) {
  const files = [...fileList].filter(isImageFile);
  if (!files.length) {
    toast(t("files.choose"));
    return;
  }

  const added = [];
  for (const file of files) {
    if (state.photos.some((photo) => photo.blob === file)) continue;
    const photo = {
      id: uid(),
      blob: file,
      name: file.name || "photo.jpg",
      width: 0,
      height: 0,
      thumb: "",
      status: "queued",
      bitmap: null,
      bitmapPromise: null,
      faces: [],
      detectStatus: "idle",
      detectError: null,
    };
    state.photos.push(photo);
    added.push(photo);
  }

  if (!added.length) return;

  if (!state.activeId || added.length === 1) {
    state.activeId = added[0].id;
    emptyStateHidden();
  }

  for (const photo of state.photos) if (photo.id !== state.activeId) releaseBitmap(photo);

  renderLibrary();
  updateChrome();
  enqueue(added);
  if (added.length > 1) {
    toast(t("files.added", { n: added.length, photos: photoWord(added.length) }));
  }
}

async function selectPhoto(id) {
  const photo = state.photos.find((item) => item.id === id);
  if (!photo) return;

  const changed = state.activeId !== id;
  state.activeId = id;
  if (changed) {
    state.adding = false;
    state.addPoints = [];
    state.zoom = 1;
  }

  emptyStateHidden();
  updateZoomUI();
  renderLibrary();
  setHint(defaultHint());
  updateAddButton();

  // Release the other bitmaps and keep the active one.
  for (const other of state.photos) if (other.id !== id) releaseBitmap(other);

  if (photo.status === "error") {
    toast(t("toast.couldNotLoadThis"));
    return;
  }

  if (photo.status !== "ready") {
    showCanvasLoading(true);
    return;
  }

  if (!photo.bitmap) {
    showCanvasLoading(true);
    try {
      await ensureBitmap(photo);
    } catch {
      showCanvasLoading(false);
      toast(t("toast.couldNotLoadPhoto"));
      return;
    }
    showCanvasLoading(false);
  }

  renderActive();
}

function removePhoto(photo) {
  const index = state.photos.indexOf(photo);
  if (index < 0) return;
  state.photos.splice(index, 1);
  history.delete(photo.id);
  releaseBitmap(photo, true);

  if (state.activeId === photo.id) {
    const next = state.photos[Math.min(index, state.photos.length - 1)];
    state.activeId = next ? next.id : null;
    if (next) selectPhoto(next.id);
    else {
      dom.editor.hidden = true;
      dom.emptyState.hidden = false;
      showCanvasLoading(false);
    }
  }

  renderLibrary();
  updateChrome();
}

function showCanvasLoading(visible) {
  dom.canvasLoading.classList.toggle("is-on", visible);
}

/* ------------------------------------------------------------------ */
/* rendering                                                           */
/* ------------------------------------------------------------------ */

function coverBox(box) {
  const scale = clamp(state.opts.cover, 0.5, 2);
  if (Math.abs(scale - 1) < 0.001) return box;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const w = box.w * scale;
  const h = box.h * scale;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

function featherCanvas(content, box, sx, sy, feather) {
  const cw = content.width;
  const ch = content.height;
  if (!cw || !ch) return content;

  const masked = document.createElement("canvas");
  masked.width = cw;
  masked.height = ch;
  const context = masked.getContext("2d");
  context.drawImage(content, 0, 0);
  context.globalCompositeOperation = "destination-in";

  const cx = box.x + box.w / 2 - sx;
  const cy = box.y + box.h / 2 - sy;
  const rx = box.w / 2;
  const ry = box.h / 2;
  const inner = Math.max(0, rx - Math.max(0, feather));

  context.save();
  context.translate(cx, cy);
  context.scale(1, ry / rx);
  const gradient = context.createRadialGradient(0, 0, inner, 0, 0, Math.max(inner + 0.01, rx));
  gradient.addColorStop(0, "rgba(0,0,0,1)");
  gradient.addColorStop(0.72, "rgba(0,0,0,1)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(-cw * 2, -ch * 2, cw * 4, ch * 4);
  context.restore();

  return masked;
}

function drawMosaic(ctx, source, box, scale, strength) {
  const x = box.x * scale;
  const y = box.y * scale;
  const w = box.w * scale;
  const h = box.h * scale;
  if (w < 5 || h < 5) return;

  const blocks = clamp(14 / strength, 3, 80);
  const blockPx = Math.max(4, w / blocks);
  const sw = Math.max(2, Math.round(w / blockPx));
  const sh = Math.max(2, Math.round(h / blockPx));

  const small = document.createElement("canvas");
  small.width = sw;
  small.height = sh;
  const smallCtx = small.getContext("2d");
  smallCtx.imageSmoothingEnabled = true;
  smallCtx.imageSmoothingQuality = "high";
  smallCtx.drawImage(source, box.x, box.y, box.w, box.h, 0, 0, sw, sh);

  const full = document.createElement("canvas");
  full.width = Math.max(2, Math.round(box.w));
  full.height = Math.max(2, Math.round(box.h));
  const fullCtx = full.getContext("2d");
  fullCtx.imageSmoothingEnabled = false;
  fullCtx.drawImage(small, 0, 0, sw, sh, 0, 0, full.width, full.height);

  const masked = featherCanvas(full, box, box.x, box.y, box.w * 0.07);
  ctx.drawImage(masked, x, y, w, h);
}

const spriteCache = new Map();
const paletteCache = new Map();

function hexToRgb(hex) {
  const value = String(hex || "").replace("#", "").trim();
  if (value.length !== 6) return [255, 77, 46];
  const number = Number.parseInt(value, 16);
  if (!Number.isFinite(number)) return [255, 77, 46];
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
}

function rgba(rgb, alpha) {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

function mixRgb(a, b, amount) {
  return a.map((value, index) => Math.round(value + (b[index] - value) * amount));
}

function laserBaseHex() {
  if (state.laserColor === "red") return LASER_PRESETS.red;
  if (state.laserColor === "yellow") return LASER_PRESETS.yellow;
  if (state.laserColor === "custom") return state.laserCustom;
  return LASER_PRESETS.original;
}

function laserPalette() {
  const hex = laserBaseHex();
  const cached = paletteCache.get(hex);
  if (cached) return cached;

  const base = hexToRgb(hex);
  const white = [255, 255, 255];
  const black = [0, 0, 0];
  let palette;

  if (hex.toLowerCase() === LASER_PRESETS.original) {
    palette = {
      base,
      haloCore: [255, 75, 28],
      haloOuter: [255, 35, 12],
      rayStart: [255, 225, 195],
      rayMid: [255, 95, 45],
      glowTail: [255, 65, 28],
      glowTailEdge: [255, 28, 8],
      bloom: [255, 80, 30],
      bloomEdge: [255, 30, 10],
      lineEdge: [255, 30, 8],
      lineMid: [255, 85, 38],
      lineInner: [255, 150, 85],
      lineCore: [255, 190, 130],
      hotMid: [255, 248, 232],
      hotWarm: [255, 180, 100],
      hotEdge: [255, 50, 15],
      coreMid: [255, 246, 228],
      coreWarm: [255, 180, 100],
      coreEdge: [255, 55, 18],
      innerFade: [255, 210, 170],
      ghostA: [255, 120, 60],
      ghostB: [255, 190, 120],
    };
  } else {
    palette = {
      base,
      haloCore: mixRgb(base, white, 0.15),
      haloOuter: mixRgb(base, black, 0.25),
      rayStart: mixRgb(base, white, 0.8),
      rayMid: base,
      glowTail: mixRgb(base, white, 0.12),
      glowTailEdge: mixRgb(base, black, 0.2),
      bloom: mixRgb(base, white, 0.18),
      bloomEdge: mixRgb(base, black, 0.15),
      lineEdge: mixRgb(base, white, 0.1),
      lineMid: mixRgb(base, white, 0.32),
      lineInner: mixRgb(base, white, 0.55),
      lineCore: mixRgb(base, white, 0.72),
      hotMid: [255, 250, 240],
      hotWarm: mixRgb(base, white, 0.55),
      hotEdge: base,
      coreMid: mixRgb(base, white, 0.9),
      coreWarm: mixRgb(base, white, 0.5),
      coreEdge: base,
      innerFade: mixRgb(base, white, 0.55),
      ghostA: mixRgb(base, white, 0.35),
      ghostB: mixRgb(base, white, 0.65),
    };
  }

  if (paletteCache.size > 10) paletteCache.clear();
  paletteCache.set(hex, palette);
  return palette;
}

function buildHaloSprite(palette) {
  const size = 768;
  const center = size / 2;
  const radius = 280;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.globalCompositeOperation = "lighter";
  ctx.translate(center, center);

  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 1.15);
  gradient.addColorStop(0, rgba(palette.haloCore, 0.24));
  gradient.addColorStop(0.4, rgba(palette.haloOuter, 0.11));
  gradient.addColorStop(1, rgba(palette.haloOuter, 0));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.15, 0, Math.PI * 2);
  ctx.fill();

  return canvas;
}

function buildRaysSprite(palette) {
  const size = 768;
  const center = size / 2;
  const radius = 280;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.globalCompositeOperation = "lighter";
  ctx.translate(center, center);

  ctx.save();
  if (supportsCanvasFilter()) ctx.filter = `blur(${Math.max(0.6, radius * 0.018)}px)`;
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    const variation = Math.abs(Math.sin(i * 12.9898 + 4.1414));
    const length = radius * (0.45 + 0.55 * variation);
    const width = radius * (i % 3 === 0 ? 0.035 : 0.02);
    ctx.save();
    ctx.rotate(angle);
    const ray = ctx.createLinearGradient(0, 0, length, 0);
    ray.addColorStop(0, rgba(palette.rayStart, 1));
    ray.addColorStop(0.3, rgba(palette.rayMid, 0.6));
    ray.addColorStop(1, rgba(palette.rayMid, 0));
    ctx.fillStyle = ray;
    ctx.beginPath();
    ctx.moveTo(0, -width);
    ctx.lineTo(length, 0);
    ctx.lineTo(0, width);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  return canvas;
}

function buildBeamGlowSprite(palette) {
  const width = 1024;
  const height = 128;
  const half = width / 2;
  const bloomHeight = 40;
  const tailHeight = 64;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.globalCompositeOperation = "lighter";
  ctx.translate(half, height / 2);
  const canFilter = supportsCanvasFilter();

  const tail = ctx.createLinearGradient(-half, 0, half, 0);
  tail.addColorStop(0, rgba(palette.glowTailEdge, 0));
  tail.addColorStop(0.16, rgba(palette.glowTailEdge, 0.05));
  tail.addColorStop(0.5, rgba(palette.glowTail, 0.16));
  tail.addColorStop(0.84, rgba(palette.glowTailEdge, 0.05));
  tail.addColorStop(1, rgba(palette.glowTailEdge, 0));
  ctx.save();
  if (canFilter) ctx.filter = "blur(6px)";
  ctx.fillStyle = tail;
  ctx.fillRect(-half, -tailHeight / 2, width, tailHeight);
  ctx.restore();

  const bloom = ctx.createLinearGradient(-half, 0, half, 0);
  bloom.addColorStop(0, rgba(palette.bloomEdge, 0));
  bloom.addColorStop(0.18, rgba(palette.bloomEdge, 0.14));
  bloom.addColorStop(0.5, rgba(palette.bloom, 0.45));
  bloom.addColorStop(0.82, rgba(palette.bloomEdge, 0.14));
  bloom.addColorStop(1, rgba(palette.bloomEdge, 0));
  ctx.save();
  if (canFilter) ctx.filter = "blur(4px)";
  ctx.fillStyle = bloom;
  ctx.fillRect(-half, -bloomHeight / 2, width, bloomHeight);
  ctx.restore();

  return canvas;
}

function buildBeamLineSprite(palette) {
  const width = 1024;
  const height = 128;
  const half = width / 2;
  const lineHeight = 8;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.globalCompositeOperation = "lighter";
  ctx.translate(half, height / 2);

  const line = ctx.createLinearGradient(-half, 0, half, 0);
  line.addColorStop(0, rgba(palette.lineEdge, 0));
  line.addColorStop(0.14, rgba(palette.lineEdge, 0.2));
  line.addColorStop(0.34, rgba(palette.lineMid, 0.45));
  line.addColorStop(0.47, rgba(palette.lineInner, 0.62));
  line.addColorStop(0.5, rgba(palette.lineCore, 0.72));
  line.addColorStop(0.53, rgba(palette.lineInner, 0.62));
  line.addColorStop(0.66, rgba(palette.lineMid, 0.45));
  line.addColorStop(0.86, rgba(palette.lineEdge, 0.2));
  line.addColorStop(1, rgba(palette.lineEdge, 0));
  ctx.save();
  if (supportsCanvasFilter()) ctx.filter = "blur(2.5px)";
  ctx.fillStyle = line;
  ctx.fillRect(-half, -lineHeight / 2, width, lineHeight);
  ctx.restore();

  return canvas;
}

function laserSprites() {
  const hex = laserBaseHex();
  const cached = spriteCache.get(hex);
  if (cached) return cached;

  const palette = laserPalette();
  const sprites = {
    halo: buildHaloSprite(palette),
    rays: buildRaysSprite(palette),
    glow: buildBeamGlowSprite(palette),
    line: buildBeamLineSprite(palette),
  };

  spriteCache.set(hex, sprites);
  if (spriteCache.size > 4) {
    const oldest = spriteCache.keys().next().value;
    if (oldest !== hex) spriteCache.delete(oldest);
  }
  return sprites;
}

function drawLaser(ctx, face, scale, opts) {
  const a = { x: face.eyeA.x * scale, y: face.eyeA.y * scale };
  const b = { x: face.eyeB.x * scale, y: face.eyeB.y * scale };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 3) return;

  const laserSize = clamp(opts.laser, 0.4, 2);
  const glow = clamp(opts.glow, 0.2, 2);
  const core = distance * 0.17 * laserSize;
  const flare = distance * 0.9 * glow;
  const beamLength = distance * 4.0 * glow;
  const beamHeight = Math.max(1.2, flare * 0.06);
  const tailHeight = beamHeight * 8;
  const beamAngle = Math.atan2(dy, dx);
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;

  const palette = laserPalette();
  const sprites = laserSprites();
  const haloCanvas = sprites.halo;
  const raysCanvas = sprites.rays;
  const glowCanvas = sprites.glow;
  const lineCanvas = sprites.line;
  const flareScale = flare / 280;
  const flareHalf = haloCanvas.width / 2;
  const flareAlpha = Math.min(1, glow);
  const extraAlpha = glow > 1 ? Math.min(1, glow - 1) : 0;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  for (const [index, point] of [a, b].entries()) {
    ctx.save();
    ctx.translate(point.x, point.y);

    // halo, beam glow and rays — each eye only on its own half of the face.
    // The glow therefore continues across, but the two sides don't add into a hotspot.
    ctx.save();
    ctx.translate(midX - point.x, midY - point.y);
    ctx.rotate(beamAngle);
    ctx.beginPath();
    if (index === 0) ctx.rect(-20000, -20000, 20000, 40000);
    else ctx.rect(0, -20000, 20000, 40000);
    ctx.clip();
    ctx.translate(index === 0 ? -distance / 2 : distance / 2, 0);

    ctx.globalAlpha = flareAlpha;
    ctx.drawImage(
      haloCanvas,
      -flareHalf * flareScale,
      -flareHalf * flareScale,
      haloCanvas.width * flareScale,
      haloCanvas.height * flareScale
    );
    if (extraAlpha > 0) {
      ctx.globalAlpha = extraAlpha;
      ctx.drawImage(
        haloCanvas,
        -flareHalf * flareScale,
        -flareHalf * flareScale,
        haloCanvas.width * flareScale,
        haloCanvas.height * flareScale
      );
    }

    ctx.globalAlpha = flareAlpha;
    ctx.drawImage(glowCanvas, -beamLength, -tailHeight, beamLength * 2, tailHeight * 2);
    if (extraAlpha > 0) {
      ctx.globalAlpha = extraAlpha;
      ctx.drawImage(glowCanvas, -beamLength, -tailHeight, beamLength * 2, tailHeight * 2);
    }

    ctx.save();
    ctx.rotate(index === 0 ? 0.18 : 1.31);
    ctx.globalAlpha = flareAlpha;
    ctx.drawImage(
      raysCanvas,
      -flareHalf * flareScale,
      -flareHalf * flareScale,
      raysCanvas.width * flareScale,
      raysCanvas.height * flareScale
    );
    if (extraAlpha > 0) {
      ctx.globalAlpha = extraAlpha;
      ctx.drawImage(
        raysCanvas,
        -flareHalf * flareScale,
        -flareHalf * flareScale,
        raysCanvas.width * flareScale,
        raysCanvas.height * flareScale
      );
    }
    ctx.restore();
    ctx.restore();

    // thin beam line — may cross the whole face, but it's only a thin line
    ctx.save();
    ctx.rotate(beamAngle);
    ctx.globalAlpha = flareAlpha;
    ctx.drawImage(lineCanvas, -beamLength, -tailHeight, beamLength * 2, tailHeight * 2);
    if (extraAlpha > 0) {
      ctx.globalAlpha = extraAlpha;
      ctx.drawImage(lineCanvas, -beamLength, -tailHeight, beamLength * 2, tailHeight * 2);
    }
    ctx.restore();

    // subtle camera ghosts
    ctx.save();
    ctx.rotate(beamAngle * 0.12 + (index === 0 ? 0.18 : 1.31));
    const ghostAlpha = Math.min(1.5, glow);
    const ghostAngle = -0.65 + index * 0.22;
    const ghosts = [
      { distance: 2.0, size: 0.18, alpha: 0.1, color: palette.ghostA },
      { distance: 3.1, size: 0.11, alpha: 0.08, color: palette.ghostB },
    ];
    for (const ghost of ghosts) {
      const gx = Math.cos(ghostAngle) * flare * ghost.distance;
      const gy = Math.sin(ghostAngle) * flare * ghost.distance;
      const radius = Math.max(1.5, flare * ghost.size);
      const ghostGradient = ctx.createRadialGradient(gx, gy, 0, gx, gy, radius);
      ghostGradient.addColorStop(0, rgba(ghost.color, ghost.alpha * ghostAlpha));
      ghostGradient.addColorStop(0.7, rgba(ghost.color, ghost.alpha * 0.35 * ghostAlpha));
      ghostGradient.addColorStop(1, rgba(ghost.color, 0));
      ctx.fillStyle = ghostGradient;
      ctx.beginPath();
      ctx.arc(gx, gy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // white-hot horizontal streak at the eye (classic laser look)
    ctx.save();
    ctx.rotate(beamAngle);
    const hotWidth = core * 4.2;
    const hotHeight = core * 0.85;
    ctx.scale(1, hotHeight / hotWidth);
    const hot = ctx.createRadialGradient(0, 0, 0, 0, 0, hotWidth / 2);
    hot.addColorStop(0, "rgba(255,255,255,1)");
    hot.addColorStop(0.35, rgba(palette.hotMid, 0.98));
    hot.addColorStop(0.65, rgba(palette.hotWarm, 0.55));
    hot.addColorStop(1, rgba(palette.hotEdge, 0));
    ctx.fillStyle = hot;
    ctx.beginPath();
    ctx.arc(0, 0, hotWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // bright core (the eyes) — independent of the glow size
    let gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, core);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.24, rgba(palette.coreMid, 1));
    gradient.addColorStop(0.55, rgba(palette.coreWarm, 0.95));
    gradient.addColorStop(0.82, rgba(palette.coreEdge, 0.7));
    gradient.addColorStop(1, rgba(palette.coreEdge, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, core, 0, Math.PI * 2);
    ctx.fill();

    gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, core * 0.5);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(1, rgba(palette.innerFade, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, core * 0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  ctx.restore();
}

let canvasFilterSupport = null;

function supportsCanvasFilter() {
  if (canvasFilterSupport !== null) return canvasFilterSupport;
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.filter = "blur(2px)";
    canvasFilterSupport = ctx.filter === "blur(2px)";
  } catch {
    canvasFilterSupport = false;
  }
  return canvasFilterSupport;
}

function drawGaussian(ctx, source, box, scale, strength) {
  const x = box.x * scale;
  const y = box.y * scale;
  const w = box.w * scale;
  const h = box.h * scale;
  if (w < 5 || h < 5) return;

  const radius = Math.max(0.5, box.w * 0.12 * strength);
  const pad = Math.ceil(radius * 2.5);
  const sx = Math.max(0, Math.floor(box.x - pad));
  const sy = Math.max(0, Math.floor(box.y - pad));
  const ex = Math.min(source.width, Math.ceil(box.x + box.w + pad));
  const ey = Math.min(source.height, Math.ceil(box.y + box.h + pad));
  const cw = ex - sx;
  const ch = ey - sy;
  if (cw < 4 || ch < 4) return;

  const halfW = Math.max(2, Math.round(cw / 2));
  const halfH = Math.max(2, Math.round(ch / 2));
  const small = document.createElement("canvas");
  small.width = halfW;
  small.height = halfH;
  const smallCtx = small.getContext("2d");
  smallCtx.filter = `blur(${radius * (halfW / cw)}px)`;
  smallCtx.drawImage(source, sx, sy, cw, ch, 0, 0, halfW, halfH);

  const temp = document.createElement("canvas");
  temp.width = cw;
  temp.height = ch;
  const tempCtx = temp.getContext("2d");
  tempCtx.imageSmoothingEnabled = true;
  tempCtx.imageSmoothingQuality = "high";
  tempCtx.drawImage(small, 0, 0, halfW, halfH, 0, 0, cw, ch);

  const masked = featherCanvas(temp, box, sx, sy, box.w * 0.22);
  ctx.drawImage(masked, sx * scale, sy * scale, cw * scale, ch * scale);
}

function drawSolid(ctx, box, scale) {
  const x = box.x * scale;
  const y = box.y * scale;
  const w = box.w * scale;
  const h = box.h * scale;
  if (w < 5 || h < 5) return;

  const full = document.createElement("canvas");
  full.width = Math.max(2, Math.round(box.w));
  full.height = Math.max(2, Math.round(box.h));
  const fullCtx = full.getContext("2d");
  fullCtx.fillStyle = "#0a0a0c";
  fullCtx.fillRect(0, 0, full.width, full.height);

  const masked = featherCanvas(full, box, box.x, box.y, box.w * 0.05);
  ctx.drawImage(masked, x, y, w, h);
}

function faceOvalBounds(face) {
  if (!face.oval || face.oval.length < 3) return null;
  return boundsOf(face.oval);
}

function drawCustom(ctx, face, scale) {
  const sticker = state.customFace;
  if (!sticker?.canvas) return;

  // Use the landmark oval when available so the mask follows the face, not a box.
  const base = faceOvalBounds(face) || face.box;
  const area = coverBox(base);
  const x = area.x * scale;
  const y = area.y * scale;
  const w = area.w * scale;
  const h = area.h * scale;
  if (w < 4 || h < 4) return;

  const cover = clamp(state.opts.cover, 0.5, 2);
  const centerX = x + w / 2;
  const centerY = y + h / 2;
  // The cover slider is applied here; `area` is already scaled, so use the
  // unscaled face bounds for the pivot to avoid applying it twice.
  const pivotX = (base.x + base.w / 2) * scale;
  const pivotY = (base.y + base.h / 2) * scale;
  const adjusted = (point) => ({
    x: pivotX + (point.x * scale - pivotX) * cover,
    y: pivotY + (point.y * scale - pivotY) * cover,
  });

  // Best fit: map the eye centres and the chin exactly (affine), so the face
  // features line up and the sticker still follows the face contour.
  const targetChin = face.oval?.[FACE_OVAL.indexOf(152)];
  if (sticker.eyes && sticker.chin && targetChin) {
    const a = adjusted(face.eyeA);
    const b = adjusted(face.eyeB);
    const chin = adjusted(targetChin);
    const srcA = sticker.eyes.a;
    const srcB = sticker.eyes.b;
    const srcChin = sticker.chin;

    const ux = srcB.x - srcA.x;
    const uy = srcB.y - srcA.y;
    const vx = srcChin.x - srcA.x;
    const vy = srcChin.y - srcA.y;
    const det = ux * vy - uy * vx;

    if (Math.abs(det) > 1e-6) {
      const px = b.x - a.x;
      const py = b.y - a.y;
      const qx = chin.x - a.x;
      const qy = chin.y - a.y;

      const m11 = (px * vy - qx * uy) / det;
      const m12 = (qx * ux - px * vx) / det;
      const m21 = (py * vy - qy * uy) / det;
      const m22 = (qy * ux - py * vx) / det;
      const e = a.x - (m11 * srcA.x + m12 * srcA.y);
      const f = a.y - (m21 * srcA.x + m22 * srcA.y);

      // Slightly oversize the mask around the eye line so the target face is
      // fully covered even when its proportions differ from the uploaded face.
      const grow = 1.06;
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;

      ctx.save();
      ctx.setTransform(
        m11 * grow,
        m21 * grow,
        m12 * grow,
        m22 * grow,
        grow * e + (1 - grow) * midX,
        grow * f + (1 - grow) * midY
      );
      ctx.drawImage(sticker.canvas, 0, 0);
      ctx.restore();
      return;
    }
  }

  // Fallback: map the oval bounding box (manual crops, no landmarks).
  const scaleX = w / sticker.ringBox.w;
  const scaleY = h / sticker.ringBox.h;
  const angle =
    Math.atan2(face.eyeB.y - face.eyeA.y, face.eyeB.x - face.eyeA.x) - (sticker.angle || 0);

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(angle);
  ctx.translate(-centerX, -centerY);
  ctx.drawImage(
    sticker.canvas,
    x - sticker.ringBox.x * scaleX,
    y - sticker.ringBox.y * scaleY,
    sticker.canvas.width * scaleX,
    sticker.canvas.height * scaleY
  );
  ctx.restore();
}

function drawScene(ctx, photo, width, height, opts) {
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(photo.bitmap, 0, 0, width, height);

  const scale = width / photo.width;
  const faces = photo.faces.filter((face) => face.on);
  if (!faces.length) return;

  if (state.mode === "both" || state.mode === "cover") {
    const useBlur = state.coverType === "blur" && supportsCanvasFilter();
    for (const face of faces) {
      const area = coverBox(face.box);
      if (state.coverType === "custom") drawCustom(ctx, face, scale);
      else if (state.coverType === "solid") drawSolid(ctx, area, scale);
      else if (useBlur) drawGaussian(ctx, photo.bitmap, area, scale, opts.blur);
      else drawMosaic(ctx, photo.bitmap, area, scale, opts.blur);
    }
  }
  if (state.mode === "both" || state.mode === "lasers") {
    for (const face of faces) drawLaser(ctx, face, scale, opts);
  }
}

function viewMetrics(photo) {
  const maxSide = Math.max(photo.width, photo.height);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const rect = dom.canvasScroll.getBoundingClientRect();
  const availW = Math.max(300, rect.width - 44);
  const availH = Math.max(240, rect.height - 44);
  const fit = Math.min(availW / photo.width, availH / photo.height, 1);
  const displayScale = fit * state.zoom;
  return {
    cssW: Math.max(1, Math.round(photo.width * displayScale)),
    cssH: Math.max(1, Math.round(photo.height * displayScale)),
    renderScale: Math.min(1, displayScale * dpr * 1.12, PREVIEW_MAX_SIDE / maxSide),
  };
}

function renderCanvas() {
  const photo = activePhoto();
  if (!photo || !photo.bitmap) return;

  const metrics = viewMetrics(photo);
  const width = Math.max(1, Math.round(photo.width * metrics.renderScale));
  const height = Math.max(1, Math.round(photo.height * metrics.renderScale));

  if (dom.canvas.width !== width || dom.canvas.height !== height) {
    dom.canvas.width = width;
    dom.canvas.height = height;
  }
  dom.canvas.style.width = `${metrics.cssW}px`;
  dom.canvas.style.height = `${metrics.cssH}px`;
  dom.canvasScroll.classList.toggle("is-zoomed", state.zoom > 1.001);

  drawScene(dom.canvas.getContext("2d"), photo, width, height, state.opts);
}

function renderActive() {
  const photo = activePhoto();
  if (!photo || !photo.bitmap) return;

  renderCanvas();
  renderMarkers(photo);
  updateSummary(photo);
  dom.canvasBox.classList.toggle("adding", state.adding);
}

let canvasPending = false;

function scheduleCanvas() {
  if (canvasPending) return;
  canvasPending = true;
  requestAnimationFrame(() => {
    canvasPending = false;
    renderCanvas();
  });
}

function scheduleRender() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    renderActive();
  });
}

function updateZoomUI() {
  dom.zoomChip.hidden = state.zoom <= 1.001;
  dom.zoomChip.textContent = `${Math.round(state.zoom * 100)}%`;
  dom.zoomChip.title = t("action.zoomReset");
}

function setZoom(value, anchor = null) {
  const photo = activePhoto();
  if (!photo || !photo.bitmap) return;

  const scroll = dom.canvasScroll;
  const scrollRect = scroll.getBoundingClientRect();
  let centerX = 0.5;
  let centerY = 0.5;
  let anchorX = 0;
  let anchorY = 0;

  if (anchor) {
    const rect = dom.canvas.getBoundingClientRect();
    anchorX = clamp((anchor.clientX - rect.left) / rect.width, 0, 1);
    anchorY = clamp((anchor.clientY - rect.top) / rect.height, 0, 1);
  } else {
    const beforeW = Math.max(1, scroll.scrollWidth);
    const beforeH = Math.max(1, scroll.scrollHeight);
    centerX = (scroll.scrollLeft + scroll.clientWidth / 2) / beforeW;
    centerY = (scroll.scrollTop + scroll.clientHeight / 2) / beforeH;
  }

  state.zoom = clamp(value, ZOOM_MIN, ZOOM_MAX);
  updateZoomUI();
  renderCanvas();
  dom.canvasScroll.classList.toggle("is-zoomed", state.zoom > 1.001);

  if (anchor) {
    const rect = dom.canvas.getBoundingClientRect();
    const offsetX = rect.left - scrollRect.left + scroll.scrollLeft;
    const offsetY = rect.top - scrollRect.top + scroll.scrollTop;
    scroll.scrollLeft = offsetX + anchorX * rect.width - (anchor.clientX - scrollRect.left);
    scroll.scrollTop = offsetY + anchorY * rect.height - (anchor.clientY - scrollRect.top);
  } else {
    scroll.scrollLeft = centerX * scroll.scrollWidth - scroll.clientWidth / 2;
    scroll.scrollTop = centerY * scroll.scrollHeight - scroll.clientHeight / 2;
  }
}

/* ------------------------------------------------------------------ */
/* markers / overlay                                                   */
/* ------------------------------------------------------------------ */

function positionMarker(marker, face, photo) {
  const area = coverBox(face.box);
  marker.style.left = `${(area.x / photo.width) * 100}%`;
  marker.style.top = `${(area.y / photo.height) * 100}%`;
  marker.style.width = `${(area.w / photo.width) * 100}%`;
  marker.style.height = `${(area.h / photo.height) * 100}%`;
}

function renderMarkers(photo) {
  dom.overlay.textContent = "";
  dom.overlay.classList.toggle("is-hidden", !state.showMarkers);

  if (!state.showMarkers) return;

  photo.faces.forEach((face, index) => {
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = "marker";
    if (!face.on) marker.classList.add("is-off");
    if (face.manual) marker.classList.add("is-manual");
    marker.title = face.on
      ? t("marker.covered", { n: index + 1 })
      : t("marker.visible", { n: index + 1 });
    marker.dataset.faceId = face.id;
    positionMarker(marker, face, photo);

    const num = document.createElement("span");
    num.className = "marker-num";
    num.textContent = String(index + 1);
    marker.append(num);

    attachMarkerHandlers(photo, face, marker);
    dom.overlay.append(marker);
  });

  if (state.adding) {
    for (const point of state.addPoints) {
      const dot = document.createElement("div");
      dot.className = "add-dot";
      dot.style.left = `${(point.x / photo.width) * 100}%`;
      dot.style.top = `${(point.y / photo.height) * 100}%`;
      dom.overlay.append(dot);
    }
  }
}

function attachMarkerHandlers(photo, face, marker) {
  marker.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      marker.setPointerCapture?.(event.pointerId);
    } catch {}
    drag = {
      face,
      marker,
      photo,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      box: { ...face.box },
      eyeA: { ...face.eyeA },
      eyeB: { ...face.eyeB },
      rect: dom.canvas.getBoundingClientRect(),
      oval: face.oval ? face.oval.map((point) => ({ ...point })) : null,
      before: cloneFaces(photo.faces),
    };

    // Touch has no right click: hold a marker to delete it.
    if (event.pointerType !== "mouse") {
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => {
        pressTimer = null;
        if (!drag || drag.face !== face || drag.moved) return;
        drag = null;
        try {
          navigator.vibrate?.(15);
        } catch {}
        removeFace(photo, face);
      }, 550);
    }
  });

  marker.addEventListener("pointermove", (event) => {
    if (!drag || drag.face !== face) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return;
    clearTimeout(pressTimer);
    pressTimer = null;
    drag.moved = true;

    const dx = ((event.clientX - drag.startX) / drag.rect.width) * photo.width;
    const dy = ((event.clientY - drag.startY) / drag.rect.height) * photo.height;

    const nx = clamp(drag.box.x + dx, -drag.box.w * 0.35, photo.width - drag.box.w * 0.65);
    const ny = clamp(drag.box.y + dy, -drag.box.h * 0.35, photo.height - drag.box.h * 0.65);
    const ddx = nx - drag.box.x;
    const ddy = ny - drag.box.y;

    face.box.x = nx;
    face.box.y = ny;
    face.eyeA.x = drag.eyeA.x + ddx;
    face.eyeA.y = drag.eyeA.y + ddy;
    face.eyeB.x = drag.eyeB.x + ddx;
    face.eyeB.y = drag.eyeB.y + ddy;
    if (drag.oval) {
      face.oval = drag.oval.map((point) => ({ x: point.x + ddx, y: point.y + ddy }));
    }

    positionMarker(marker, face, photo);
    scheduleCanvas();
  });

  const endDrag = (event) => {
    if (!drag || drag.face !== face) return;
    clearTimeout(pressTimer);
    pressTimer = null;
    const moved = drag.moved;
    const before = drag.before;
    drag = null;
    if (moved) {
      recordHistory(photo, before);
      renderActive();
      return;
    }
    if (event.shiftKey) removeFace(photo, face);
    else toggleFace(photo, face);
  };

  marker.addEventListener("pointerup", endDrag);
  marker.addEventListener("pointercancel", () => {
    clearTimeout(pressTimer);
    pressTimer = null;
    drag = null;
  });
  marker.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    removeFace(photo, face);
  });
}

/* ------------------------------------------------------------------ */
/* undo / redo                                                         */
/* ------------------------------------------------------------------ */

const history = new Map();
const HISTORY_LIMIT = 40;

function cloneFaces(faces) {
  return faces.map((face) => ({
    ...face,
    box: { ...face.box },
    eyeA: { ...face.eyeA },
    eyeB: { ...face.eyeB },
    oval: face.oval ? face.oval.map((point) => ({ ...point })) : null,
    origin: face.origin
      ? {
          box: { ...face.origin.box },
          eyeA: { ...face.origin.eyeA },
          eyeB: { ...face.origin.eyeB },
          oval: face.origin.oval ? face.origin.oval.map((point) => ({ ...point })) : null,
        }
      : null,
  }));
}

function photoHistory(photo) {
  if (!photo) return null;
  let entry = history.get(photo.id);
  if (!entry) {
    entry = { past: [], future: [] };
    history.set(photo.id, entry);
  }
  return entry;
}

function recordHistory(photo, before) {
  if (!photo || !before) return;
  const entry = photoHistory(photo);
  entry.past.push(before);
  if (entry.past.length > HISTORY_LIMIT) entry.past.shift();
  entry.future.length = 0;
  syncHistoryButtons();
}

function syncHistoryButtons() {
  const photo = activePhoto();
  const entry = photo ? history.get(photo.id) : null;
  const undoDisabled = !entry || entry.past.length === 0;
  const redoDisabled = !entry || entry.future.length === 0;
  dom.undoBtn.disabled = undoDisabled;
  dom.redoBtn.disabled = redoDisabled;
}

function undo() {
  const photo = activePhoto();
  const entry = photo ? photoHistory(photo) : null;
  if (!entry || !entry.past.length) return;
  entry.future.push(cloneFaces(photo.faces));
  photo.faces = entry.past.pop();
  renderLibrary();
  renderActive();
  syncHistoryButtons();
}

function redo() {
  const photo = activePhoto();
  const entry = photo ? photoHistory(photo) : null;
  if (!entry || !entry.future.length) return;
  entry.past.push(cloneFaces(photo.faces));
  photo.faces = entry.future.pop();
  renderLibrary();
  renderActive();
  syncHistoryButtons();
}

function toggleFace(photo, face) {
  const before = cloneFaces(photo.faces);
  face.on = !face.on;
  recordHistory(photo, before);
  renderActive();
}

function resetPositions() {
  const photo = activePhoto();
  if (!photo) return;

  const before = cloneFaces(photo.faces);
  let count = 0;
  for (const face of photo.faces) {
    if (!face.origin) continue;
    face.box = { ...face.origin.box };
    face.eyeA = { ...face.origin.eyeA };
    face.eyeB = { ...face.origin.eyeB };
    face.oval = face.origin.oval ? face.origin.oval.map((point) => ({ ...point })) : null;
    count += 1;
  }

  if (!count) {
    toast(t("toast.noPositions"));
    return;
  }
  recordHistory(photo, before);
  renderActive();
  toast(t("toast.positionsReset"));
}

function removeFace(photo, face) {
  const before = cloneFaces(photo.faces);
  photo.faces = photo.faces.filter((item) => item.id !== face.id);
  recordHistory(photo, before);
  renderActive();
  toast(t("toast.markerDeleted"), {
    label: t("misc.undo"),
    onClick: () => {
      if (state.activeId === photo.id) {
        undo();
      } else {
        selectPhoto(photo.id).then(() => undo());
      }
    },
  });
}

/* ------------------------------------------------------------------ */
/* status bar                                                          */
/* ------------------------------------------------------------------ */

function defaultHint() {
  if (state.detectors.error) return t("hint.noDetection");
  return state.mode === "lasers" ? t("hint.lasers") : t("hint.cover");
}

function setHint(text, hot = false) {
  dom.hint.textContent = text;
  dom.hint.classList.toggle("is-hot", hot);
}

function updateSummary(photo) {
  dom.summary.textContent = "";

  if (!photo.faces.length && photo.detectStatus === "running") {
    const span = document.createElement("span");
    span.className = "sum-zero";
    span.textContent = t("summary.detecting");
    dom.summary.append(span);
    return;
  }

  if (!photo.faces.length) {
    const span = document.createElement("span");
    span.className = "sum-zero";
    span.textContent = photo.detectStatus === "failed" ? t("summary.detectionFailed") : t("summary.noFaces");
    if (photo.detectStatus === "failed" && photo.detectError) span.title = photo.detectError;
    dom.summary.append(span);

    if (photo.detectStatus === "failed") {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "linkbtn";
      button.textContent = t("summary.retry");
      button.addEventListener("click", () => retryPhoto(photo));
      dom.summary.append(button);
    }
    return;
  }

  const total = photo.faces.length;
  const covered = photo.faces.filter((face) => face.on).length;
  const label = state.mode === "lasers" ? t("label.withLasers") : t("label.covered");
  const missing = state.mode === "lasers" ? t("label.withoutLasers") : t("label.uncovered");
  const span = document.createElement("span");
  if (covered === total) {
    span.textContent = t("summary.count", { covered, total, label });
  } else {
    span.className = "sum-warn";
    span.textContent = t("summary.countWarn", { covered, total, label, n: total - covered, missing });
  }
  dom.summary.append(span);

  if (covered < total) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "linkbtn";
    button.textContent = state.mode === "lasers" ? t("summary.allLasers") : t("summary.allCover");
    button.addEventListener("click", () => {
      const before = cloneFaces(photo.faces);
      photo.faces.forEach((face) => {
        face.on = true;
      });
      recordHistory(photo, before);
      renderActive();
    });
    dom.summary.append(button);
  }
}

function resetEverything() {
  if (!window.confirm(t("confirm.resetAll"))) return;

  queue.length = 0;
  for (const photo of state.photos) releaseBitmap(photo, true);

  state.photos = [];
  state.activeId = null;
  state.adding = false;
  state.addPoints = [];
  state.zoom = 1;
  state.showMarkers = true;
  state.mode = "lasers";
  state.coverType = "blur";
  state.customFace = null;
  state.customPending = false;
  state.customBusy = false;
  state.laserColor = "original";
  state.laserCustom = LASER_PRESETS.original;
  state.opts = { ...DEFAULT_OPTS };
  drag = null;
  clearTimeout(pressTimer);
  pressTimer = null;
  zoomHintShown = false;

  closeFaceModal(false);
  closePhotoSheet();
  closeSettings();
  history.clear();

  try {
    localStorage.removeItem("lasereyes.opts");
  } catch {}
  dom.fileInput.value = "";
  dom.faceInput.value = "";

  syncControls();
  updateZoomUI();
  updateChrome();
  renderLibrary();
  dom.editor.hidden = true;
  dom.emptyState.hidden = false;
  setHint(defaultHint());
  syncHistoryButtons();
  toast(t("toast.resetAll"));
}

/* ------------------------------------------------------------------ */
/* add-face mode                                                       */
/* ------------------------------------------------------------------ */

function updateAddButton() {
  dom.addFaceBtn.classList.toggle("is-active", state.adding);
  dom.canvasBox.classList.toggle("adding", state.adding);
}

function setAdding(on) {
  state.adding = on;
  state.addPoints = [];
  if (on) {
    state.showMarkers = true;
    dom.markersBtn.classList.add("is-active");
    setHint(t("hint.clickLeft"), true);
  } else {
    setHint(defaultHint());
  }
  updateAddButton();
  renderActive();
}

function handleCanvasClick(event) {
  if (!state.adding) return;
  const photo = activePhoto();
  if (!photo || !photo.bitmap) return;

  const rect = dom.canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * photo.width;
  const y = ((event.clientY - rect.top) / rect.height) * photo.height;
  if (x < 0 || y < 0 || x > photo.width || y > photo.height) return;

  state.addPoints.push({ x, y });

  if (state.addPoints.length === 1) {
    setHint(t("hint.clickRight"), true);
    renderActive();
    return;
  }

  const [a, b] = state.addPoints;
  if (Math.hypot(b.x - a.x, b.y - a.y) < Math.max(8, photo.width * 0.004)) {
    state.addPoints = [a];
    setHint(t("hint.secondEyeFar"), true);
    renderActive();
    return;
  }

  const before = cloneFaces(photo.faces);
  photo.faces.push(makeManualFace(a, b));
  photo.faces.sort((first, second) => first.box.x - second.box.x);
  recordHistory(photo, before);
  state.addPoints = [];
  setAdding(false);
  toast(t("toast.faceAdded"));
}

/* ------------------------------------------------------------------ */
/* custom face cover                                                   */
/* ------------------------------------------------------------------ */

let facePick = null;

function syncCustomFaceUI() {
  const hasFace = !!state.customFace;
  dom.customFaceBtn.hidden = !(state.coverType === "custom" || state.customPending);
  dom.customFaceBtn.classList.toggle("has-image", hasFace);
  dom.customFaceBtn.classList.toggle("is-pending", !hasFace);
  dom.customFaceThumb.hidden = !hasFace;
  if (hasFace) dom.customFaceImg.src = state.customFace.thumb;
  else dom.customFaceImg.removeAttribute("src");
  dom.customFaceLabel.textContent = t(hasFace ? "custom.change" : "custom.choose");
  syncSettingsLayout();
}

function squareAroundBox(box, width, height) {
  const side = Math.min(Math.max(box.w, box.h) * 1.28, width, height);
  const x = clamp(box.x + box.w / 2 - side / 2, 0, width - side);
  const y = clamp(box.y + box.h / 2 - side / 2, 0, height - side);
  return { x, y, w: side, h: side };
}

function boundsOf(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function ovalRect(points, width, height) {
  const bounds = boundsOf(points);
  const pad = Math.max(bounds.w, bounds.h) * 0.06;
  const x = clamp(bounds.x - pad, 0, width);
  const y = clamp(bounds.y - pad, 0, height);
  const w = clamp(bounds.x + bounds.w + pad, 0, width) - x;
  const h = clamp(bounds.y + bounds.h + pad, 0, height) - y;
  return { x, y, w: Math.max(8, w), h: Math.max(8, h) };
}

/**
 * Build a sticker from the uploaded face photo.
 * With ovalPoints the face contour is cut out along the landmarks; otherwise
 * a soft ellipse is used (manual crop fallback).
 */
function buildSticker(source, rect, ovalPoints, angle, eyes, chin) {
  const width = Math.max(2, Math.round(rect.w));
  const height = Math.max(2, Math.round(rect.h));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, width, height);

  const mask = document.createElement("canvas");
  mask.width = width;
  mask.height = height;
  const maskContext = mask.getContext("2d");
  const scaleX = width / rect.w;
  const scaleY = height / rect.h;
  let ringBox = { x: 0, y: 0, w: width, h: height };

  maskContext.fillStyle = "#ffffff";
  if (ovalPoints && ovalPoints.length > 2) {
    const points = ovalPoints.map((point) => ({
      x: (point.x - rect.x) * scaleX,
      y: (point.y - rect.y) * scaleY,
    }));
    const bounds = boundsOf(points);
    const centerX = bounds.x + bounds.w / 2;
    const centerY = bounds.y + bounds.h / 2;
    const grow = 1.03;
    maskContext.beginPath();
    points.forEach((point, index) => {
      const x = centerX + (point.x - centerX) * grow;
      const y = centerY + (point.y - centerY) * grow;
      if (index) maskContext.lineTo(x, y);
      else maskContext.moveTo(x, y);
    });
    maskContext.closePath();
    ringBox = {
      x: bounds.x - (bounds.w * (grow - 1)) / 2,
      y: bounds.y - (bounds.h * (grow - 1)) / 2,
      w: bounds.w * grow,
      h: bounds.h * grow,
    };
  } else {
    maskContext.beginPath();
    maskContext.ellipse(width / 2, height / 2, width * 0.495, height * 0.495, 0, 0, Math.PI * 2);
  }

  const feather = Math.max(1, Math.min(width, height) * 0.015);
  maskContext.save();
  if (supportsCanvasFilter()) maskContext.filter = `blur(${feather}px)`;
  maskContext.fill();
  maskContext.restore();

  context.globalCompositeOperation = "destination-in";
  context.drawImage(mask, 0, 0);

  const thumb = document.createElement("canvas");
  thumb.width = 96;
  thumb.height = 96;
  const thumbContext = thumb.getContext("2d");
  thumbContext.fillStyle = "#151519";
  thumbContext.fillRect(0, 0, 96, 96);
  const fit = Math.min(96 / width, 96 / height);
  thumbContext.drawImage(canvas, (96 - width * fit) / 2, (96 - height * fit) / 2, width * fit, height * fit);

  const toCanvas = (point) =>
    point
      ? { x: (point.x - rect.x) * scaleX, y: (point.y - rect.y) * scaleY }
      : null;

  return {
    canvas,
    ringBox,
    angle: Number.isFinite(angle) ? angle : 0,
    eyes: eyes ? { a: toCanvas(eyes.a), b: toCanvas(eyes.b) } : null,
    chin: toCanvas(chin),
    thumb: thumb.toDataURL("image/jpeg", 0.85),
  };
}

function applyCustomFace(sticker, name) {
  state.customFace = { ...sticker, name: name || "face" };
  state.customPending = false;
  state.coverType = "custom";
  dom.coverSelect.value = "custom";
  syncCustomFaceUI();
  saveOpts();
  renderActive();
  if (sticker.canvas.width < 240) toast(t("custom.lowRes"));
}

function useSquareFace(source, rect, name) {
  applyCustomFace(buildSticker(source, rect, null, 0), name);
}

function usePreciseFaceSticker(source, analysis, name) {
  const rect = ovalRect(analysis.oval, source.width, source.height);
  applyCustomFace(
    buildSticker(source, rect, analysis.oval, analysis.angle, analysis.eyes, analysis.chin),
    name
  );
}

async function analyzeFace(bitmap, box) {
  let landmarker;
  try {
    landmarker = await ensureLandmarker();
  } catch {
    return null;
  }

  const size = Math.round(Math.max(box.w, box.h) * 1.5);
  if (size < 40) return null;

  const centerX = box.x + box.w / 2;
  const centerY = box.y + box.h / 2;
  let sx = Math.round(centerX - size / 2);
  let sy = Math.round(centerY - size / 2);
  let sw = size;
  let sh = size;
  if (sx < 0) {
    sw += sx;
    sx = 0;
  }
  if (sy < 0) {
    sh += sy;
    sy = 0;
  }
  if (sx + sw > bitmap.width) sw = bitmap.width - sx;
  if (sy + sh > bitmap.height) sh = bitmap.height - sy;
  if (sw < 32 || sh < 32) return null;

  const crop = document.createElement("canvas");
  crop.width = sw;
  crop.height = sh;
  crop.getContext("2d").drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);

  let result;
  try {
    result = landmarker.detect(crop);
  } catch (error) {
    console.warn("LaserEyes: face landmark detection failed", error);
    return null;
  }

  const sets = result?.faceLandmarks || [];
  if (!sets.length) return null;

  let best = null;
  let bestDistance = Infinity;
  for (const points of sets) {
    const bounds = boundsOf(points);
    const distance = Math.hypot(bounds.x + bounds.w / 2 - 0.5, bounds.y + bounds.h / 2 - 0.5);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = points;
    }
  }
  if (!best || best.length < 478) return null;

  const toPhoto = (point) => ({ x: sx + point.x * sw, y: sy + point.y * sh });
  const centroid = (indices) => {
    let x = 0;
    let y = 0;
    for (const index of indices) {
      x += best[index].x;
      y += best[index].y;
    }
    return toPhoto({ x: x / indices.length, y: y / indices.length });
  };

  const eyeA = centroid([468, 469, 470, 471, 472]);
  const eyeB = centroid([473, 474, 475, 476, 477]);
  const angle =
    Math.hypot(eyeB.x - eyeA.x, eyeB.y - eyeA.y) > 2
      ? Math.atan2(eyeB.y - eyeA.y, eyeB.x - eyeA.x)
      : 0;

  const oval = FACE_OVAL.map((index) => toPhoto(best[index]));
  return {
    oval,
    angle,
    eyes: { a: eyeA, b: eyeB },
    chin: oval[FACE_OVAL.indexOf(152)],
  };
}

async function detectCustomFaceBoxes(bitmap) {
  try {
    await ensureDetectors();
  } catch {
    return [];
  }
  const detector = state.detectors.detector;
  if (!detector) return [];

  const scale = Math.min(1, DETECT_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  let result;
  try {
    result = detector.detect(canvas);
  } catch (error) {
    console.warn("LaserEyes: custom face detection failed", error);
    return [];
  }

  const invScale = 1 / scale;
  const candidates = [];
  for (const detection of result?.detections || []) {
    const box = detection.boundingBox;
    if (!box) continue;
    let { originX: x, originY: y, width: w, height: h } = box;
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) continue;
    // Some builds report a normalized box instead of pixels.
    if (w <= 1.5 && h <= 1.5) {
      x *= canvas.width;
      y *= canvas.height;
      w *= canvas.width;
      h *= canvas.height;
    }
    const scaled = { x: x * invScale, y: y * invScale, w: w * invScale, h: h * invScale };
    if (scaled.w < 24 || scaled.h < 24) continue;
    const score = detection.categories?.[0]?.score ?? 0.5;
    candidates.push({ box: scaled, score });
  }

  return mergeFaces(candidates).map((face) => face.box);
}

function drawCropPreview(bitmap) {
  const dialogWidth = dom.faceModal.querySelector(".face-dialog")?.getBoundingClientRect().width || 480;
  const maxWidth = Math.min(520, Math.max(220, Math.round(dialogWidth - 40)));
  const scale = Math.min(1, maxWidth / bitmap.width);
  dom.cropCanvas.width = Math.max(1, Math.round(bitmap.width * scale));
  dom.cropCanvas.height = Math.max(1, Math.round(bitmap.height * scale));
  dom.cropCanvas.getContext("2d").drawImage(bitmap, 0, 0, dom.cropCanvas.width, dom.cropCanvas.height);
  dom.cropBox.hidden = true;
  dom.faceUseBtn.hidden = true;
}

function openFaceModal(mode, bitmap, boxes, name) {
  facePick = { mode, bitmap, boxes, name, selection: null, start: null };
  dom.faceModal.hidden = false;
  dom.faceGrid.textContent = "";
  dom.faceGrid.hidden = mode !== "pick";
  dom.cropWrap.hidden = mode !== "crop";
  dom.faceUseBtn.hidden = true;
  dom.cropBox.hidden = true;

  if (mode === "pick") {
    dom.faceModalTitle.textContent = t("custom.pickTitle");
    dom.faceModalText.textContent = t("custom.pickHint");
    for (const [index, box] of boxes.entries()) {
      const square = squareAroundBox(box, bitmap.width, bitmap.height);
      const thumb = document.createElement("canvas");
      thumb.width = 128;
      thumb.height = 128;
      thumb.getContext("2d").drawImage(bitmap, square.x, square.y, square.w, square.h, 0, 0, 128, 128);

      const option = document.createElement("button");
      option.type = "button";
      option.className = "face-option";
      const image = document.createElement("img");
      image.src = thumb.toDataURL("image/jpeg", 0.85);
      image.alt = "";
      const num = document.createElement("span");
      num.className = "face-option-num";
      num.textContent = String(index + 1);
      option.append(image, num);
      option.addEventListener("click", async () => {
        if (!facePick) return;
        option.disabled = true;
        const analysis = await analyzeFace(bitmap, box);
        if (facePick) {
          if (analysis) {
            usePreciseFaceSticker(bitmap, analysis, name);
          } else {
            useSquareFace(bitmap, squareAroundBox(box, bitmap.width, bitmap.height), name);
          }
          closeFaceModal(true);
        }
        bitmap.close?.();
      });
      dom.faceGrid.append(option);
    }
  } else {
    dom.faceModalTitle.textContent = t("custom.noneTitle");
    dom.faceModalText.textContent = t("custom.noneHint");
    drawCropPreview(bitmap);
  }

  dom.faceCancelBtn.focus();
}

function closeFaceModal(keepBitmap) {
  dom.faceModal.hidden = true;
  dom.faceGrid.textContent = "";
  dom.cropBox.hidden = true;
  dom.faceUseBtn.hidden = true;
  const current = facePick;
  facePick = null;
  if (current && !keepBitmap) current.bitmap.close?.();
}

function facePointFromEvent(event) {
  const rect = dom.cropCanvas.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
  };
}

function updateCropSelection(selection) {
  if (!facePick) return;
  facePick.selection = selection;
  dom.cropBox.hidden = !selection;
  dom.faceUseBtn.hidden = !selection;
  if (!selection) return;
  dom.cropBox.style.left = `${selection.x * 100}%`;
  dom.cropBox.style.top = `${selection.y * 100}%`;
  dom.cropBox.style.width = `${selection.w * 100}%`;
  dom.cropBox.style.height = `${selection.h * 100}%`;
}

function startCrop(event) {
  if (!facePick || facePick.mode !== "crop") return;
  event.preventDefault();
  try {
    dom.cropCanvas.setPointerCapture?.(event.pointerId);
  } catch {}
  facePick.start = facePointFromEvent(event);
  updateCropSelection(null);
}

function moveCrop(event) {
  if (!facePick || facePick.mode !== "crop" || !facePick.start) return;
  event.preventDefault();
  const point = facePointFromEvent(event);
  const start = facePick.start;
  const dx = point.x - start.x;
  const dy = point.y - start.y;
  const size = Math.min(Math.max(Math.abs(dx), Math.abs(dy)), 1);
  const x = clamp(dx < 0 ? start.x - size : start.x, 0, 1 - size);
  const y = clamp(dy < 0 ? start.y - size : start.y, 0, 1 - size);
  updateCropSelection(size > 0.02 ? { x, y, w: size, h: size } : null);
}

function endCrop(event) {
  if (!facePick || facePick.mode !== "crop") return;
  if (event && facePick.start) moveCrop(event);
  facePick.start = null;
  if (facePick.selection && facePick.selection.w < 0.04) updateCropSelection(null);
}

function confirmCrop() {
  if (!facePick || facePick.mode !== "crop" || !facePick.selection) return;
  const { bitmap, selection, name } = facePick;
  useSquareFace(
    bitmap,
    {
      x: selection.x * bitmap.width,
      y: selection.y * bitmap.height,
      w: selection.w * bitmap.width,
      h: selection.h * bitmap.height,
    },
    name
  );
  closeFaceModal(true);
  bitmap.close?.();
}

async function loadCustomFaceFile(file) {
  if (!file) return;
  state.customBusy = true;
  updateBusy();
  try {
    const source = isHeic(file) ? await convertHeic(file) : file;
    const bitmap = await createBitmap(source);
    if (bitmap.width < 80 || bitmap.height < 80) {
      bitmap.close?.();
      toast(t("custom.failed"));
      return;
    }
    const boxes = await detectCustomFaceBoxes(bitmap);
    if (boxes.length === 1) {
      const analysis = await analyzeFace(bitmap, boxes[0]);
      if (analysis) usePreciseFaceSticker(bitmap, analysis, file.name);
      else useSquareFace(bitmap, squareAroundBox(boxes[0], bitmap.width, bitmap.height), file.name);
      bitmap.close?.();
      return;
    }
    openFaceModal(boxes.length ? "pick" : "crop", bitmap, boxes, file.name);
  } catch (error) {
    console.warn("LaserEyes: custom face failed", error);
    toast(t("custom.failed"));
  } finally {
    state.customBusy = false;
    updateBusy();
  }
}

/* ------------------------------------------------------------------ */
/* export                                                              */
/* ------------------------------------------------------------------ */

async function renderPhotoBlob(photo) {
  const bitmap = await ensureBitmap(photo);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  drawScene(ctx, photo, canvas.width, canvas.height, state.opts);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error("Export failed"))), "image/jpeg", 0.94);
  });
  if (photo.id !== state.activeId) releaseBitmap(photo);
  return blob;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function exportName(photo, extension = "jpg") {
  return `${baseName(photo.name)}-lasereyes.${extension}`;
}

async function downloadCurrent() {
  const photo = activePhoto();
  if (!photo) return;
  if (photo.status !== "ready") {
    toast(t("toast.stillLoading"));
    return;
  }

  setProgress(true, t("toast.processingPhoto"));
  try {
    const blob = await renderPhotoBlob(photo);
    downloadBlob(blob, exportName(photo));
    toast(t("toast.doneDownload"));
  } catch (error) {
    console.error(error);
    toast(t("toast.exportFailed"));
  } finally {
    setProgress(false);
  }
}

async function waitForQueue() {
  let guard = 0;
  while ((queue.length || queueRunning) && guard < 2400) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    guard += 1;
  }
}

async function downloadAll() {
  if (!state.photos.length) return;

  const count = state.photos.length;
  if (count > 25 && !window.confirm(t("confirm.manyPhotos", { n: count }))) {
    return;
  }

  setProgress(true, t("toast.progressPreparing"));
  try {
    await waitForQueue();

    const ready = state.photos.filter((photo) => photo.status === "ready");
    if (!ready.length) {
      toast(t("toast.nothingReady"));
      return;
    }

    const failed = ready.filter((photo) => photo.detectStatus === "failed");
    if (failed.length) {
      const proceed = window.confirm(
        t("confirm.failedDetection", { n: failed.length, photos: photoWord(failed.length) })
      );
      if (!proceed) {
        toast(t("toast.openFailed"));
        return;
      }
    }

    const JSZip = await ensureJSZip();
    const zip = new JSZip();
    const used = new Set();
    let index = 0;
    let skipped = 0;

    for (const photo of ready) {
      index += 1;
      setProgress(true, t("toast.processing", { i: index, n: ready.length }));
      try {
        const blob = await renderPhotoBlob(photo);
        let name = exportName(photo);
        let suffix = 2;
        while (used.has(name)) {
          name = `${baseName(photo.name)}-lasereyes-${suffix}.jpg`;
          suffix += 1;
        }
        used.add(name);
        zip.file(name, blob);
        await new Promise((resolve) => setTimeout(resolve, 0));
      } catch (error) {
        console.warn("LaserEyes: photo export failed", photo.name, error);
        skipped += 1;
      }
    }

    if (!used.size) {
      toast(t("toast.noExport"));
      return;
    }

    setProgress(true, t("toast.zipping"));
    const output = await zip.generateAsync({ type: "blob" });
    downloadBlob(output, `lasereyes-${new Date().toISOString().slice(0, 10)}.zip`);

    const noFaces = ready.filter((photo) => photo.detectStatus === "done" && photo.faces.length === 0).length;
    if (skipped) {
      toast(t("toast.doneSkipped", { n: skipped, photos: photoWord(skipped) }));
    } else if (noFaces) {
      toast(t("toast.doneNoFaces", { n: used.size, photos: photoWord(used.size), m: noFaces }));
    } else {
      toast(t("toast.doneZip", { n: used.size, photos: photoWord(used.size) }));
    }
  } catch (error) {
    console.error(error);
    toast(t("toast.batchFailed"));
  } finally {
    setProgress(false);
  }
}

/* ------------------------------------------------------------------ */
/* retry detection                                                     */
/* ------------------------------------------------------------------ */

async function retryDetection() {
  resetDetector();
  resetLandmarker();
  try {
    setEngine("loading");
    await ensureDetectors(true);
  } catch {
    toast(detectionEnvironmentHint());
    return;
  }

  const failed = state.photos.filter((photo) => photo.status === "ready" && photo.detectStatus === "failed");
  if (!failed.length) {
    toast(t("toast.detectionReady"));
    return;
  }

  for (const photo of failed) {
    history.delete(photo.id);
    await runDetection(photo);
    await nextTick();
  }
}

async function retryPhoto(photo) {
  if (photo.status !== "ready" || photo.detectStatus === "running") return;
  history.delete(photo.id);
  if (!state.detectors.ready) {
    resetDetector();
    resetLandmarker();
    try {
      setEngine("loading");
      await ensureDetectors(true);
    } catch {
      toast(detectionEnvironmentHint());
      return;
    }
  }
  await runDetection(photo);
}

/* ------------------------------------------------------------------ */
/* controls                                                            */
/* ------------------------------------------------------------------ */

function syncControls() {
  dom.laserRange.value = String(state.opts.laser);
  dom.glowRange.value = String(state.opts.glow);
  dom.blurRange.value = String(state.opts.blur);
  dom.coverRange.value = String(state.opts.cover);
  dom.coverSelect.value = state.coverType;
  dom.laserOut.textContent = `${Math.round(state.opts.laser * 100)}%`;
  dom.glowOut.textContent = `${Math.round(state.opts.glow * 100)}%`;
  dom.blurOut.textContent = `${Math.round(state.opts.blur * 100)}%`;
  dom.coverOut.textContent = `${Math.round(state.opts.cover * 100)}%`;

  for (const button of dom.modeGroup.querySelectorAll(".seg-btn")) {
    button.classList.toggle("is-active", button.dataset.mode === state.mode);
  }
  dom.markersBtn.classList.toggle("is-active", state.showMarkers);
  for (const button of dom.laserColors.querySelectorAll("[data-color]")) {
    button.classList.toggle("is-active", button.dataset.color === state.laserColor);
  }
  dom.laserColorInput.value = state.laserCustom;
  dom.laserCustomSwatch.style.setProperty("--swatch", state.laserCustom);
  dom.laserCustomSwatch.classList.toggle("is-active", state.laserColor === "custom");
  syncCustomFaceUI();
  updateAddButton();
}

function saveOpts() {
  try {
    localStorage.setItem(
      "lasereyes.opts",
      JSON.stringify({
        ...state.opts,
        coverType: state.coverType,
        laserColor: state.laserColor,
        laserCustom: state.laserCustom,
      })
    );
  } catch {}
}

function updateLangButtons() {
  const current = getLang();
  for (const button of dom.langSwitch.querySelectorAll(".lang-btn")) {
    const active = button.dataset.lang === current;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }
}

function applyLanguage() {
  document.documentElement.lang = getLang();
  document.title = t("meta.title");
  if (!dom.faceModal.hidden) closeFaceModal(false);
  applyStatic();
  updateLangButtons();

  if (!supportsCanvasFilter()) {
    const option = dom.coverSelect.querySelector('option[value="blur"]');
    if (option) option.textContent = t("cover.blurUnsupported");
  }
  syncCustomFaceUI();

  if (dom.engineStatus.dataset.state) setEngine(dom.engineStatus.dataset.state);
  updateChrome();
  renderLibrary();

  const photo = activePhoto();
  if (!photo) {
    setHint(defaultHint());
    updateZoomUI();
    return;
  }

  if (state.adding) {
    setHint(state.addPoints.length ? t("hint.clickRight") : t("hint.clickLeft"), true);
  } else {
    setHint(defaultHint());
  }
  updateZoomUI();
  renderActive();
}

function syncSettingsLayout() {
  if (!document.body.classList.contains("settings-open")) return;
  const height = dom.settingsPanel?.offsetHeight || 0;
  document.body.style.setProperty("--settings-h", `${height}px`);
  // Reserve the sheet height and refit the photo above it, still sharp.
  renderCanvas();
}

function openSettings() {
  document.body.classList.add("settings-open");
  dom.settingsFab.setAttribute("aria-expanded", "true");
  dom.settingsCloseBtn.focus({ preventScroll: true });
  syncSettingsLayout();
}

function closeSettings() {
  if (!document.body.classList.contains("settings-open")) return;
  document.body.classList.remove("settings-open");
  document.body.style.removeProperty("--settings-h");
  dom.settingsFab.setAttribute("aria-expanded", "false");
  renderCanvas();
}

function openPhotoSheet() {
  if (!state.photos.length || !dom.photoSheet) return;
  dom.photoSheet.hidden = false;
  dom.mobilePhotosBtn.setAttribute("aria-expanded", "true");
  dom.photoSheetClose.focus({ preventScroll: true });
}

function closePhotoSheet() {
  if (!dom.photoSheet || dom.photoSheet.hidden) return;
  dom.photoSheet.hidden = true;
  dom.mobilePhotosBtn.setAttribute("aria-expanded", "false");
}

function handleLibraryClick(event) {
  const item = event.target.closest(".photo-item");
  if (!item) return;
  const photo = state.photos.find((candidate) => candidate.id === item.dataset.id);
  if (!photo) return;
  if (event.target.closest(".remove")) {
    event.stopPropagation();
    removePhoto(photo);
    if (!state.photos.length) closePhotoSheet();
    return;
  }
  selectPhoto(photo.id);
  closePhotoSheet();
}

function bindEvents() {
  dom.dropzone.addEventListener("click", () => dom.fileInput.click());
  dom.dropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      dom.fileInput.click();
    }
  });
  dom.emptyPickBtn.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      dom.fileInput.click();
    }
  });

  dom.fileInput.addEventListener("change", () => {
    if (dom.fileInput.files?.length) addFiles(dom.fileInput.files);
    dom.fileInput.value = "";
    closePhotoSheet();
  });

  dom.mobilePhotosBtn.addEventListener("click", openPhotoSheet);
  dom.photoSheetClose.addEventListener("click", closePhotoSheet);
  dom.photoSheetBackdrop.addEventListener("click", closePhotoSheet);

  dom.settingsFab.addEventListener("click", openSettings);
  dom.settingsCloseBtn.addEventListener("click", closeSettings);
  dom.settingsBackdrop.addEventListener("click", closeSettings);

  const hasFiles = (event) => [...(event.dataTransfer?.types || [])].includes("Files");

  window.addEventListener("dragenter", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dom.dropzone.classList.add("is-over");
    if (!state.photos.length) dom.emptyState.classList.add("is-over");
  });
  window.addEventListener("dragover", (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });
  window.addEventListener("dragleave", (event) => {
    if (event.relatedTarget) return;
    dom.dropzone.classList.remove("is-over");
    dom.emptyState.classList.remove("is-over");
  });
  window.addEventListener("drop", (event) => {
    event.preventDefault();
    dom.dropzone.classList.remove("is-over");
    dom.emptyState.classList.remove("is-over");
    if (event.dataTransfer?.files?.length) addFiles(event.dataTransfer.files);
  });

  dom.photoList.addEventListener("click", handleLibraryClick);
  dom.photoSheetList.addEventListener("click", handleLibraryClick);

  dom.modeGroup.addEventListener("click", (event) => {
    const button = event.target.closest(".seg-btn");
    if (!button) return;
    const mode = button.dataset.mode;
    state.mode = ["lasers", "both", "cover"].includes(mode) ? mode : "lasers";
    syncControls();
    setHint(defaultHint());
    renderActive();
  });

  dom.markersBtn.addEventListener("click", () => {
    state.showMarkers = !state.showMarkers;
    syncControls();
    renderActive();
  });

  dom.addFaceBtn.addEventListener("click", () => {
    if (!activePhoto()) return;
    setAdding(!state.adding);
  });

  dom.downloadBtn.addEventListener("click", downloadCurrent);
  dom.downloadAllBtn.addEventListener("click", downloadAll);
  dom.resetPositionsBtn.addEventListener("click", resetPositions);
  dom.resetAllBtn.addEventListener("click", resetEverything);
  dom.undoBtn.addEventListener("click", undo);
  dom.redoBtn.addEventListener("click", redo);

  dom.laserColors.addEventListener("click", (event) => {
    const button = event.target.closest("[data-color]");
    if (!button) return;
    state.laserColor = button.dataset.color;
    syncControls();
    saveOpts();
    renderCanvas();
  });

  let colorTimer = null;
  dom.laserColorInput.addEventListener("input", () => {
    state.laserColor = "custom";
    state.laserCustom = dom.laserColorInput.value;
    syncControls();
    clearTimeout(colorTimer);
    colorTimer = setTimeout(() => {
      saveOpts();
      renderCanvas();
    }, 90);
  });
  dom.laserColorInput.addEventListener("change", () => {
    state.laserColor = "custom";
    state.laserCustom = dom.laserColorInput.value;
    syncControls();
    saveOpts();
    renderCanvas();
  });

  dom.canvas.addEventListener("pointerdown", handleCanvasClick);

  dom.engineStatus.addEventListener("click", () => {
    if (state.detectors.error) retryDetection();
  });

  dom.laserRange.addEventListener("input", () => {
    state.opts.laser = Number(dom.laserRange.value);
    dom.laserOut.textContent = `${Math.round(state.opts.laser * 100)}%`;
    scheduleCanvas();
  });
  dom.glowRange.addEventListener("input", () => {
    state.opts.glow = Number(dom.glowRange.value);
    dom.glowOut.textContent = `${Math.round(state.opts.glow * 100)}%`;
    scheduleCanvas();
  });
  dom.blurRange.addEventListener("input", () => {
    state.opts.blur = Number(dom.blurRange.value);
    dom.blurOut.textContent = `${Math.round(state.opts.blur * 100)}%`;
    scheduleCanvas();
  });
  dom.coverRange.addEventListener("input", () => {
    state.opts.cover = Number(dom.coverRange.value);
    dom.coverOut.textContent = `${Math.round(state.opts.cover * 100)}%`;
    scheduleRender();
  });
  dom.coverSelect.addEventListener("change", () => {
    const value = dom.coverSelect.value;
    if (value === "custom") {
      if (state.customFace) {
        state.customPending = false;
        state.coverType = "custom";
        syncCustomFaceUI();
        saveOpts();
        renderActive();
      } else {
        // Do not open the file picker from a change event: iOS in-app browsers
        // block that. Show the upload control and let the user tap it instead.
        state.customPending = true;
        dom.coverSelect.value = state.coverType;
        syncCustomFaceUI();
        toast(t("custom.pickPrompt"));
        const row = dom.customFaceBtn.closest(".settings");
        if (row) row.scrollLeft = Math.max(0, dom.customFaceBtn.offsetLeft - 12);
      }
      return;
    }
    state.customPending = false;
    state.coverType = ["pixel", "solid"].includes(value) ? value : "blur";
    syncCustomFaceUI();
    saveOpts();
    renderActive();
  });

  // The control is a label for #faceInput, so a real tap opens the native
  // picker even in iOS in-app browsers. Keep keyboard support for desktop.
  dom.customFaceBtn.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      dom.faceInput.click();
    }
  });
  dom.faceInput.addEventListener("change", () => {
    const file = dom.faceInput.files?.[0];
    dom.faceInput.value = "";
    if (file) loadCustomFaceFile(file);
  });

  dom.faceCancelBtn.addEventListener("click", () => closeFaceModal(false));
  dom.faceUseBtn.addEventListener("click", confirmCrop);
  dom.faceModal.addEventListener("pointerdown", (event) => {
    if (event.target === dom.faceModal) closeFaceModal(false);
  });
  dom.cropCanvas.addEventListener("pointerdown", startCrop);
  dom.cropCanvas.addEventListener("pointermove", moveCrop);
  dom.cropCanvas.addEventListener("pointerup", endCrop);
  dom.cropCanvas.addEventListener("pointercancel", () => {
    if (facePick) facePick.start = null;
  });

  dom.zoomChip.addEventListener("click", () => setZoom(1));

  // Desktop: wheel zoom around the pointer.
  dom.canvasScroll.addEventListener(
    "wheel",
    (event) => {
      if (!activePhoto()) return;
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.0015);
      setZoom(state.zoom * factor, { clientX: event.clientX, clientY: event.clientY });
    },
    { passive: false }
  );

  // Touch: two fingers pinch, double tap toggles the zoom, one finger pans natively.
  let pinch = null;
  dom.canvasScroll.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length !== 2 || !activePhoto()) return;
      const [first, second] = event.touches;
      pinch = {
        distance: Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY) || 1,
        zoom: state.zoom,
      };
      event.preventDefault();
    },
    { passive: false }
  );
  dom.canvasScroll.addEventListener(
    "touchmove",
    (event) => {
      if (!pinch) return;
      if (event.touches.length < 2) {
        pinch = null;
        return;
      }
      const [first, second] = event.touches;
      const distance = Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
      if (!distance) return;
      event.preventDefault();
      setZoom(pinch.zoom * (distance / pinch.distance), {
        clientX: (first.clientX + second.clientX) / 2,
        clientY: (first.clientY + second.clientY) / 2,
      });
    },
    { passive: false }
  );
  const endPinch = () => {
    pinch = null;
  };
  dom.canvasScroll.addEventListener("touchend", endPinch);
  dom.canvasScroll.addEventListener("touchcancel", endPinch);

  let lastTap = 0;
  let lastTapX = 0;
  let lastTapY = 0;
  dom.canvas.addEventListener("pointerup", (event) => {
    if (event.pointerType === "mouse" || state.adding) return;
    const now = Date.now();
    const near = Math.hypot(event.clientX - lastTapX, event.clientY - lastTapY) < 36;
    if (now - lastTap < 320 && near) {
      lastTap = 0;
      setZoom(state.zoom > 1.05 ? 1 : 2.5, { clientX: event.clientX, clientY: event.clientY });
    } else {
      lastTap = now;
      lastTapX = event.clientX;
      lastTapY = event.clientY;
    }
  });
  dom.canvas.addEventListener("dblclick", (event) => {
    setZoom(state.zoom > 1.05 ? 1 : 2.2, { clientX: event.clientX, clientY: event.clientY });
  });

  let pan = null;
  dom.canvasScroll.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse") return;
    if (event.button !== 0) return;
    if (state.zoom <= 1.001 || state.adding) return;
    if (event.target.closest(".marker")) return;
    pan = {
      x: event.clientX,
      y: event.clientY,
      left: dom.canvasScroll.scrollLeft,
      top: dom.canvasScroll.scrollTop,
    };
    dom.canvasScroll.classList.add("is-panning");
    try {
      dom.canvasScroll.setPointerCapture?.(event.pointerId);
    } catch {}
    event.preventDefault();
  });
  dom.canvasScroll.addEventListener("pointermove", (event) => {
    if (!pan) return;
    dom.canvasScroll.scrollLeft = pan.left - (event.clientX - pan.x);
    dom.canvasScroll.scrollTop = pan.top - (event.clientY - pan.y);
  });
  const endPan = () => {
    pan = null;
    dom.canvasScroll.classList.remove("is-panning");
  };
  dom.canvasScroll.addEventListener("pointerup", endPan);
  dom.canvasScroll.addEventListener("pointercancel", endPan);
  for (const input of [dom.laserRange, dom.glowRange, dom.blurRange, dom.coverRange]) {
    input.addEventListener("change", saveOpts);
  }

  dom.resetBtn.addEventListener("click", () => {
    state.opts = { ...DEFAULT_OPTS };
    state.laserColor = "original";
    state.laserCustom = LASER_PRESETS.original;
    syncControls();
    saveOpts();
    renderActive();
  });

  dom.langSwitch.addEventListener("click", (event) => {
    const button = event.target.closest(".lang-btn");
    if (!button) return;
    setLang(button.dataset.lang);
    applyLanguage();
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const typing =
      target instanceof Element &&
      target.closest("input, textarea, select, [contenteditable='true']");
    if (!typing && (event.ctrlKey || event.metaKey)) {
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }
      if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        redo();
        return;
      }
    }
    if (event.key !== "Escape") return;
    if (!dom.faceModal.hidden) {
      closeFaceModal(false);
      return;
    }
    if (!dom.photoSheet.hidden) {
      closePhotoSheet();
      return;
    }
    if (document.body.classList.contains("settings-open")) {
      closeSettings();
      return;
    }
    if (state.adding) setAdding(false);
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 800) {
      closeSettings();
      scheduleCanvas();
      return;
    }
    if (document.body.classList.contains("settings-open")) syncSettingsLayout();
    else scheduleCanvas();
  });
}

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */

function init() {
  bindEvents();

  if (!supportsCanvasFilter()) {
    state.coverType = "pixel";
    const option = dom.coverSelect.querySelector('option[value="blur"]');
    if (option) option.disabled = true;
  }

  syncControls();
  updateZoomUI();
  applyLanguage();

  // Load the model in the background so the first photo is ready.
  setTimeout(() => {
    ensureDetectors()
      .then(() => {
        // Load the eye model in the background to speed up the first photo.
        ensureLandmarker().catch(() => {});
      })
      .catch(() => {
        const hint = detectionEnvironmentHint();
        setHint(`${hint}${t("init.addManually")}`, true);
        toast(hint);
      });
  }, 700);

  // Small debug API for testing and integration.
  window.LaserEyes = {
    addFiles,
    addFromUrl: async (url, name = "photo.jpg") => {
      const response = await fetch(url);
      const blob = await response.blob();
      addFiles([new File([blob], name, { type: blob.type || "image/jpeg" })]);
    },
    customFaceFromUrl: async (url, name = "face.jpg") => {
      const response = await fetch(url);
      const blob = await response.blob();
      await loadCustomFaceFile(new File([blob], name, { type: blob.type || "image/jpeg" }));
    },
    state,
    render: renderActive,
    draw: renderCanvas,
    zoom: setZoom,
    busy: updateBusy,
    undo,
    redo,
    resetEverything,
  };
}

init();
