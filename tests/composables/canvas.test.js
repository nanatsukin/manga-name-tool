import { loadModule } from '../setup.js';

describe('canvasUtils', () => {
    let canvasUtils;

    beforeAll(() => {
        loadModule('src/js/composables/canvas.js');
        canvasUtils = window.MangaApp.canvasUtils;
    });

    describe('saveDrawingBlob', () => {
        it('Blob変換とURL作成', async () => {
            const mockBlob = new Blob(['test'], { type: 'image/png' });
            const mockCanvas = { toBlob: vi.fn(cb => cb(mockBlob)) };
            const drawing = { imgSrc: null, cachedBlob: null, history: [] };

            await canvasUtils.saveDrawingBlob(mockCanvas, drawing);

            expect(drawing.imgSrc).toMatch(/^blob:/);
            expect(drawing.cachedBlob).toBe(mockBlob);
        });

        it('旧URLがrevokeされる (履歴になし)', async () => {
            const revokeURL = vi.spyOn(URL, 'revokeObjectURL');
            const mockBlob = new Blob(['test']);
            const mockCanvas = { toBlob: vi.fn(cb => cb(mockBlob)) };
            const oldUrl = 'blob:http://localhost/old-url';
            const drawing = { imgSrc: oldUrl, cachedBlob: null, history: [] };

            await canvasUtils.saveDrawingBlob(mockCanvas, drawing);

            expect(revokeURL).toHaveBeenCalledWith(oldUrl);
            revokeURL.mockRestore();
        });

        it('履歴にあるURLはrevokeしない', async () => {
            const revokeURL = vi.spyOn(URL, 'revokeObjectURL');
            const mockBlob = new Blob(['test']);
            const mockCanvas = { toBlob: vi.fn(cb => cb(mockBlob)) };
            const oldUrl = 'blob:http://localhost/old-url';
            const drawing = { imgSrc: oldUrl, cachedBlob: null, history: [oldUrl] };

            await canvasUtils.saveDrawingBlob(mockCanvas, drawing);

            expect(revokeURL).not.toHaveBeenCalledWith(oldUrl);
            revokeURL.mockRestore();
        });
    });

    describe('pushDrawingHistory', () => {
        it('履歴配列の初期化', () => {
            const drawing = { imgSrc: null, cachedBlob: null };
            const blob = new Blob(['test']);

            canvasUtils.pushDrawingHistory(drawing, blob);

            expect(drawing.history).toHaveLength(1);
            expect(drawing.historyStep).toBe(0);
            expect(drawing.imgSrc).toMatch(/^blob:/);
            expect(drawing.cachedBlob).toBe(blob);
        });

        it('未来の履歴を切り捨て', () => {
            const drawing = {
                imgSrc: 'blob:old',
                cachedBlob: null,
                history: ['blob:a', 'blob:b', 'blob:c'],
                historyStep: 0
            };
            const blob = new Blob(['new']);

            canvasUtils.pushDrawingHistory(drawing, blob);

            // step 0 の次に push するので、b,c は削除される
            expect(drawing.history).toHaveLength(2);
            expect(drawing.history[0]).toBe('blob:a');
            expect(drawing.history[1]).toMatch(/^blob:/);
            expect(drawing.historyStep).toBe(1);
        });

        it('imgSrc と cachedBlob が更新される', () => {
            const drawing = { imgSrc: 'old', cachedBlob: null, history: [], historyStep: -1 };
            const blob = new Blob(['data']);

            const url = canvasUtils.pushDrawingHistory(drawing, blob);

            expect(drawing.imgSrc).toBe(url);
            expect(drawing.cachedBlob).toBe(blob);
        });
    });

    describe('initDrawingHistory', () => {
        it('imgSrcがある場合、履歴に含めてstep=0', () => {
            const drawing = { imgSrc: 'blob:existing' };
            canvasUtils.initDrawingHistory(drawing);

            expect(drawing.history).toEqual(['blob:existing']);
            expect(drawing.historyStep).toBe(0);
        });

        it('imgSrcがない場合、空の履歴でstep=-1', () => {
            const drawing = { imgSrc: null };
            canvasUtils.initDrawingHistory(drawing);

            expect(drawing.history).toEqual([]);
            expect(drawing.historyStep).toBe(-1);
        });
    });
});
