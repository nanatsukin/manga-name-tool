// js/stores/historyStore.js - Undo/Redo履歴管理
window.MangaApp = window.MangaApp || {};
window.MangaApp.stores = window.MangaApp.stores || {};

window.MangaApp.stores.useHistoryStore = Pinia.defineStore('history', () => {
    const { ref } = Vue;

    // Cross-store dependencies (injected via setStores)
    /** @type {PageStoreInstance | null} */
    let _pageStore = null;
    /** @type {UiStoreInstance | null} */
    let _uiStore = null;
    /** @type {CanvasUtils | null} */
    let _canvasUtils = null;
    /**
     * @param {PageStoreInstance} pageStore
     * @param {UiStoreInstance} uiStore
     */
    const setStores = (pageStore, uiStore) => {
        _pageStore = pageStore;
        _uiStore = uiStore;
    };
    /** @param {CanvasUtils} canvasUtils */
    const setCanvasUtils = (canvasUtils) => {
        _canvasUtils = canvasUtils;
    };

    // --- Name mode history ---
    /** @type {VueRef<string[]>} */
    const nameHistory = ref([]);
    /** @type {VueRef<number>} */
    const nameHistoryIndex = ref(-1);

    const recordNameHistory = () => {
        if (_pageStore.currentMode !== 'name') return;

        if (nameHistoryIndex.value < nameHistory.value.length - 1) {
            nameHistory.value = nameHistory.value.slice(0, nameHistoryIndex.value + 1);
        }

        const snapshot = JSON.stringify(_pageStore.pages);
        if (nameHistory.value.length > 0 && nameHistory.value[nameHistory.value.length - 1] === snapshot) {
            return;
        }

        nameHistory.value.push(snapshot);
        nameHistoryIndex.value++;

        if (nameHistory.value.length > 50) {
            nameHistory.value.shift();
            nameHistoryIndex.value--;
        }
    };

    const undoName = () => {
        if (nameHistoryIndex.value > 0) {
            nameHistoryIndex.value--;
            try {
                _pageStore.pages = JSON.parse(nameHistory.value[nameHistoryIndex.value]);
            } catch (e) { console.error(e); }
        }
    };

    const redoName = () => {
        if (nameHistoryIndex.value < nameHistory.value.length - 1) {
            nameHistoryIndex.value++;
            try {
                _pageStore.pages = JSON.parse(nameHistory.value[nameHistoryIndex.value]);
            } catch (e) { console.error(e); }
        }
    };

    const resetNameHistory = () => {
        nameHistory.value = [];
        nameHistoryIndex.value = -1;
    };

    // --- Drawing canvas history ---
    /** @param {Drawing} drawing */
    const saveHistory = (drawing) => {
        const canvas = _uiStore.showDrawingModal ? _uiStore.modalCanvasRef : _uiStore.canvasRefs[drawing.id];
        if (!canvas) return;

        canvas.toBlob(blob => {
            _canvasUtils.pushDrawingHistory(drawing, blob);

            if (_uiStore.showDrawingModal && _uiStore.currentEditingDrawing?.id === drawing.id) {
                _uiStore.currentEditingDrawing = { ...drawing };
            }
        });
    };

    /**
     * @param {Drawing} drawing
     * @param {string} url
     * @param {HTMLCanvasElement | null} [targetCanvas]
     */
    const drawToCanvas = (drawing, url, targetCanvas = null) => {
        const canvas = targetCanvas || (_uiStore.showDrawingModal ? _uiStore.modalCanvasRef : _uiStore.canvasRefs[drawing.id]);
        if (!canvas) {
            console.error("Canvas not found for drawing:", drawing.id);
            return;
        }
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
        };
        img.src = url;
    };

    /** @param {Drawing} drawing */
    const undo = (drawing) => {
        if (!drawing || drawing.historyStep <= 0) return;
        drawing.historyStep--;
        const prevUrl = drawing.history[drawing.historyStep];
        drawing.imgSrc = prevUrl;
        drawToCanvas(drawing, prevUrl);
    };

    /** @param {Drawing} drawing */
    const redo = (drawing) => {
        if (!drawing || !drawing.history || drawing.historyStep >= drawing.history.length - 1) return;
        drawing.historyStep++;
        const nextUrl = drawing.history[drawing.historyStep];
        drawing.imgSrc = nextUrl;
        drawToCanvas(drawing, nextUrl);
    };

    /** @param {Drawing} drawing @returns {boolean} */
    const canUndo = (drawing) => {
        return drawing && drawing.history && drawing.history.length > 1 && drawing.historyStep > 0;
    };

    /** @param {Drawing} drawing @returns {boolean} */
    const canRedo = (drawing) => {
        return drawing && drawing.history && drawing.historyStep < drawing.history.length - 1;
    };

    return {
        nameHistory, nameHistoryIndex,
        setStores, setCanvasUtils,
        recordNameHistory, undoName, redoName, resetNameHistory,
        saveHistory, drawToCanvas, undo, redo, canUndo, canRedo
    };
});
