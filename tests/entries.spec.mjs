import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
test('CommonJS entry points retain the constructor export', () => {
    for (const entry of ['../qr-scanner.cjs', '../qr-scanner.umd.min.js', '../qr-scanner.legacy.min.js']) {
        expect(typeof require(entry)).toBe('function');
    }
});
