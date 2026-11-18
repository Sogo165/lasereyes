# LaserEyes

A browser tool for adding laser eyes to photos, with optional face covering for privacy. It was made for event photos where some people should not be recognizable.

Face detection runs locally. Photos are never uploaded, and there is no backend, account, or API key. The page makes no third-party requests at all: the MediaPipe runtime, models, JSZip, and heic2any are all served from this site.

Live demo: https://sogo165.github.io/lasereyes/
Source: https://github.com/Sogo165/lasereyes

## Features

- Face detection with bundled MediaPipe models
- Laser eyes with a lens flare look: bright core, rays, and a soft side glow
- Laser colours: original warm orange, pure red, yellow, or any custom colour
- Drag markers to fine-tune them, or reset all positions with one click
- Optional cover: Gaussian blur, pixelation, a solid mask, or your own face photo
- Toggle effects per face, or add a face manually
- Batch export as JPEG files in a ZIP
- HEIC support (converted in the browser)
- Zoom and pan with mouse, trackpad, or touch (pinch and double-tap)
- English and Czech interface; the first visit follows the browser language
- Settings and language are remembered in the browser

The interface and documentation are in English and Czech. The code and comments are in English.

## Requirements

A modern browser with WebGL and WebAssembly. Chrome, Safari, Edge, Firefox, and Brave work. Some privacy-focused browsers block WebGL or WebAssembly. Detection will not run there, but the rest of the app still works.

## Run locally

Serve the folder over HTTP. Opening `index.html` directly does not work because browsers block ES modules on `file://`.

```bash
python -m http.server 5173
```

Open http://localhost:5173. On macOS use `python3`. Any static file server works.

## Access from other devices on the same network

```bash
# Windows
python -m http.server 5173 --bind 0.0.0.0

# macOS
python3 -m http.server 5173 --bind 0.0.0.0
```

Find the computer's LAN address (`ipconfig` on Windows, `ipconfig getifaddr en0` on macOS) and open `http://<address>:5173` on the phone or tablet. Allow Python through the firewall for private networks. Do not run this on public Wi-Fi.

## Deploy

The app is static. Any host that serves files will work.

### GitHub Pages

1. Push this repository to GitHub.
2. Open Settings, then Pages.
3. Set Source to "Deploy from a branch".
4. Select `main` and `/ (root)`, then save.
5. The site will be at `https://<user>.github.io/<repo>/`.

The repository includes `.nojekyll`, so Jekyll does not process the files. The site rebuilds on every push to `main`.

### Netlify

Create a folder with `index.html` and `assets/` (the local `dist/` folder is one example), then drag it to https://app.netlify.com/drop.

### Cloudflare Pages, Vercel

Upload the same folder or the repository root. No build step is required. `dist/` is ignored by git.

The first load is about 29 MB because the MediaPipe library, the models, and the optional HEIC/ZIP libraries are bundled. Later visits use the browser cache.

## Usage

| Action | Result |
| --- | --- |
| Tap or click a face | Turn the effect on or off |
| Drag a marker | Move the face region |
| Reset positions | Put all markers back where detection found them |
| Laser colour | Original, red, yellow, or a custom colour |
| Long-press a marker (touch) | Delete it |
| Right-click a marker (desktop) | Delete it |
| + Add face | Tap the left eye, then the right eye |
| Markers | Show or hide the overlay |
| EN / CS | Switch the interface language (the first visit follows the browser) |
| Jen lasery / Lasery + krytí / Jen krytí | Laser only / laser and cover / cover only |
| Krytí | Blur, pixelation, solid mask, or a custom face |
| Custom face | Upload a face photo; pick a face if the upload has several |
| Download | Save the current photo as a full-resolution JPEG |
| Download all | Save all photos in a ZIP |
| Pinch or wheel | Zoom the photo (100-400%) |
| Double-tap or double-click | Toggle zoom at that point |
| Drag the photo | Pan while zoomed |
| Zoom badge | Click to reset to 100% |

The sliders:

- Laser core: size of the bright center (the eyes)
- Laser glow: size and intensity of the halo, rays, and side glow
- Cover size: area covered around each face
- Cover strength: blur radius or pixel block size, 10-250%

Settings are stored in `localStorage`.

## How it works

Face detection uses MediaPipe Tasks Vision 0.10.35 with the BlazeFace full-range model. Each detected face is passed to Face Landmarker to refine the eye centers from iris landmarks. The library and models are in `assets/vendor` and `assets/models`.

Rendering uses Canvas 2D. Laser effects are drawn from pre-rendered sprites with additive blending. The halo, bloom, and rays are clipped to each eye's half of the face, so they do not add into a bright spot on the nose. The thin beam continues across the face. Laser core size and glow size are independent.

Blur, pixelation, and the solid mask are clipped to an ellipse with a feathered edge. The custom face is cut out along the real face contour from the Face Landmarker (478 landmarks), so no square or ellipse of background is pasted. The cut-out is positioned by matching the eye centres and the chin, scaled to the target face, tilted with the head, and given a small margin so the whole face stays covered. Exports use the original photo resolution at JPEG quality 94. Batch export uses JSZip. HEIC files are converted with heic2any in the browser. EXIF orientation is handled by `createImageBitmap`.

The preview is rendered at the displayed resolution and re-rendered when zoom changes. Marker positions are stored as percentages, so they follow the image.

## Privacy

Laser eyes alone do not hide an identity. The face, hair, clothing, and surroundings are still visible. Use a cover mode if the goal is privacy. Blur and pixelation cannot be reversed exactly, but they are not cryptographic protection. A solid mask or a custom face hides the most, and the custom face is just a static image pasted over the person — it is not a face swap. Check the result before publishing.

Photos are processed in the browser and are never uploaded. Every script, model, and library is served from this site, so the page makes no requests to third-party servers and nothing about you or your photos is sent to a CDN. The custom face photo is read locally, kept in memory for the current session, and is not stored after a reload. There are no analytics, no cookies, and no accounts. The only data kept in the browser is your slider settings and the language choice, stored in `localStorage`. The hosting provider only serves static files.

If you host the app yourself, you can check this: open DevTools, switch to the Network tab, and reload. Every request should point at your own domain.

## Limitations

- Very small faces in the background can be missed. Use + Add face.
- Profile faces and sunglasses can make eye placement less accurate. Drag the marker or add the face manually.
- Detection requires WebGL and WebAssembly. If a browser blocks them, the app still supports manual face placement, cover, and export.
- Very large photos may be slow on older computers. Export keeps the original resolution.

## Development

There is no build step. Edit `index.html`, `assets/css/styles.css`, or `assets/js/app.js` and reload. The app is a single ES module; UI strings live in `assets/js/i18n.js` as plain key/value tables for English and Czech. The MediaPipe bundle, models, and helper libraries are committed so the app works offline after the first load.

## License

MIT. See `LICENSE`.

MediaPipe and the bundled models are licensed under Apache 2.0. See `THIRD_PARTY_NOTICES.md` and `LICENSES/Apache-2.0.txt`.
