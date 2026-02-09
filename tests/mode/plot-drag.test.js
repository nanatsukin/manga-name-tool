import { loadModule } from '../setup.js';
import { createMockPageStore, createMockUiStore } from '../helpers/mock-stores.js';

describe('plot/drag', () => {
    let drag;
    let pageStore, uiStore;

    const makeScript = (id, drawingId = null) => ({
        id, type: 'dialogue', char: 'A', text: `text-${id}`, drawingId,
        layout: { x: 0, y: 0, fontSize: 14 },
    });

    beforeEach(() => {
        loadModule('src/js/mode/plot/drag.js');
        pageStore = createMockPageStore({
            pages: [
                { id: 1, scripts: [makeScript(1, 100), makeScript(2), makeScript(3)], drawings: [] },
                { id: 2, scripts: [makeScript(4), makeScript(5)], drawings: [] },
            ],
        });
        uiStore = createMockUiStore();
        drag = window.MangaApp.createDragPlot({ pageStore, uiStore });
    });

    describe('dragStart', () => {
        it('should set draggingItem', () => {
            drag.dragStart(0, 1);
            expect(uiStore.draggingItem).toEqual({ pIndex: 0, idx: 1 });
        });
    });

    describe('dragOverScript', () => {
        it('should set dropTarget for different script', () => {
            drag.dragStart(0, 0);
            drag.dragOverScript(0, 2);
            expect(uiStore.dropTarget).toEqual({ pIndex: 0, idx: 2 });
        });

        it('should clear dropTarget when hovering over self', () => {
            drag.dragStart(0, 1);
            uiStore.dropTarget = { pIndex: 0, idx: 2 };
            drag.dragOverScript(0, 1);
            expect(uiStore.dropTarget).toBeNull();
        });
    });

    describe('dragOverPage', () => {
        it('should set dropTarget with idx null', () => {
            drag.dragStart(0, 0);
            drag.dragOverPage(1);
            expect(uiStore.dropTarget).toEqual({ pIndex: 1, idx: null });
        });
    });

    describe('dropOnScript - same page', () => {
        it('should reorder scripts within same page', () => {
            drag.dragStart(0, 0);
            drag.dropOnScript(0, 2);
            expect(pageStore.pages[0].scripts[0].id).toBe(2);
            expect(pageStore.pages[0].scripts[1].id).toBe(3);
            expect(pageStore.pages[0].scripts[2].id).toBe(1);
        });

        it('should preserve drawingId for same-page move', () => {
            drag.dragStart(0, 0);
            drag.dropOnScript(0, 2);
            const movedScript = pageStore.pages[0].scripts.find(s => s.id === 1);
            expect(movedScript.drawingId).toBe(100);
        });
    });

    describe('dropOnScript - cross page', () => {
        it('should move script to different page', () => {
            drag.dragStart(0, 0);
            drag.dropOnScript(1, 0);
            expect(pageStore.pages[0].scripts).toHaveLength(2);
            expect(pageStore.pages[1].scripts).toHaveLength(3);
            expect(pageStore.pages[1].scripts[0].id).toBe(1);
        });

        it('should clear drawingId when moving cross-page', () => {
            drag.dragStart(0, 0);
            drag.dropOnScript(1, 0);
            const movedScript = pageStore.pages[1].scripts.find(s => s.id === 1);
            expect(movedScript.drawingId).toBeNull();
        });
    });

    describe('dropOnPage', () => {
        it('should append script to end of target page', () => {
            drag.dragStart(0, 1);
            drag.dropOnPage(1);
            expect(pageStore.pages[1].scripts).toHaveLength(3);
            expect(pageStore.pages[1].scripts[2].id).toBe(2);
        });
    });

    describe('dragEnd', () => {
        it('should clear dragging state', () => {
            drag.dragStart(0, 0);
            uiStore.dropTarget = { pIndex: 1, idx: 0 };
            drag.dragEnd();
            expect(uiStore.draggingItem).toBeNull();
            expect(uiStore.dropTarget).toBeNull();
        });
    });

    describe('isDropTarget / isDragging', () => {
        it('should return true when matching', () => {
            drag.dragStart(0, 1);
            uiStore.dropTarget = { pIndex: 1, idx: 0 };
            expect(drag.isDragging(0, 1)).toBe(true);
            expect(drag.isDragging(0, 0)).toBe(false);
            expect(drag.isDropTarget(1, 0)).toBe(true);
            expect(drag.isDropTarget(0, 0)).toBe(false);
        });
    });
});
