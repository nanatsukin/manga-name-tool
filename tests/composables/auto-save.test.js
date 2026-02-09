import { loadModule } from '../setup.js';

describe('autoSaveUtils', () => {
    let autoSaveUtils;

    beforeAll(() => {
        // FileReader mock for Node environment
        if (typeof globalThis.FileReader === 'undefined') {
            globalThis.FileReader = class {
                readAsDataURL() {
                    setTimeout(() => {
                        this.result = 'data:text/plain;base64,aGVsbG8=';
                        if (this.onloadend) this.onloadend();
                    }, 0);
                }
            };
        }
        loadModule('src/js/composables/auto-save.js');
        autoSaveUtils = window.MangaApp.autoSaveUtils;
    });

    describe('blobToBase64', () => {
        it('Blob を data:URL に変換する', async () => {
            const blob = new Blob(['hello'], { type: 'text/plain' });
            const result = await autoSaveUtils.blobToBase64(blob);
            expect(result).toMatch(/^data:/);
        });
    });

    describe('deepClone', () => {
        it('ネストしたオブジェクトを独立に複製する', () => {
            const original = { a: 1, b: { c: 2, d: [3, 4] } };
            const cloned = autoSaveUtils.deepClone(original);

            expect(cloned).toEqual(original);
            expect(cloned).not.toBe(original);
            expect(cloned.b).not.toBe(original.b);
            expect(cloned.b.d).not.toBe(original.b.d);
        });

        it('元オブジェクトの変更が影響しない', () => {
            const original = { x: [1, 2, 3] };
            const cloned = autoSaveUtils.deepClone(original);

            original.x.push(4);
            expect(cloned.x).toEqual([1, 2, 3]);
        });
    });
});
