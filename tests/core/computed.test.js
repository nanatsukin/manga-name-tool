import { loadModule } from '../setup.js';
import { mockRef, mockComputed } from '../helpers/mock-vue.js';

// Mock Vue and Pinia globals so store files can be loaded
beforeEach(() => {
    globalThis.Vue = { ref: mockRef, computed: mockComputed };
    globalThis.Pinia = { defineStore: (_id, factory) => factory };
    window.MangaApp.stores = {};
});

describe('uiStore computed: saveStatusText', () => {
    let store;

    beforeEach(() => {
        loadModule('src/js/stores/uiStore.js');
        store = window.MangaApp.stores.useUiStore();
    });

    it('should return "保存中..." for saving', () => {
        store.saveStatus.value = 'saving';
        expect(store.saveStatusText.value).toBe('保存中...');
    });

    it('should return "保存完了" for saved', () => {
        store.saveStatus.value = 'saved';
        expect(store.saveStatusText.value).toBe('保存完了');
    });

    it('should return "保存失敗" for error', () => {
        store.saveStatus.value = 'error';
        expect(store.saveStatusText.value).toBe('保存失敗');
    });

    it('should return "未保存" for idle', () => {
        store.saveStatus.value = 'idle';
        expect(store.saveStatusText.value).toBe('未保存');
    });
});

describe('configStore computed: displayW / displayH / pageStyle', () => {
    let store;

    beforeEach(() => {
        loadModule('src/js/stores/configStore.js');
        store = window.MangaApp.stores.useConfigStore();
    });

    it('should calculate canvasW * scale', () => {
        expect(store.displayW.value).toBeCloseTo(6071 * 0.12);
    });

    it('should calculate canvasH * scale', () => {
        expect(store.displayH.value).toBeCloseTo(8598 * 0.12);
    });

    it('should return style object with px values', () => {
        const style = store.pageStyle.value;
        expect(style.width).toBe(6071 * 0.12 + 'px');
        expect(style.height).toBe(8598 * 0.12 + 'px');
    });
});

describe('pageStore computed: drawingCountWarning', () => {
    let store;

    beforeEach(() => {
        loadModule('src/js/stores/pageStore.js');
        store = window.MangaApp.stores.usePageStore();
    });

    it('should return null for 6 or fewer drawings', () => {
        store.pages.value = [{ drawings: new Array(6).fill({}) }];
        store.activePageIndex.value = 0;
        expect(store.drawingCountWarning.value).toBeNull();
    });

    it('should return yellow warning for 7-8 drawings', () => {
        store.pages.value = [{ drawings: new Array(7).fill({}) }];
        store.activePageIndex.value = 0;
        const result = store.drawingCountWarning.value;
        expect(result).not.toBeNull();
        expect(result.text).toContain('コマ数多め');
        expect(result.class).toContain('yellow');
    });

    it('should return red warning for 9+ drawings', () => {
        store.pages.value = [{ drawings: new Array(9).fill({}) }];
        store.activePageIndex.value = 0;
        const result = store.drawingCountWarning.value;
        expect(result).not.toBeNull();
        expect(result.text).toContain('コマ数過多');
        expect(result.class).toContain('red');
    });
});

describe('pageStore computed: spreads', () => {
    let store;

    beforeEach(() => {
        loadModule('src/js/stores/pageStore.js');
        store = window.MangaApp.stores.usePageStore();
    });

    it('should return single pages when uiStore not set (small screen fallback)', () => {
        // Without setUiStore, _uiStore is null → isSmall = false (uses spread layout)
        store.pages.value = [
            { id: 1, scripts: [], drawings: [] },
            { id: 2, scripts: [], drawings: [] },
            { id: 3, scripts: [], drawings: [] },
        ];
        const result = store.spreads.value;
        // Page 0 alone, then [1,2]
        expect(result[0]).toHaveLength(1);
        expect(result[0][0].pageIndex).toBe(0);
        expect(result[1]).toHaveLength(2);
    });

    it('should pair pages as spreads on large screen', () => {
        store.pages.value = [
            { id: 1, scripts: [], drawings: [] },
            { id: 2, scripts: [], drawings: [] },
            { id: 3, scripts: [], drawings: [] },
            { id: 4, scripts: [], drawings: [] },
        ];
        const result = store.spreads.value;
        // Page 0 alone, then [1,2], [3]
        expect(result[0]).toHaveLength(1);
        expect(result[0][0].pageIndex).toBe(0);
        expect(result[1]).toHaveLength(2);
        expect(result[1][0].pageIndex).toBe(1);
        expect(result[1][1].pageIndex).toBe(2);
        expect(result[2]).toHaveLength(1);
        expect(result[2][0].pageIndex).toBe(3);
    });

    it('should return single pages when uiStore isSmallScreen is true', () => {
        store.setUiStore({ isSmallScreen: true });
        store.pages.value = [
            { id: 1, scripts: [], drawings: [] },
            { id: 2, scripts: [], drawings: [] },
            { id: 3, scripts: [], drawings: [] },
        ];
        const result = store.spreads.value;
        expect(result).toHaveLength(3);
        expect(result[0]).toHaveLength(1);
        expect(result[1]).toHaveLength(1);
    });
});

describe('pageStore computed: uniqueCharacters', () => {
    let store;

    beforeEach(() => {
        loadModule('src/js/stores/pageStore.js');
        store = window.MangaApp.stores.usePageStore();
    });

    it('should return sorted unique character names', () => {
        store.pages.value = [
            { scripts: [{ char: 'Bob' }, { char: 'Alice' }, { char: 'Bob' }] },
            { scripts: [{ char: 'Charlie' }, { char: '' }] },
        ];
        expect(store.uniqueCharacters.value).toEqual(['Alice', 'Bob', 'Charlie']);
    });

    it('should return empty array when no characters', () => {
        store.pages.value = [{ scripts: [{ char: '' }] }];
        expect(store.uniqueCharacters.value).toEqual([]);
    });
});
