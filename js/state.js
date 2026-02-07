// js/state.js - All reactive state definitions
window.MangaApp = window.MangaApp || {};

window.MangaApp.createState = function (deps) {
    const { ref } = deps.Vue;

    const currentMode = ref('plot');
    const activePageIndex = ref(0);
    const isMenuOpen = ref(false);
    const isSmallScreen = ref(false);

    // UI state
    const showSettings = ref(false);
    const showTextModal = ref(false);
    const showExportModal = ref(false);
    const copiedPageId = ref(null);
    const showDrawingModal = ref(false);
    const currentEditingDrawing = ref(null);
    const modalCanvasRef = ref(null);

    // Save / processing state
    const saveStatus = ref('idle');
    const isRestoring = ref(true);
    const isProcessing = ref(false);
    const isExporting = ref(false);
    const progress = ref(0);
    const progressMessage = ref('');
    let autoSaveTimer = null;
    const exportSettings = ref({
        format: 'png',
        rangeType: 'all',
        rangeStart: 1,
        rangeEnd: 1
    });

    // Data / config
    const pageConfig = ref({
        canvasW: 6071, canvasH: 8598,
        finishW: 5197, finishH: 7323,
        bleed: 118, safeTop: 472, safeBottom: 472, safeInside: 472, safeOutside: 472,
        scale: 0.12,
        fontFamily: '"HiraMinProN-W3", "Yu Mincho", "MS PMincho", "Hiragino Mincho ProN", serif',
        defaultFontSize: 18
    });
    const pages = ref([{ id: Date.now(), scripts: [], drawings: [] }]);

    const fileInput = ref(null);

    const fontOptions = [
        { label: '明朝体 (標準)', value: '"HiraMinProN-W3", "Yu Mincho", "MS PMincho", "Hiragino Mincho ProN", serif' },
        { label: 'ゴシック体', value: '"HiraKakuProN-W3", "Yu Gothic", "MS PGothic", "Hiragino Sans", sans-serif' },
        { label: '丸ゴシック', value: '"Kosugi Maru", "Arial Rounded MT Bold", "Rounded Mplus 1c", sans-serif' },
        { label: 'アンチック体風 (Gothic+Mincho)', value: '"HiraMinProN-W3", "Yu Mincho", "MS PMincho", serif' }
    ];

    // Drag & drop variables
    const draggingItem = ref(null);
    const dropTarget = ref(null);
    const draggingConteScript = ref(null);
    const isConteDropTarget = ref(null);
    const draggingDrawingIndex = ref(null);
    const dropTargetDrawingIndex = ref(null);
    const isDrawingDragReady = ref(false);

    // Edit mode variables
    const selectedItemId = ref(null);
    const isImageEditMode = ref(false);
    const drawingTool = ref('pen');
    const isDrawing = ref(false);
    const lastActiveDrawingId = ref(null);
    const lastPos = { x: 0, y: 0 };

    // Export flags
    const isTextLayerMode = ref(false);
    const isHideGuideMode = ref(false);
    const isHideDrawingMode = ref(false);
    const isTransparentMode = ref(false);

    // Refs
    const canvasRefs = ref({});
    const currentFileHandle = ref(null);
    const scriptInputRefs = ref({});
    const nameModeContainer = ref(null);
    let nameModeScrollTop = 0;

    return {
        currentMode, activePageIndex, isMenuOpen, isSmallScreen,
        showSettings, showTextModal, showExportModal, copiedPageId,
        showDrawingModal, currentEditingDrawing, modalCanvasRef,
        saveStatus, isRestoring, isProcessing, isExporting, progress, progressMessage,
        get autoSaveTimer() { return autoSaveTimer; },
        set autoSaveTimer(v) { autoSaveTimer = v; },
        exportSettings,
        pageConfig, pages, fileInput, fontOptions,
        draggingItem, dropTarget, draggingConteScript, isConteDropTarget,
        draggingDrawingIndex, dropTargetDrawingIndex, isDrawingDragReady,
        selectedItemId, isImageEditMode, drawingTool, isDrawing, lastActiveDrawingId, lastPos,
        isTextLayerMode, isHideGuideMode, isHideDrawingMode, isTransparentMode,
        canvasRefs, currentFileHandle, scriptInputRefs, nameModeContainer,
        get nameModeScrollTop() { return nameModeScrollTop; },
        set nameModeScrollTop(v) { nameModeScrollTop = v; }
    };
};
