/*
 * LaserEyes - tiny translation layer.
 * English is the source language, Czech is a full translation.
 * The UI language is stored in localStorage; the first visit follows the browser.
 */

const STORAGE_KEY = "lasereyes.lang";

const STRINGS = {
  en: {
    "meta.title": "LaserEyes - laser eyes for photos",
    "brand.tagline": "laser eyes and face cover",
    "lang.aria": "Language",

    "topbar.downloadAll": "Download all",
    "engine.label": "Face detection",
    "engine.loading": "loading model...",
    "engine.ready": "detection ready",
    "engine.error": "detection unavailable - try again",
    "engine.retryTitle": "Click to try loading the model again",

    "detect.noWasm": "This browser blocks WebAssembly, so face detection cannot run.",
    "detect.noWebgl": "This browser blocks WebGL, so face detection cannot run.",
    "detect.loadFailed": "Could not load face detection. Check that the server is running.",

    "dropzone.add": "Add photos",
    "dropzone.hint": "or drop them anywhere",
    "dropzone.aria": "Add photos",
    "library.title": "Photos",
    "privacy.note": "Photos stay in your browser. Nothing is uploaded.",

    "oss.title": "LaserEyes on GitHub",
    "oss.strong": "Open source",
    "oss.small": "View on GitHub",

    "empty.title": "Drop photos here",
    "empty.text": "Faces are found automatically, and the lasers land on the eyes. Tap anyone you want to change. Cover is optional.",
    "empty.button": "Choose photos",
    "empty.note": "JPG, PNG, WebP, HEIC. Batch friendly.",

    "mode.aria": "Cover mode",
    "mode.lasers": "Lasers only",
    "mode.both": "Lasers + cover",
    "mode.cover": "Cover only",

    "cover.label": "Cover",
    "cover.aria": "Face cover type",
    "cover.blur": "Blur",
    "cover.pixel": "Pixelate",
    "cover.solid": "Solid mask",
    "cover.custom": "Custom face",
    "cover.blurUnsupported": "Blur (not supported)",

    "custom.choose": "Choose face photo",
    "custom.change": "Change face",
    "custom.pickTitle": "Which face should be the mask?",
    "custom.pickHint": "Tap the face you want to use.",
    "custom.noneTitle": "No face found",
    "custom.noneHint": "Drag a square around the face you want to use.",
    "custom.useSelection": "Use selection",
    "custom.cancel": "Cancel",
    "custom.failed": "Could not read that image.",
    "custom.lowRes": "That face photo is small, the mask may look blurry in exports.",

    "action.addFace": "Add face",
    "action.markers": "Markers",
    "action.markersTitle": "Show or hide markers",
    "action.resetPositions": "Reset positions",
    "action.resetPositionsTitle": "Put all markers back where detection found them",
    "action.download": "Download",
    "action.zoomReset": "Reset zoom",
    "action.reset": "Reset",

    "canvas.loading": "Loading photo...",

    "hint.lasers": "Click a face to turn the lasers on or off. Drag to move it, right-click or hold to delete it.",
    "hint.cover": "Click a face to cover or reveal it. Drag to move it, right-click or hold to delete it.",
    "hint.noDetection": "Face detection is unavailable. Add faces manually with + Add face.",

    "settings.core": "Laser core",
    "settings.glow": "Laser glow",
    "settings.color": "Laser color",
    "settings.colorOriginal": "Original",
    "settings.colorRed": "Red",
    "settings.colorYellow": "Yellow",
    "settings.colorCustom": "Custom color",
    "settings.coverSize": "Cover size",
    "settings.coverStrength": "Cover strength",
    "settings.coreTitle": "Size of the bright core, the eyes themselves",
    "settings.glowTitle": "Size and strength of the halo, rays and side glow",
    "settings.coverSizeTitle": "How much of the face and its surroundings is covered",
    "settings.strengthTitle": "Blur radius or pixel block size",

    "photo.loading": "loading...",
    "photo.couldNotLoad": "could not load",
    "photo.detecting": "detecting faces...",
    "photo.detectionFailed": "detection failed",
    "photo.noFaces": "no faces",
    "photo.waiting": "waiting...",
    "photo.removeTitle": "Remove photo",
    "photo.removeAria": "Remove {name}",

    "label.withLasers": "with lasers",
    "label.covered": "covered",
    "label.withoutLasers": "without lasers",
    "label.uncovered": "uncovered",

    "downloadAll.titleReady": "Download all photos as a ZIP",
    "downloadAll.titleEmpty": "Add photos first",

    "files.choose": "Please choose images (JPG, PNG, WebP, HEIC...).",
    "files.added": "Added {n} {photos}. Detection is running in the background.",
    "toast.heic": "Converting HEIC from iPhone...",
    "toast.couldNotLoadThis": "Could not load this photo.",
    "toast.couldNotLoadPhoto": "Could not load the photo.",
    "toast.couldNotLoadNamed": "Could not load \"{name}\".",

    "marker.covered": "Face {n}: covered. Click to reveal it. Right-click or hold to delete it.",
    "marker.visible": "Face {n}: visible. Click to cover it. Right-click or hold to delete it.",
    "toast.markerDeleted": "Marker deleted.",
    "misc.undo": "Undo",

    "hint.clickLeft": "Tap the left eye, then the right eye. Esc cancels.",
    "hint.clickRight": "Now tap the second eye. Esc cancels.",
    "hint.secondEyeFar": "Tap the second eye farther from the first.",
    "hint.tryAgainManually": " Try again, or add faces manually.",
    "hint.zoomTouch": "Pinch or double-tap to zoom.",
    "toast.faceAdded": "Face added.",

    "summary.detecting": "detecting faces...",
    "summary.detectionFailed": "detection failed",
    "summary.noFaces": "no faces",
    "summary.retry": "Try again",
    "summary.count": "{covered} of {total} {label}",
    "summary.countWarn": "{covered} of {total} {label} - {n} {missing}",
    "summary.allLasers": "Lasers for all",
    "summary.allCover": "Cover all",

    "toast.stillLoading": "The photo is still loading. Try again in a moment.",
    "toast.processingPhoto": "Processing photo...",
    "toast.doneDownload": "Done. The photo is in your Downloads.",
    "toast.exportFailed": "Export failed. Try again.",

    "confirm.manyPhotos": "You are downloading {n} photos at once. This may take a while and the ZIP will be large. Continue?",
    "toast.nothingReady": "No photo is ready to download.",
    "confirm.failedDetection": "Face detection failed on {n} {photos}, so some people may not be covered. Download anyway?",
    "toast.openFailed": "Open the photos with failed detection and mark the faces manually.",
    "toast.processing": "Processing {i}/{n}...",
    "toast.noExport": "No photos were exported.",
    "toast.zipping": "Creating ZIP...",
    "toast.doneSkipped": "Done. {n} {photos} could not be exported.",
    "toast.doneNoFaces": "Done, {n} {photos} in the ZIP. No faces were found in {m}; check those.",
    "toast.doneZip": "Done, {n} {photos} in the ZIP.",
    "toast.batchFailed": "Batch export failed. Try again.",
    "toast.detectionReady": "Detection is ready.",
    "toast.positionsReset": "Marker positions reset.",
    "toast.noPositions": "Nothing to reset.",
    "toast.progressPreparing": "Preparing photos...",

    "init.addManually": " You can add faces manually.",

    "word.photo": "photo",
    "word.photos": "photos",
  },

  cs: {
    "meta.title": "LaserEyes - laser eyes na fotky",
    "brand.tagline": "lasery do očí a krytí obličejů",
    "lang.aria": "Jazyk",

    "topbar.downloadAll": "Stáhnout vše",
    "engine.label": "Detekce obličejů",
    "engine.loading": "načítám model…",
    "engine.ready": "detekce připravena",
    "engine.error": "detekce nedostupná – zkusit znovu",
    "engine.retryTitle": "Klikni pro nový pokus o načtení modelu",

    "detect.noWasm": "Prohlížeč blokuje WebAssembly, detekce nemůže běžet.",
    "detect.noWebgl": "Prohlížeč blokuje WebGL, detekce nemůže běžet.",
    "detect.loadFailed": "Detekci se nepodařilo načíst. Zkontroluj, že běží server.",

    "dropzone.add": "Přidat fotky",
    "dropzone.hint": "nebo je sem přetáhni",
    "dropzone.aria": "Přidat fotky",
    "library.title": "Fotky",
    "privacy.note": "Fotky zůstávají v prohlížeči. Nikam se nenahrávají.",

    "oss.title": "LaserEyes na GitHubu",
    "oss.strong": "Open source",
    "oss.small": "Zobrazit na GitHubu",

    "empty.title": "Přetáhni sem fotky",
    "empty.text": "Obličeje najdeme automaticky a lasery sednou na oči. Klikni na kohokoli, koho chceš změnit. Krytí je volitelné.",
    "empty.button": "Vybrat fotky",
    "empty.note": "JPG, PNG, WebP, HEIC. Klidně i dávkově.",

    "mode.aria": "Režim krytí",
    "mode.lasers": "Jen lasery",
    "mode.both": "Lasery + krytí",
    "mode.cover": "Jen krytí",

    "cover.label": "Krytí",
    "cover.aria": "Typ krytí obličeje",
    "cover.blur": "Rozostření",
    "cover.pixel": "Pixelace",
    "cover.solid": "Plná maska",
    "cover.custom": "Vlastní obličej",
    "cover.blurUnsupported": "Rozostření (nepodporováno)",

    "custom.choose": "Vybrat fotku obličeje",
    "custom.change": "Změnit obličej",
    "custom.pickTitle": "Který obličej má být maska?",
    "custom.pickHint": "Klikni na obličej, který chceš použít.",
    "custom.noneTitle": "Žádný obličej nenalezen",
    "custom.noneHint": "Tažením označ čtverec kolem obličeje, který chceš použít.",
    "custom.useSelection": "Použít výběr",
    "custom.cancel": "Zrušit",
    "custom.failed": "Obrázek se nepodařilo načíst.",
    "custom.lowRes": "Fotka obličeje je malá, maska může být při exportu rozmazaná.",

    "action.addFace": "Přidat obličej",
    "action.markers": "Značky",
    "action.markersTitle": "Zobrazit nebo skrýt značky",
    "action.resetPositions": "Reset pozic",
    "action.resetPositionsTitle": "Vrátí všechny značky tam, kde je našla detekce",
    "action.download": "Stáhnout",
    "action.zoomReset": "Zrušit přiblížení",
    "action.reset": "Výchozí",

    "canvas.loading": "Načítám fotku…",

    "hint.lasers": "Klikni na obličej pro zapnutí nebo vypnutí laserů. Tažením značku posuneš, pravým tlačítkem nebo podržením smažeš.",
    "hint.cover": "Klikni na obličej pro zakrytí nebo odhalení. Tažením značku posuneš, pravým tlačítkem nebo podržením smažeš.",
    "hint.noDetection": "Detekce není dostupná. Přidej obličeje ručně tlačítkem + Přidat obličej.",

    "settings.core": "Jádro laseru",
    "settings.glow": "Záře laseru",
    "settings.color": "Barva laseru",
    "settings.colorOriginal": "Původní",
    "settings.colorRed": "Červená",
    "settings.colorYellow": "Žlutá",
    "settings.colorCustom": "Vlastní barva",
    "settings.coverSize": "Velikost krytí",
    "settings.coverStrength": "Síla krytí",
    "settings.coreTitle": "Velikost jasného jádra, tedy samotných očí",
    "settings.glowTitle": "Velikost a síla halo efektu, paprsků a boční záře",
    "settings.coverSizeTitle": "Jak velká část obličeje a okolí se zakryje",
    "settings.strengthTitle": "Poloměr rozostření nebo velikost pixelů",

    "photo.loading": "načítám…",
    "photo.couldNotLoad": "nepodařilo se načíst",
    "photo.detecting": "hledám obličeje…",
    "photo.detectionFailed": "detekce selhala",
    "photo.noFaces": "bez obličejů",
    "photo.waiting": "čeká…",
    "photo.removeTitle": "Odebrat fotku",
    "photo.removeAria": "Odebrat {name}",

    "label.withLasers": "s lasery",
    "label.covered": "zakryté",
    "label.withoutLasers": "bez laserů",
    "label.uncovered": "nezakryté",

    "downloadAll.titleReady": "Stáhnout všechny fotky jako ZIP",
    "downloadAll.titleEmpty": "Nejdřív přidej fotky",

    "files.choose": "Vyber prosím obrázky (JPG, PNG, WebP, HEIC…).",
    "files.added": "Přidáno do seznamu: {n}. Detekce běží na pozadí.",
    "toast.heic": "Konvertuji HEIC z iPhonu…",
    "toast.couldNotLoadThis": "Tuhle fotku se nepodařilo načíst.",
    "toast.couldNotLoadPhoto": "Fotku se nepodařilo načíst.",
    "toast.couldNotLoadNamed": "„{name}“ se nepodařilo načíst.",

    "marker.covered": "Obličej {n}: zakrytý. Kliknutím odhalíš, pravým tlačítkem nebo podržením smažeš.",
    "marker.visible": "Obličej {n}: viditelný. Kliknutím zakryješ, pravým tlačítkem nebo podržením smažeš.",
    "toast.markerDeleted": "Značka smazána.",
    "misc.undo": "Vrátit",

    "hint.clickLeft": "Klikni na levé oko, potom na pravé. Esc režim zruší.",
    "hint.clickRight": "Teď klikni na druhé oko. Esc režim zruší.",
    "hint.secondEyeFar": "Klikni na druhé oko dál od prvního.",
    "hint.tryAgainManually": " Zkus to znovu, nebo přidej obličeje ručně.",
    "hint.zoomTouch": "Přibližuj dvěma prsty nebo dvojklikem.",
    "toast.faceAdded": "Obličej přidán.",

    "summary.detecting": "hledám obličeje…",
    "summary.detectionFailed": "detekce selhala",
    "summary.noFaces": "žádné obličeje",
    "summary.retry": "Zkusit znovu",
    "summary.count": "{covered} z {total} {label}",
    "summary.countWarn": "{covered} z {total} {label} – {n} {missing}",
    "summary.allLasers": "Lasery všem",
    "summary.allCover": "Zakrýt vše",

    "toast.stillLoading": "Fotka se ještě načítá, zkus to za chvíli.",
    "toast.processingPhoto": "Upravuji fotku…",
    "toast.doneDownload": "Hotovo, fotka je ve Stažených.",
    "toast.exportFailed": "Export se nepodařil. Zkus to znovu.",

    "confirm.manyPhotos": "Stahuješ {n} fotek najednou. Může to chvíli trvat a ZIP bude velký. Pokračovat?",
    "toast.nothingReady": "Žádná fotka není připravená ke stažení.",
    "confirm.failedDetection": "Detekce obličeje selhala (počet: {n}), takže někteří lidé nemusí být zakrytí. Přesto stáhnout?",
    "toast.openFailed": "Fotky s neúspěšnou detekcí otevři a označ obličeje ručně.",
    "toast.processing": "Upravuji {i}/{n}…",
    "toast.noExport": "Nepodařilo se vyexportovat žádnou fotku.",
    "toast.zipping": "Balím ZIP…",
    "toast.doneSkipped": "Hotovo. Nepodařilo se vyexportovat: {n}.",
    "toast.doneNoFaces": "Hotovo, v ZIPu: {n}. Bez nalezených obličejů: {m}. Mrkni na ně.",
    "toast.doneZip": "Hotovo, v ZIPu: {n}.",
    "toast.batchFailed": "Dávkový export se nepodařil. Zkus to znovu.",
    "toast.detectionReady": "Detekce je připravená.",
    "toast.positionsReset": "Pozice značek obnoveny.",
    "toast.noPositions": "Není co resetovat.",
    "toast.progressPreparing": "Připravuji fotky…",

    "init.addManually": " Obličeje můžeš označit ručně.",

    "word.photo": "fotka",
    "word.photos": "fotek",
  },
};

export const LANGS = ["en", "cs"];

function normalize(value) {
  return LANGS.includes(value) ? value : null;
}

function detectLang() {
  try {
    const stored = normalize(localStorage.getItem(STORAGE_KEY));
    if (stored) return stored;
  } catch {}

  const list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "en"];
  for (const tag of list) {
    const code = String(tag).toLowerCase().split("-")[0];
    if (code === "cs" || code === "sk") return "cs";
    if (code === "en") return "en";
  }
  return "en";
}

let lang = detectLang();

export function getLang() {
  return lang;
}

export function setLang(next) {
  const value = normalize(next);
  if (!value) return lang;
  lang = value;
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {}
  return lang;
}

export function t(key, vars) {
  const table = STRINGS[lang] || STRINGS.en;
  let text = table[key] ?? STRINGS.en[key] ?? key;
  if (vars) {
    text = text.replace(/\{(\w+)\}/g, (match, name) =>
      vars[name] === undefined || vars[name] === null ? match : String(vars[name])
    );
  }
  return text;
}

/** Translate everything marked with data-i18n* in the document. */
export function applyStatic(root = document) {
  for (const node of root.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of root.querySelectorAll("[data-i18n-title]")) {
    node.title = t(node.dataset.i18nTitle);
  }
  for (const node of root.querySelectorAll("[data-i18n-aria]")) {
    node.setAttribute("aria-label", t(node.dataset.i18nAria));
  }
}
