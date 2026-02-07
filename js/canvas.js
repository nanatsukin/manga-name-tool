// js/canvas.js - Canvas drawing, modal, save/restore
window.MangaApp = window.MangaApp || {};

window.MangaApp.createCanvas = function (deps) {
    const { nextTick } = deps.Vue;
    const state = deps.state;
    const history = deps.history;
    const helpers = deps.helpers;

    // Save all canvases
    const saveAllCanvases = async () => {
        const promises = [];
        state.pages.value.forEach(page => {
            page.drawings.forEach(d => {
                const cvs = state.canvasRefs.value[d.id];
                if (cvs) {
                    const p = new Promise(resolve => {
                        cvs.toBlob(blob => {
                            const isUsedInHistory = d.history && d.history.includes(d.imgSrc);
                            if (d.imgSrc && d.imgSrc.startsWith('blob:') && !isUsedInHistory) {
                                URL.revokeObjectURL(d.imgSrc);
                            }
                            d.imgSrc = URL.createObjectURL(blob);
                            d.cachedBlob = blob;
                            resolve();
                        });
                    });
                    promises.push(p);
                }
            });
        });
        await Promise.all(promises);
    };

    // Restore all canvases (with retry)
    const restoreAllCanvases = async () => {
        await nextTick();
        const tryRestore = (count = 0) => {
            const pageData = state.pages.value[state.activePageIndex.value];
            if (!pageData) return;

            let allDone = true;
            pageData.drawings.forEach(d => {
                if (d.imgSrc && state.canvasRefs.value[d.id]) {
                    history.drawToCanvas(d, d.imgSrc);
                } else if (d.imgSrc && !state.canvasRefs.value[d.id]) {
                    allDone = false;
                }
            });

            if (!allDone && count < 10) {
                setTimeout(() => tryRestore(count + 1), 50);
            }
        };
        tryRestore();
    };

    // Open drawing modal
    const openDrawingModal = async (drawing) => {
        await saveAllCanvases();
        state.currentEditingDrawing.value = drawing;
        state.showDrawingModal.value = true;

        await nextTick();

        const canvas = state.modalCanvasRef.value;
        if (canvas && drawing.imgSrc) {
            const ctx = canvas.getContext('2d');
            const img = new Image();
            img.onload = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
            };
            img.src = drawing.imgSrc;
        } else if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    };

    // Close drawing modal
    const closeDrawingModal = () => {
        const drawing = state.currentEditingDrawing.value;
        const canvas = state.modalCanvasRef.value;

        if (drawing && canvas) {
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
                state.showDrawingModal.value = false;
                state.currentEditingDrawing.value = null;
            });
        } else {
            state.showDrawingModal.value = false;
        }
    };

    // Canvas drawing
    const startDraw = (e, drawing) => {
        if (e.type === 'touchstart') e.preventDefault();
        state.isDrawing.value = true;
        state.lastActiveDrawingId.value = drawing.id;
        const canvas = e.target;
        const rect = canvas.getBoundingClientRect();
        const pos = helpers.getClientPos(e);
        state.lastPos.x = pos.x - rect.left;
        state.lastPos.y = pos.y - rect.top;
    };

    const draw = (e, drawing) => {
        if (!state.isDrawing.value) return;
        if (e.type === 'touchmove') e.preventDefault();

        const canvas = e.target;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        const pos = helpers.getClientPos(e);
        const x = pos.x - rect.left;
        const y = pos.y - rect.top;

        ctx.beginPath();
        ctx.moveTo(state.lastPos.x, state.lastPos.y);
        ctx.lineTo(x, y);
        ctx.strokeStyle = state.drawingTool.value === 'eraser' ? '#ffffff' : '#000000';
        ctx.lineWidth = state.drawingTool.value === 'eraser' ? 20 : 3;
        ctx.lineCap = 'round';
        ctx.stroke();

        state.lastPos.x = x;
        state.lastPos.y = y;
    };

    const stopDraw = (drawing) => {
        if (state.isDrawing.value) {
            state.isDrawing.value = false;
            const target = drawing || state.currentEditingDrawing.value;
            if (target) {
                history.saveHistory(target);
            }
        }
    };

    const clearCurrentPageCanvas = () => {
        if (!confirm('全消去しますか？')) return;
        state.pages.value[state.activePageIndex.value].drawings.forEach(d => {
            const cvs = state.canvasRefs.value[d.id];
            if (cvs) cvs.getContext('2d').clearRect(0, 0, 360, 240);
            history.saveHistory(d);
        });
    };

    // Global keydown handler for conte mode undo/redo
    const handleGlobalKeydown = (e) => {
        if (state.currentMode.value !== 'conte') return;
        if (!state.lastActiveDrawingId.value) return;
        let targetDrawing = null;
        for (const page of state.pages.value) {
            targetDrawing = page.drawings.find(d => d.id === state.lastActiveDrawingId.value);
            if (targetDrawing) break;
        }
        if (!targetDrawing) return;
        if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
            e.preventDefault();
            e.shiftKey ? history.redo(targetDrawing) : history.undo(targetDrawing);
        } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
            e.preventDefault();
            history.redo(targetDrawing);
        }
    };

    // IDB auto-save
    const autoSaveToIDB = async () => {
        if (state.isRestoring.value) return;
        state.saveStatus.value = 'saving';
        try {
            const dataToSave = { pages: JSON.parse(JSON.stringify(state.pages.value)), config: JSON.parse(JSON.stringify(state.pageConfig.value)) };
            await Promise.all(dataToSave.pages.map(async (page, pIdx) => {
                await Promise.all(page.drawings.map(async (d, dIdx) => {
                    delete d.history; delete d.historyStep;
                    const originalDrawing = state.pages.value[pIdx].drawings[dIdx];
                    const originalImgSrc = originalDrawing.imgSrc;
                    if (originalDrawing.cachedBlob) {
                        d.imgBlob = originalDrawing.cachedBlob;
                        delete d.imgSrc; delete d.cachedBlob;
                    } else if (originalImgSrc) {
                        try {
                            const res = await fetch(originalImgSrc);
                            d.imgBlob = await res.blob();
                            originalDrawing.cachedBlob = d.imgBlob;
                            delete d.imgSrc;
                        } catch (e) { }
                    }
                }));
            }));
            await idbKeyval.set('manga_project_autosave', dataToSave);
            state.saveStatus.value = 'saved';
        } catch (e) {
            console.error(e);
            state.saveStatus.value = 'error';
        }
    };

    return {
        saveAllCanvases, restoreAllCanvases,
        openDrawingModal, closeDrawingModal,
        startDraw, draw, stopDraw, clearCurrentPageCanvas,
        handleGlobalKeydown, autoSaveToIDB
    };
};
