// js/stores/historyStore.js - Undo/Redo履歴管理
window.MangaApp = window.MangaApp || {};
window.MangaApp.stores = window.MangaApp.stores || {};

window.MangaApp.stores.useHistoryStore = Pinia.defineStore('history', () => {
    const { ref } = Vue;

    // Cross-store dependencies (injected via setStores)
    let _pageStore = null;
    let _uiStore = null;
    const setStores = (pageStore, uiStore) => {
        _pageStore = pageStore;
        _uiStore = uiStore;
    };

    // --- Name mode history ---
    const nameHistory = ref([]);
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
    const saveHistory = (drawing) => {
        const canvas = _uiStore.showDrawingModal ? _uiStore.modalCanvasRef : _uiStore.canvasRefs[drawing.id];
        if (!canvas) return;

        canvas.toBlob(blob => {
            const url = URL.createObjectURL(blob);
            if (!drawing.history) drawing.history = [];
            if (drawing.historyStep === undefined) drawing.historyStep = -1;

            if (drawing.historyStep < drawing.history.length - 1) {
                drawing.history = drawing.history.slice(0, drawing.historyStep + 1);
            }

            drawing.history.push(url);
            drawing.historyStep++;
            drawing.imgSrc = url;
            drawing.cachedBlob = blob;

            if (_uiStore.showDrawingModal && _uiStore.currentEditingDrawing?.id === drawing.id) {
                _uiStore.currentEditingDrawing = { ...drawing };
            }
        });
    };

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

    const undo = (drawing) => {
        if (!drawing || drawing.historyStep <= 0) return;
        drawing.historyStep--;
        const prevUrl = drawing.history[drawing.historyStep];
        drawing.imgSrc = prevUrl;
        drawToCanvas(drawing, prevUrl);
    };

    const redo = (drawing) => {
        if (!drawing || !drawing.history || drawing.historyStep >= drawing.history.length - 1) return;
        drawing.historyStep++;
        const nextUrl = drawing.history[drawing.historyStep];
        drawing.imgSrc = nextUrl;
        drawToCanvas(drawing, nextUrl);
    };

    const canUndo = (drawing) => {
        return drawing && drawing.history && drawing.history.length > 1 && drawing.historyStep > 0;
    };

    const canRedo = (drawing) => {
        return drawing && drawing.history && drawing.historyStep < drawing.history.length - 1;
    };

    return {
        nameHistory, nameHistoryIndex,
        setStores,
        recordNameHistory, undoName, redoName, resetNameHistory,
        saveHistory, drawToCanvas, undo, redo, canUndo, canRedo
    };
});
