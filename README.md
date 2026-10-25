# QR Scanner — Coinbox fork

Browser QR scanner forked from [Nimiq](https://github.com/nimiq/qr-scanner).
Camera frames and image files are decoded locally using native `BarcodeDetector`
when available, with [Coinbox's JavaScript decoder](https://github.com/Coinbox-co-il/jsQR)
running in a worker as the fallback. The release has no runtime npm dependencies.

## Installation

Install the locally built GitHub release under the existing package name:

```bash
npm install --save qr-scanner@https://github.com/Coinbox-co-il/qr-scanner/releases/download/v1.5.1/coinbox-co-il-qr-scanner-1.5.1.tgz
```
Import it through your bundler:

```js
import QrScanner from 'qr-scanner';
```
For direct browser use, copy `qr-scanner.min.js` and `qr-scanner-worker.min.js`
beside each other and use a module script:

```html
<script type="module">
    import QrScanner from 'path/to/qr-scanner.min.js';
</script>
```

The worker module is loaded dynamically when needed. A bundler must emit it at
the import path; otherwise copy it beside the bundled scanner. If your page
restricts workers through [CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/worker-src),
allow `blob:` worker URLs.

For a non-module browser script, use the UMD build:

```html
<script src="path/to/qr-scanner.umd.min.js"></script>
```
CommonJS consumers can use:

```js
const QrScanner = require('qr-scanner');
```

The regular builds target ES2017. `qr-scanner.legacy.min.js` is a UMD build with
ES2015 syntax and the worker inlined, so it does not need a dynamic import. It
does not polyfill browser APIs such as camera access or workers.

## Usage

### Web Cam Scanning

#### 1. Create HTML

Create a `<video>` element for the camera stream:

```html
<video></video>
```

#### 2. Create a QrScanner Instance

```js
const qrScanner = new QrScanner(
    videoElem,
    result => console.log('decoded qr code:', result.data),
    { returnDetailedScanResult: true },
);
```

The optional third argument accepts:

| Option | Description |
|---|---|
| `onDecodeError` | Handler for decoding errors. By default, errors other than "No QR code found" are logged. |
| `preferredCamera` | A camera device ID, `'environment'` (default), or `'user'`. The preference may not be available. |
| `maxScansPerSecond` | Maximum scan rate, default 25. Where `requestVideoFrameCallback` is supported, scanning also respects the camera frame rate. |
| `calculateScanRegion` | Returns `{ x, y, width, height, downScaledWidth?, downScaledHeight? }`. Preserve the aspect ratio when downscaling. The default is a centered square spanning two thirds of the smaller video dimension, scaled to 400×400. |
| `highlightScanRegion` | Draw the scan region using the overlay `div`, which can be styled through `qrScanner.$overlay`. |
| `highlightCodeOutline` | Draw an SVG QR outline in the overlay. Style its fill and stroke through CSS, or use result `cornerPoints` for a custom outline. |
| `overlay` | Supply a custom overlay `div` beside the video element. Custom overlays do not receive the default code-outline styles. |
| `returnDetailedScanResult` | Set `true` to request detailed results when no other options are needed. |

To use the default value for an option, omit it or supply `undefined`.

With an options object, results contain `data` (decoded text) and `cornerPoints`
(the QR outline in camera coordinates). Omitting options retains the deprecated
string result for compatibility.

#### 3. Start scanning

```js
await qrScanner.start();
```

Start when ready to request camera permission. Camera access requires a secure
context, such as HTTPS or localhost.

#### 4. Stop scanning

```js
qrScanner.stop();
```

Call `start()` again to resume.

### Single Image Scanning

```js
QrScanner.scanImage(image, { returnDetailedScanResult: true })
    .then(result => console.log(result))
    .catch(error => console.log(error || 'No QR code found.'));
```
Supported image sources are:
[HTMLImageElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement),
[SVGImageElement](https://developer.mozilla.org/en-US/docs/Web/API/SVGImageElement),
[HTMLVideoElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement),
[HTMLCanvasElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement),
[ImageBitmap](https://developer.mozilla.org/en-US/docs/Web/API/ImageBitmap),
[OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas),
[File](https://developer.mozilla.org/en-US/docs/Web/API/File) / [Blob](https://developer.mozilla.org/en-US/docs/Web/API/Blob),
[Data URIs](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URIs),
URLs pointing to an image (if they are on the same origin or [CORS enabled](https://developer.mozilla.org/en-US/docs/Web/HTML/CORS_enabled_image))

The optional second argument accepts:

| Option | Description |
|---|---|
| `scanRegion` | Restrict scanning to `{ x, y, width, height, downScaledWidth?, downScaledHeight? }`. Preserve aspect ratio when downscaling. By default the entire image is scanned at its original size. |
| `qrEngine` | Reuse an engine returned by `await QrScanner.createQrEngine()` when scanning many images. By default, each call creates and cleans up its own engine. A reused worker must be terminated by its owner when finished. |
| `canvas` | Reuse a canvas created with `document.createElement('canvas')` when scanning many images. By default each call creates its own canvas. |
| `disallowCanvasResizing` | Keep a supplied canvas at its existing size. Match its aspect ratio to the scan region to avoid distortion. Default `false`. |
| `alsoTryWithoutScanRegion` | If regional scanning fails, retry the entire image. Default `false`. |
| `returnDetailedScanResult` | Set `true` to request detailed results when no other options are needed. |

To use the default value for an option, omit it or supply `undefined`.

Pass a supported options field, such as `{ returnDetailedScanResult: true }`, to
receive `data` and `cornerPoints` in image coordinates. Omitting options retains
the deprecated string result. If no QR code is read, the promise rejects.

### Checking for Camera availability

Check whether to offer camera scanning:

```js
QrScanner.hasCamera(); // async
```

### Getting the list of available Cameras

`listCameras` returns device `id` and `label` values. Passing `true` requests
camera permission to obtain labels; otherwise labels may be placeholders. Call
it after `start()` succeeds to reuse an existing permission grant.

```js
QrScanner.listCameras(); // async; without requesting camera labels
QrScanner.listCameras(true); // async; requesting camera labels, potentially asking the user for permission
```

### Specifying which camera to use

Select a device ID from `listCameras`, or prefer `'environment'` or `'user'`.
The browser may choose another camera if the preference cannot be fulfilled.

```js
qrScanner.setCamera(facingModeOrDeviceId); // async
```

### Color Inverted Mode

Select dark QR modules on a light background (`original`), light modules on a
dark background (`invert`), or `both`:

```js
qrScanner.setInversionMode(inversionMode);
```
Camera scanning defaults to `original`; single-image scanning defaults to `both`.
Native `BarcodeDetector` handles inversion independently of this setting.

### Color Correction

Change the weights for red, green and blue in the grayscale computation to improve contrast for QR codes of a
specific color:

```js
qrScanner.setGrayscaleWeights(red, green, blue, true);
```
Weights should total 256 for integer approximation or 1 otherwise. The worker
defaults to red 77, green 150 and blue 29 with integer approximation. Native
`BarcodeDetector` handles color independently of this setting.

### Flashlight support

Call `hasFlash()` after `start()` succeeds to check support without opening a
temporary stream and potentially requesting camera permission.

```js
await qrScanner.hasFlash();
qrScanner.isFlashOn();
await qrScanner.turnFlashOn();
await qrScanner.turnFlashOff();
await qrScanner.toggleFlash();
```

### Clean Up

Destroy the scanner when finished:

```js
qrScanner.destroy();
```
This stops the camera and worker and removes event listeners. A destroyed
instance cannot be restarted.

## Development and releases

Use Node 26 and an installed Google Chrome:

```sh
npm ci
npm run check
```

`check` typechecks, builds with TypeScript and esbuild, then runs the Playwright
tests locally in Chrome. The tests use anonymous fixtures and do not install
browsers or contact Coinbox services. `npm run build` builds without testing.

The decoder is pinned in `devDependencies` and bundled into the worker. After
checks pass, create the release tarball locally with `npm pack` and attach it to
a GitHub release. Consumers install that tarball without development tools.

Keep GitHub Actions disabled and run all builds and tests locally; do not add
cloud CI or self-hosted test runners. Coinbox's manual Patch Tuesday procedure
reviews upstream changes and dependency updates.

See [LICENSE](./LICENSE) and the generated `THIRD_PARTY_NOTICES` for attribution.
