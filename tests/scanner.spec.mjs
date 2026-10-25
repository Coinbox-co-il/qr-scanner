import { test, expect } from '@playwright/test';
import qrcode from 'qrcode-generator';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const payloads = [
    '1BoatSLRHtKNngkdXEeobR76b53LETtpyT',
    'bitcoin:1BoatSLRHtKNngkdXEeobR76b53LETtpyT?amount=0.25',
    '0x1234567890123456789012345678901234567890',
    'ethereum:0x1234567890123456789012345678901234567890@1',
    'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh',
    'solana:11111111111111111111111111111111',
];
const fixtures = payloads.map(payload => {
    const qr = qrcode(0, 'M'); qr.addData(payload); qr.make();
    return { payload, matrix: Array.from({ length: qr.getModuleCount() }, (_, y) =>
        Array.from({ length: qr.getModuleCount() }, (_, x) => qr.isDark(y, x))) };
});

test.beforeEach(async ({ page }) => {
    await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.host !== 'qr.test') return route.abort();
        const file = url.pathname.slice(1);
        if (['qr-scanner.min.js', 'qr-scanner-worker.min.js', 'qr-scanner.umd.min.js', 'qr-scanner.legacy.min.js'].includes(file)) {
            return route.fulfill({ path: root + file, contentType: 'application/javascript' });
        }
        return route.fulfill({ contentType: 'text/html', headers: {
            'Content-Security-Policy': "default-src 'none'; script-src 'self'; worker-src blob:; style-src 'unsafe-inline'; img-src blob: data:",
        }, body: '<!doctype html><title>Local QR test</title><body><video muted playsinline></video>' });
    });
    await page.goto('https://qr.test/');
    await page.evaluate(async fixtures => {
        delete window.BarcodeDetector;
        window.QrScanner = (await import('/qr-scanner.min.js')).default;
        window.fixtures = fixtures;
        window.makeQr = (fixture = fixtures[0], variant = 'normal') => {
            const n = fixture.matrix.length, scale = variant === 'small' ? 2 : 6, margin = 4;
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = (n + margin * 2) * scale;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = variant === 'inverted' ? 'black' : variant === 'low-contrast' ? '#999' : 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            if (variant === 'rotated') { ctx.translate(canvas.width, 0); ctx.rotate(Math.PI / 2); }
            ctx.fillStyle = variant === 'inverted' ? 'white' : variant === 'low-contrast' ? '#666' : 'black';
            for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
                if (fixture.matrix[y][x]) ctx.fillRect((x + margin) * scale, (y + margin) * scale, scale, scale);
            }
            if (variant === 'blurred') {
                const copy = document.createElement('canvas'); copy.width = canvas.width; copy.height = canvas.height;
                copy.getContext('2d').drawImage(canvas, 0, 0); ctx.filter = 'blur(1px)'; ctx.drawImage(copy, 0, 0);
            }
            return canvas;
        };
        window.makeStream = () => {
            const canvas = makeQr();
            const stream = canvas.captureStream(10);
            return { stream, track: stream.getVideoTracks()[0], canvas };
        };
        window.setCamera = fn => Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: fn });
    }, fixtures);
});

test('software decoder reads 30 address/payment images exactly under CSP without remote assets', async ({ page }) => {
    const requests = []; page.on('request', request => requests.push(request.url()));
    const results = await page.evaluate(async () => {
        const results = [];
        for (const fixture of fixtures) for (const variant of ['normal', 'rotated', 'inverted', 'small', 'blurred']) {
            const result = await QrScanner.scanImage(makeQr(fixture, variant), { returnDetailedScanResult: true });
            results.push({ exact: result.data === fixture.payload,
                points: result.cornerPoints.length === 4 && result.cornerPoints.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)) });
        }
        return results;
    });
    expect(results).toHaveLength(30);
    expect(results.every(result => result.exact && result.points)).toBe(true);
    expect(requests.every(url => new URL(url).host === 'qr.test' || url.startsWith('blob:'))).toBe(true);
});

test('File, Blob and ImageBitmap inputs decode; damaged image reports its load error', async ({ page }) => {
    const result = await page.evaluate(async () => {
        const blob = await new Promise(resolve => makeQr().toBlob(resolve));
        const bitmap = await createImageBitmap(blob);
        try {
            const inputs = [blob, new File([blob], 'wallet.png', { type: 'image/png' }), bitmap];
            const decoded = await Promise.all(inputs.map(image => QrScanner.scanImage(image, { returnDetailedScanResult: true })));
            let error;
            try { await QrScanner.scanImage(new Blob(['broken'], { type: 'image/png' }), { returnDetailedScanResult: true }); }
            catch (e) { error = String(e); }
            return { decoded: decoded.map(result => result.data), error };
        } finally { bitmap.close(); }
    });
    expect(result.decoded).toEqual([payloads[0], payloads[0], payloads[0]]);
    expect(result.error).toBe('Image load error');
});

test('one-shot scans revoke every worker URL and terminate their workers, even on image failure', async ({ page }) => {
    await page.evaluate(async () => {
        const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
        const terminate = Worker.prototype.terminate;
        window.resources = { created: 0, revoked: 0, terminated: 0 };
        URL.createObjectURL = blob => { resources.created++; return create(blob); };
        URL.revokeObjectURL = url => { resources.revoked++; return revoke(url); };
        Worker.prototype.terminate = function () { resources.terminated++; return terminate.call(this); };
        for (let i = 0; i < 3; i++) await QrScanner.scanImage(makeQr(), { returnDetailedScanResult: true });
        try { await QrScanner.scanImage(new Blob(['broken'], { type: 'image/png' }), { returnDetailedScanResult: true }); }
        catch { /* Expected image-load failure, possibly before the worker resolves. */ }
    });
    await expect.poll(() => page.evaluate(() => resources)).toEqual({ created: 5, revoked: 5, terminated: 4 });
});

test('native detector does not load the software decoder and cleans up its timeout', async ({ page }) => {
    const workers = []; page.on('request', request => { if (request.url().includes('worker')) workers.push(request.url()); });
    const result = await page.evaluate(async () => {
        window.BarcodeDetector = class {
            static async getSupportedFormats() { return ['qr_code']; }
            async detect() { return [{ rawValue: 'native-result', cornerPoints: [{ x: 1, y: 2 }] }]; }
        };
        const set = window.setTimeout.bind(window), clear = window.clearTimeout.bind(window), pending = new Set();
        window.setTimeout = (fn, ms, ...args) => { const id = set(fn, ms, ...args); if (ms === 10000) pending.add(id); return id; };
        window.clearTimeout = id => { pending.delete(id); clear(id); };
        const result = await QrScanner.scanImage(makeQr(), { returnDetailedScanResult: true });
        return { result, pending: pending.size };
    });
    expect(result).toEqual({ result: { data: 'native-result', cornerPoints: [{ x: 1, y: 2 }] }, pending: 0 });
    expect(workers).toEqual([]);
});

test('failing native capability detection falls back to real software decoding', async ({ page }) => {
    const result = await page.evaluate(async () => {
        window.BarcodeDetector = class { static async getSupportedFormats() { throw new Error('disabled'); } };
        return (await QrScanner.scanImage(makeQr(), { returnDetailedScanResult: true })).data;
    });
    expect(result).toBe(payloads[0]);
});

test('native service failure falls back to real software decoding', async ({ page }) => {
    const result = await page.evaluate(async () => {
        window.BarcodeDetector = class {
            static async getSupportedFormats() { return ['qr_code']; }
            async detect() { throw new Error('service unavailable'); }
        };
        return (await QrScanner.scanImage(makeQr(), { returnDetailedScanResult: true })).data;
    });
    expect(result).toBe(payloads[0]);
});

test('playback rejection releases the acquired camera before destroy', async ({ page }) => {
    const result = await page.evaluate(async () => {
        const video = document.querySelector('video'), { stream, track } = makeStream();
        setCamera(async () => stream);
        video.play = async () => { throw new DOMException('Playback denied', 'NotAllowedError'); };
        const scanner = new QrScanner(video, () => {}, {});
        let error;
        try { await scanner.start(); } catch (e) { error = e.name; }
        const afterFailure = track.readyState; scanner.destroy();
        return { error, afterFailure, afterDestroy: track.readyState, detached: video.srcObject === null };
    });
    expect(result).toEqual({ error: 'NotAllowedError', afterFailure: 'ended', afterDestroy: 'ended', detached: true });
});

test('permission denial is reported once with the original error', async ({ page }) => {
    const result = await page.evaluate(async () => {
        let calls = 0;
        setCamera(async () => { calls++; throw new DOMException('Permission denied', 'NotAllowedError'); });
        const scanner = new QrScanner(document.querySelector('video'), () => {}, {});
        let error; try { await scanner.start(); } catch (e) { error = e.name; }
        scanner.destroy(); return { calls, error };
    });
    expect(result).toEqual({ calls: 1, error: 'NotAllowedError' });
});

test('an unreadable preferred camera falls back to another camera', async ({ page }) => {
    const result = await page.evaluate(async () => {
        const video = document.querySelector('video'), { stream, track } = makeStream(); let calls = 0;
        setCamera(async constraints => {
            calls++;
            if (constraints.video.facingMode) throw new DOMException('Preferred camera is busy', 'NotReadableError');
            return stream;
        });
        video.play = async () => {};
        const scanner = new QrScanner(video, () => {}, {}); await scanner.start();
        const state = track.readyState; scanner.destroy(); return { calls, state, stopped: track.readyState };
    });
    expect(result).toEqual({ calls: 4, state: 'live', stopped: 'ended' });
});

test('stop discards an in-flight decode and releases the camera immediately', async ({ page }) => {
    const result = await page.evaluate(async () => {
        const video = document.querySelector('video'), { stream, track } = makeStream();
        setCamera(async () => stream); video.play = async () => {};
        Object.defineProperty(video, 'paused', { get: () => false });
        Object.defineProperty(video, 'readyState', { get: () => 4 });
        let frame, finish, callbacks = 0;
        video.requestVideoFrameCallback = callback => { frame = callback; return 1; };
        QrScanner.scanImage = () => new Promise(resolve => { finish = resolve; });
        const scanner = new QrScanner(video, () => { callbacks++; }, {});
        await scanner.start(); video.dispatchEvent(new Event('play'));
        const inFlight = frame(); scanner.stop();
        finish({ data: 'stale-result', cornerPoints: [] }); await inFlight;
        const state = track.readyState; scanner.destroy();
        return { callbacks, state };
    });
    expect(result).toEqual({ callbacks: 0, state: 'ended' });
});

test('late permission response cannot replace a restarted stream', async ({ page }) => {
    await page.evaluate(() => {
        const video = document.querySelector('video'); video.play = async () => {};
        window.first = makeStream(); window.second = makeStream(); let calls = 0;
        setCamera(() => ++calls === 1 ? new Promise(resolve => { window.resolveCamera = resolve; }) : Promise.resolve(second.stream));
        window.scanner = new QrScanner(video, () => {}, {}); window.starting = scanner.start();
    });
    await page.waitForFunction(() => !!window.resolveCamera);
    const result = await page.evaluate(async () => {
        scanner.stop(); await scanner.start(); resolveCamera(first.stream); await starting;
        const result = { old: first.track.readyState, current: second.track.readyState,
            attached: document.querySelector('video').srcObject === second.stream };
        scanner.destroy(); return { ...result, afterDestroy: second.track.readyState };
    });
    expect(result).toEqual({ old: 'ended', current: 'live', attached: true, afterDestroy: 'ended' });
});

test('decoder initialization failure rejects start without requesting camera or unhandled errors', async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('https://qr.test/qr-scanner-worker.min.js', route => route.abort());
    const result = await page.evaluate(async () => {
        let cameraCalls = 0; setCamera(async () => { cameraCalls++; throw new Error('must not run'); });
        const scanner = new QrScanner(document.querySelector('video'), () => {}, {});
        let failed = false; try { await scanner.start(); } catch { failed = true; }
        scanner.destroy(); return { failed, cameraCalls };
    });
    expect(result).toEqual({ failed: true, cameraCalls: 0 }); expect(errors).toEqual([]);
});

test('pause and resume while playback is pending preserves the resumed stream', async ({ page }) => {
    await page.evaluate(() => {
        const video = document.querySelector('video'); window.camera = makeStream(); let plays = 0;
        setCamera(async () => camera.stream);
        video.play = () => ++plays === 1 ? new Promise(resolve => { window.resolvePlay = resolve; }) : Promise.resolve();
        window.scanner = new QrScanner(video, () => {}, {}); window.starting = scanner.start();
    });
    await page.waitForFunction(() => !!window.resolvePlay);
    const result = await page.evaluate(async () => {
        const paused = scanner.pause(); await scanner.start(); resolvePlay(); await starting;
        const state = camera.track.readyState; await paused;
        const attached = document.querySelector('video').srcObject === camera.stream;
        scanner.destroy(); return { state, attached, stopped: camera.track.readyState };
    });
    expect(result).toEqual({ state: 'live', attached: true, stopped: 'ended' });
});

for (const entry of ['qr-scanner.umd.min.js', 'qr-scanner.legacy.min.js']) {
    test(`${entry} retains the browser-script API`, async ({ page }) => {
        if (entry.includes('legacy')) await page.route('https://qr.test/qr-scanner-worker.min.js', route => route.abort());
        await page.addScriptTag({ url: `/${entry}` });
        const result = await page.evaluate(async () => {
            return (await QrScanner.scanImage(makeQr(), { returnDetailedScanResult: true })).data;
        });
        expect(result).toBe(payloads[0]);
    });
}
