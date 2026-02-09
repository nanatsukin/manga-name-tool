import { loadModule } from '../setup.js';
import { mockNextTick } from '../helpers/mock-vue.js';
import { createMockPageStore, createMockConfigStore, createMockUiStore, createMockHistoryStore } from '../helpers/mock-stores.js';

describe('page-ops', () => {
    let pageOps;
    let pageStore, configStore, uiStore, historyStore;

    const makeScript = (id, opts = {}) => ({
        id,
        type: opts.type || 'dialogue',
        char: opts.char || 'Alice',
        text: opts.text || `text-${id}`,
        drawingId: opts.drawingId || null,
        layout: { x: 300, y: 200, fontSize: opts.fontSize || 18 },
    });

    const makeDrawing = (id) => ({
        id, imgSrc: null,
        layout: { x: 50, y: 50, w: 300, h: 200, z: 1 },
        inner: { scale: 1, x: 0, y: 0 },
        history: [], historyStep: -1,
    });

    beforeEach(() => {
        // Mock confirm to always return true
        vi.stubGlobal('confirm', () => true);

        loadModule('src/js/core/helpers.js');
        loadModule('src/js/ops/page-ops.js');

        pageStore = createMockPageStore({
            currentMode: 'plot',
            activePageIndex: 0,
            pages: [
                {
                    id: 1,
                    scripts: [makeScript(1), makeScript(2, { char: 'Bob' }), makeScript(3)],
                    drawings: [makeDrawing(100), makeDrawing(200)],
                },
            ],
        });
        configStore = createMockConfigStore({
            pageConfig: { defaultFontSize: 18, canvasH: 8598, scale: 0.12 },
        });
        uiStore = createMockUiStore();
        historyStore = createMockHistoryStore();

        const helpers = window.MangaApp.createHelpers({
            Vue: { nextTick: mockNextTick },
            pageStore, configStore, uiStore,
            addScript: null,
        });

        const mockCanvas = {
            saveAllCanvases: vi.fn().mockResolvedValue(undefined),
            restoreAllCanvases: vi.fn(),
        };

        pageOps = window.MangaApp.createPageOps({
            Vue: { nextTick: mockNextTick },
            pageStore, configStore, uiStore, historyStore,
            helpers, canvas: mockCanvas,
        });
    });

    describe('addScript', () => {
        it('should add a new dialogue script with defaults', () => {
            const initialCount = pageStore.pages[0].scripts.length;
            pageOps.addScript(0);
            expect(pageStore.pages[0].scripts).toHaveLength(initialCount + 1);

            const added = pageStore.pages[0].scripts[initialCount];
            expect(added.type).toBe('dialogue');
            expect(added.char).toBe('');
            expect(added.text).toBe('');
            expect(added.drawingId).toBeNull();
            expect(added.layout.fontSize).toBe(18);
        });
    });

    describe('toggleScriptType', () => {
        it('should cycle dialogue -> direction -> note -> dialogue', () => {
            const script = pageStore.pages[0].scripts[0];
            expect(script.type).toBe('dialogue');

            pageOps.toggleScriptType(0, 0);
            expect(script.type).toBe('direction');
            expect(script.char).toBe('');

            pageOps.toggleScriptType(0, 0);
            expect(script.type).toBe('note');

            pageOps.toggleScriptType(0, 0);
            expect(script.type).toBe('dialogue');
        });
    });

    describe('moveScript', () => {
        it('should move script up', () => {
            pageOps.moveScript(0, 1, -1);
            expect(pageStore.pages[0].scripts[0].id).toBe(2);
            expect(pageStore.pages[0].scripts[1].id).toBe(1);
        });

        it('should not move beyond bounds', () => {
            pageOps.moveScript(0, 0, -1);
            expect(pageStore.pages[0].scripts[0].id).toBe(1);
        });

        it('should move script down', () => {
            pageOps.moveScript(0, 0, 1);
            expect(pageStore.pages[0].scripts[0].id).toBe(2);
            expect(pageStore.pages[0].scripts[1].id).toBe(1);
        });
    });

    describe('insertScriptAfter', () => {
        it('should insert a new script after the given index', () => {
            pageOps.insertScriptAfter(0, 0);
            expect(pageStore.pages[0].scripts).toHaveLength(4);
            expect(pageStore.pages[0].scripts[1].type).toBe('dialogue');
            expect(pageStore.pages[0].scripts[1].char).toBe('');
        });
    });

    describe('addDrawing', () => {
        it('should add a drawing with default layout', () => {
            const initialCount = pageStore.pages[0].drawings.length;
            pageOps.addDrawing(0);
            expect(pageStore.pages[0].drawings).toHaveLength(initialCount + 1);

            const added = pageStore.pages[0].drawings[initialCount];
            expect(added.imgSrc).toBeNull();
            expect(added.layout).toEqual({ x: 50, y: 50, w: 300, h: 200, z: 1 });
            expect(added.inner).toEqual({ scale: 1, x: 0, y: 0 });
        });
    });

    describe('selectItem', () => {
        it('should update selectedItemId and switch page', () => {
            pageStore.pages.push({
                id: 2, scripts: [makeScript(10)], drawings: [],
            });
            pageOps.selectItem(10);
            expect(uiStore.selectedItemId).toBe(10);
            expect(pageStore.activePageIndex).toBe(1);
        });

        it('should clear isImageEditMode when selecting null', () => {
            uiStore.isImageEditMode = true;
            pageOps.selectItem(null);
            expect(uiStore.selectedItemId).toBeNull();
            expect(uiStore.isImageEditMode).toBe(false);
        });
    });

    describe('applyFontSizeToAll', () => {
        it('should set all scripts fontSize to default', () => {
            configStore.pageConfig.defaultFontSize = 24;
            pageOps.applyFontSizeToAll();
            pageStore.pages.forEach(p => {
                p.scripts.forEach(s => {
                    expect(s.layout.fontSize).toBe(24);
                });
            });
        });
    });

    describe('addPage', () => {
        it('should add a new empty page', async () => {
            await pageOps.addPage();
            expect(pageStore.pages).toHaveLength(2);
            expect(pageStore.pages[1].scripts).toEqual([]);
            expect(pageStore.pages[1].drawings).toEqual([]);
        });
    });
});
