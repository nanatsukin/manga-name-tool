/**
 * Mock store factories for testing modules that depend on Pinia stores.
 * These create plain objects that mimic Pinia store behavior (auto-unwrapped refs).
 */

export function createMockPageStore(overrides = {}) {
    return {
        pages: [],
        activePageIndex: 0,
        currentMode: 'plot',
        drawingCountWarning: null,
        spreads: [],
        uniqueCharacters: [],
        setUiStore: () => {},
        ...overrides,
    };
}

export function createMockConfigStore(overrides = {}) {
    const store = {
        pageConfig: {
            canvasW: 6071, canvasH: 8598,
            finishW: 5197, finishH: 7323,
            bleed: 118, safeTop: 472, safeBottom: 472,
            safeInside: 472, safeOutside: 354,
            scale: 0.12,
            defaultFontSize: 18,
        },
        fontOptions: [],
        exportSettings: { format: 'png', rangeType: 'all', rangeStart: 1, rangeEnd: 1 },
        currentFileHandle: null,
        get displayW() { return this.pageConfig.canvasW * this.pageConfig.scale; },
        get displayH() { return this.pageConfig.canvasH * this.pageConfig.scale; },
        get pageStyle() { return { width: this.displayW + 'px', height: this.displayH + 'px' }; },
        ...overrides,
    };
    return store;
}

export function createMockUiStore(overrides = {}) {
    return {
        showSettings: false,
        showTextModal: false,
        showExportModal: false,
        showDrawingModal: false,
        currentEditingDrawing: null,
        modalCanvasRef: null,
        selectedItemId: null,
        copiedPageId: null,
        isMenuOpen: false,
        isSmallScreen: false,
        saveStatus: 'idle',
        isRestoring: false,
        isProcessing: false,
        isExporting: false,
        progress: 0,
        progressMessage: '',
        draggingItem: null,
        dropTarget: null,
        isImageEditMode: false,
        drawingTool: 'pen',
        isDrawing: false,
        lastActiveDrawingId: null,
        lastPos: { x: 0, y: 0 },
        isTextLayerMode: false,
        isHideGuideMode: false,
        isHideDrawingMode: false,
        isTransparentMode: false,
        canvasRefs: {},
        scriptInputRefs: {},
        nameModeContainer: null,
        fileInput: null,
        nameModeScrollTop: 0,
        autoSaveTimer: null,
        checkScreenSize: () => {},
        setConfigStore: () => {},
        ...overrides,
    };
}

export function createMockHistoryStore(overrides = {}) {
    return {
        nameHistory: [],
        nameHistoryIndex: -1,
        setStores: vi.fn(),
        recordNameHistory: vi.fn(),
        undoName: vi.fn(),
        redoName: vi.fn(),
        resetNameHistory: vi.fn(),
        saveHistory: vi.fn(),
        drawToCanvas: vi.fn(),
        undo: vi.fn(),
        redo: vi.fn(),
        canUndo: () => false,
        canRedo: () => false,
        ...overrides,
    };
}
