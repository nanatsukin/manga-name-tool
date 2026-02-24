import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Provide window global for Node environment
if (typeof globalThis.window === 'undefined') {
    globalThis.window = globalThis;
}

// Provide minimal document mock for DOM operations
if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
        querySelectorAll: () => [],
        getElementById: () => null,
        querySelector: () => null,
    };
}

// Initialize MangaApp namespace
globalThis.window.MangaApp = {};

/**
 * Load a module file into window.MangaApp namespace.
 * @param {string} relativePath - Path relative to project root (e.g. 'src/js/core/state.js')
 */
export function loadModule(relativePath) {
    const code = readFileSync(resolve(ROOT, relativePath), 'utf8');
    const fn = new Function(code);
    fn.call(globalThis);
}
