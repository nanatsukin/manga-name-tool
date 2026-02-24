// js/stores/uiStore.js - モーダル・選択状態・UI状態管理
window.MangaApp = window.MangaApp || {};
window.MangaApp.stores = window.MangaApp.stores || {};

window.MangaApp.stores.useUiStore = Pinia.defineStore('ui', () => {
    const { ref, computed } = Vue;

    // Modals
    /** @type {VueRef<boolean>} */
    const showSettings = ref(false);
    /** @type {VueRef<boolean>} */
    const showTextModal = ref(false);
    /** @type {VueRef<boolean>} */
    const showExportModal = ref(false);
    /** @type {VueRef<boolean>} */
    const showDrawingModal = ref(false);
    /** @type {VueRef<Drawing | null>} */
    const currentEditingDrawing = ref(null);
    /** @type {VueRef<HTMLCanvasElement | null>} */
    const modalCanvasRef = ref(null);

    // Selection
    /** @type {VueRef<number | null>} */
    const selectedItemId = ref(null);
    /** @type {VueRef<number | null>} */
    const copiedPageId = ref(null);

    // Menu / responsive
    /** @type {VueRef<boolean>} */
    const isMenuOpen = ref(false);
    /** @type {VueRef<boolean>} */
    const isSmallScreen = ref(false);

    // Save / processing
    /** @type {VueRef<SaveStatus>} */
    const saveStatus = ref('idle');
    /** @type {VueRef<boolean>} */
    const isRestoring = ref(true);
    /** @type {VueRef<boolean>} */
    const isProcessing = ref(false);
    /** @type {VueRef<boolean>} */
    const isExporting = ref(false);
    /** @type {VueRef<number>} */
    const progress = ref(0);
    /** @type {VueRef<string>} */
    const progressMessage = ref('');
    /** @type {ReturnType<typeof setTimeout> | null} */
    let autoSaveTimer = null;

    const saveStatusText = computed(() => {
        switch (saveStatus.value) {
            case 'saving': return '保存中...';
            case 'saved': return '保存完了';
            case 'error': return '保存失敗';
            case 'idle': return '未保存';
            default: return '';
        }
    });

    // Drag & drop (plot)
    /** @type {VueRef<DraggingItem | null>} */
    const draggingItem = ref(null);
    /** @type {VueRef<DropTarget | null>} */
    const dropTarget = ref(null);

    // Drag & drop (conte)
    /** @type {VueRef<Script | null>} */
    const draggingConteScript = ref(null);
    /** @type {VueRef<number | null>} */
    const isConteDropTarget = ref(null);
    /** @type {VueRef<number | null>} */
    const draggingDrawingIndex = ref(null);
    /** @type {VueRef<number | null>} */
    const dropTargetDrawingIndex = ref(null);
    /** @type {VueRef<boolean>} */
    const isDrawingDragReady = ref(false);

    // Drawing mode
    /** @type {VueRef<boolean>} */
    const isImageEditMode = ref(false);
    /** @type {VueRef<string>} */
    const drawingTool = ref('pen');
    /** @type {VueRef<boolean>} */
    const isDrawing = ref(false);
    /** @type {VueRef<number | null>} */
    const lastActiveDrawingId = ref(null);
    /** @type {{ x: number, y: number }} */
    const lastPos = { x: 0, y: 0 };

    // Export/view flags
    /** @type {VueRef<boolean>} */
    const isTextLayerMode = ref(false);
    /** @type {VueRef<boolean>} */
    const isHideGuideMode = ref(false);
    /** @type {VueRef<boolean>} */
    const isHideDrawingMode = ref(false);
    /** @type {VueRef<boolean>} */
    const isTransparentMode = ref(false);

    // DOM refs
    /** @type {VueRef<Record<number, HTMLCanvasElement>>} */
    const canvasRefs = ref({});
    /** @type {VueRef<Record<string, HTMLElement>>} */
    const scriptInputRefs = ref({});
    /** @type {VueRef<HTMLElement | null>} */
    const nameModeContainer = ref(null);
    /** @type {VueRef<HTMLInputElement | null>} */
    const fileInput = ref(null);
    /** @type {number} */
    let nameModeScrollTop = 0;

    // Cross-store dependency (injected via setConfigStore)
    /** @type {ConfigStoreInstance | null} */
    let _configStore = null;
    /** @param {ConfigStoreInstance} store */
    const setConfigStore = (store) => { _configStore = store; };

    const checkScreenSize = () => {
        if (!_configStore) return;
        const singleW = _configStore.displayW;
        isSmallScreen.value = window.innerWidth < (singleW * 2 + 40);
    };

    return {
        showSettings, showTextModal, showExportModal, showDrawingModal,
        currentEditingDrawing, modalCanvasRef,
        selectedItemId, copiedPageId,
        isMenuOpen, isSmallScreen,
        saveStatus, saveStatusText, isRestoring, isProcessing, isExporting,
        progress, progressMessage,
        get autoSaveTimer() { return autoSaveTimer; },
        set autoSaveTimer(v) { autoSaveTimer = v; },
        draggingItem, dropTarget,
        draggingConteScript, isConteDropTarget,
        draggingDrawingIndex, dropTargetDrawingIndex, isDrawingDragReady,
        isImageEditMode, drawingTool, isDrawing, lastActiveDrawingId, lastPos,
        isTextLayerMode, isHideGuideMode, isHideDrawingMode, isTransparentMode,
        canvasRefs, scriptInputRefs, nameModeContainer, fileInput,
        get nameModeScrollTop() { return nameModeScrollTop; },
        set nameModeScrollTop(v) { nameModeScrollTop = v; },
        checkScreenSize, setConfigStore
    };
});
