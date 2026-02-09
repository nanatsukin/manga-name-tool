// js/stores/uiStore.js - モーダル・選択状態・UI状態管理
window.MangaApp = window.MangaApp || {};
window.MangaApp.stores = window.MangaApp.stores || {};

window.MangaApp.stores.useUiStore = Pinia.defineStore('ui', () => {
    const { ref, computed } = Vue;

    // Modals
    const showSettings = ref(false);
    const showTextModal = ref(false);
    const showExportModal = ref(false);
    const showDrawingModal = ref(false);
    const currentEditingDrawing = ref(null);
    const modalCanvasRef = ref(null);

    // Selection
    const selectedItemId = ref(null);
    const copiedPageId = ref(null);

    // Menu / responsive
    const isMenuOpen = ref(false);
    const isSmallScreen = ref(false);

    // Save / processing
    const saveStatus = ref('idle');
    const isRestoring = ref(true);
    const isProcessing = ref(false);
    const isExporting = ref(false);
    const progress = ref(0);
    const progressMessage = ref('');
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
    const draggingItem = ref(null);
    const dropTarget = ref(null);

    // Drag & drop (conte)
    const draggingConteScript = ref(null);
    const isConteDropTarget = ref(null);
    const draggingDrawingIndex = ref(null);
    const dropTargetDrawingIndex = ref(null);
    const isDrawingDragReady = ref(false);

    // Drawing mode
    const isImageEditMode = ref(false);
    const drawingTool = ref('pen');
    const isDrawing = ref(false);
    const lastActiveDrawingId = ref(null);
    const lastPos = { x: 0, y: 0 };

    // Export/view flags
    const isTextLayerMode = ref(false);
    const isHideGuideMode = ref(false);
    const isHideDrawingMode = ref(false);
    const isTransparentMode = ref(false);

    // DOM refs
    const canvasRefs = ref({});
    const scriptInputRefs = ref({});
    const nameModeContainer = ref(null);
    const fileInput = ref(null);
    let nameModeScrollTop = 0;

    // Cross-store dependency (injected via setConfigStore)
    let _configStore = null;
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
