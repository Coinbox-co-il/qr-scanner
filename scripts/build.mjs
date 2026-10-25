import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const worker = await build({ entryPoints: ['src/worker.ts'], bundle: true, write: false,
    format: 'iife', platform: 'browser', target: 'es2015', minify: true, legalComments: 'inline' });
await build({ stdin: { resolveDir: process.cwd(), contents:
    `import createWorkerFromScript from './src/create-worker.ts';
     export const createWorker = () => createWorkerFromScript(${JSON.stringify(worker.outputFiles[0].text)});` },
    bundle: true, format: 'esm', target: 'es2015', minify: true, outfile: 'qr-scanner-worker.min.js' });

const base = { entryPoints: ['src/qr-scanner.ts'], bundle: true, platform: 'browser',
    minify: true, sourcemap: true, target: 'es2017' };
const external = ['./qr-scanner-worker.min.js'];
// Keep the existing browser-script/AMD entry points alongside ES modules and CommonJS.
const umdBanner = `(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();
else if(typeof define==='function'&&define.amd)define([],factory);else root.QrScanner=factory();
})(typeof self!=='undefined'?self:this,function(){`;
const umd = { format: 'iife', globalName: 'QrScannerModule',
    banner: { js: umdBanner }, footer: { js: 'return QrScannerModule.default;});' } };
await Promise.all([
    build({ ...base, external, format: 'esm', outfile: 'qr-scanner.min.js' }),
    build({ ...base, external, format: 'cjs', outfile: 'qr-scanner.cjs',
        footer: { js: 'module.exports = module.exports.default;' } }),
    build({ ...base, ...umd, external, outfile: 'qr-scanner.umd.min.js' }),
    build({ ...base, ...umd, target: 'es2015', outfile: 'qr-scanner.legacy.min.js',
        plugins: [{ name: 'inline-worker', setup(b) {
            b.onResolve({ filter: /^\.\/qr-scanner-worker\.min\.js$/ }, () => ({
                path: fileURLToPath(new URL('../qr-scanner-worker.min.js', import.meta.url)),
            }));
        } }] }),
]);
await writeFile('THIRD_PARTY_NOTICES', 'The bundled JavaScript decoder is derived from jsqr-es6 / jsQR.\n'
    + 'Source: https://github.com/Coinbox-co-il/jsQR\n\n'
    + await readFile('node_modules/jsqr-es6/LICENSE', 'utf8'));
