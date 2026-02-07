// js/core/history.js - Name mode history + drawing canvas history
window.MangaApp = window.MangaApp || {};

window.MangaApp.createHistory = function (deps) {
    const { ref } = deps.Vue;
    const state = deps.state;

    // --- Name mode history ---
    const nameHistory = ref([]);
    const nameHistoryIndex = ref(-1);

    const recordNameHistory = () => {
        if (state.currentMode.value !== 'name') return;

        if (nameHistoryIndex.value < nameHistory.value.length - 1) {
            nameHistory.value = nameHistory.value.slice(0, nameHistoryIndex.value + 1);
        }

        const snapshot = JSON.stringify(state.pages.value);
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
                state.pages.value = JSON.parse(nameHistory.value[nameHistoryIndex.value]);
            } catch (e) { console.error(e); }
        }
    };

    const redoName = () => {
        if (nameHistoryIndex.value < nameHistory.value.length - 1) {
            nameHistoryIndex.value++;
            try {
                state.pages.value = JSON.parse(nameHistory.value[nameHistoryIndex.value]);
            } catch (e) { console.error(e); }
        }
    };

    const resetNameHistory = () => {
        nameHistory.value = [];
        nameHistoryIndex.value = -1;
    };

    // --- Drawing canvas history ---
    const saveHistory = (drawing) => {
        const canvas = state.showDrawingModal.value ? state.modalCanvasRef.value : state.canvasRefs.value[drawing.id];
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

            if (state.showDrawingModal.value && state.currentEditingDrawing.value?.id === drawing.id) {
                state.currentEditingDrawing.value = { ...drawing };
            }
        });
    };

    const drawToCanvas = (drawing, url, targetCanvas = null) => {
        const canvas = targetCanvas || (state.showDrawingModal.value ? state.modalCanvasRef.value : state.canvasRefs.value[drawing.id]);
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
        recordNameHistory, undoName, redoName, resetNameHistory,
        saveHistory, drawToCanvas, undo, redo, canUndo, canRedo
    };
};
