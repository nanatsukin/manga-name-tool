// js/mode/conte/canvas.js - Canvas drawing, modal, save/restore
window.MangaApp = window.MangaApp || {};

window.MangaApp.createCanvas = function (deps) {
    const { nextTick } = deps.Vue;
    const pageStore = deps.pageStore;
    const configStore = deps.configStore;
    const uiStore = deps.uiStore;
    const historyStore = deps.historyStore;
    const helpers = deps.helpers;

    // Save all canvases
    const saveAllCanvases = async () => {
        const promises = [];
        pageStore.pages.forEach(page => {
            page.drawings.forEach(d => {
                const cvs = uiStore.canvasRefs[d.id];
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
            const pageData = pageStore.pages[pageStore.activePageIndex];
            if (!pageData) return;

            let allDone = true;
            pageData.drawings.forEach(d => {
                if (d.imgSrc && uiStore.canvasRefs[d.id]) {
                    historyStore.drawToCanvas(d, d.imgSrc);
                } else if (d.imgSrc && !uiStore.canvasRefs[d.id]) {
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
        uiStore.currentEditingDrawing = drawing;
        uiStore.showDrawingModal = true;

        await nextTick();

        const canvas = uiStore.modalCanvasRef;
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
        const drawing = uiStore.currentEditingDrawing;
        const canvas = uiStore.modalCanvasRef;

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
                uiStore.showDrawingModal = false;
                uiStore.currentEditingDrawing = null;
            });
        } else {
            uiStore.showDrawingModal = false;
        }
    };

    // Canvas drawing
    const startDraw = (e, drawing) => {
        if (e.type === 'touchstart') e.preventDefault();
        uiStore.isDrawing = true;
        uiStore.lastActiveDrawingId = drawing.id;
        const canvas = e.target;
        const rect = canvas.getBoundingClientRect();
        const pos = helpers.getClientPos(e);
        uiStore.lastPos.x = pos.x - rect.left;
        uiStore.lastPos.y = pos.y - rect.top;
    };

    const draw = (e, drawing) => {
        if (!uiStore.isDrawing) return;
        if (e.type === 'touchmove') e.preventDefault();

        const canvas = e.target;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        const pos = helpers.getClientPos(e);
        const x = pos.x - rect.left;
        const y = pos.y - rect.top;

        ctx.beginPath();
        ctx.moveTo(uiStore.lastPos.x, uiStore.lastPos.y);
        ctx.lineTo(x, y);
        ctx.strokeStyle = uiStore.drawingTool === 'eraser' ? '#ffffff' : '#000000';
        ctx.lineWidth = uiStore.drawingTool === 'eraser' ? 20 : 3;
        ctx.lineCap = 'round';
        ctx.stroke();

        uiStore.lastPos.x = x;
        uiStore.lastPos.y = y;
    };

    const stopDraw = (drawing) => {
        if (uiStore.isDrawing) {
            uiStore.isDrawing = false;
            const target = drawing || uiStore.currentEditingDrawing;
            if (target) {
                historyStore.saveHistory(target);
            }
        }
    };

    const clearCurrentPageCanvas = () => {
        if (!confirm('全消去しますか？')) return;
        pageStore.pages[pageStore.activePageIndex].drawings.forEach(d => {
            const cvs = uiStore.canvasRefs[d.id];
            if (cvs) cvs.getContext('2d').clearRect(0, 0, 360, 240);
            historyStore.saveHistory(d);
        });
    };

    // Global keydown handler for conte mode undo/redo
    const handleGlobalKeydown = (e) => {
        if (pageStore.currentMode !== 'conte') return;
        if (!uiStore.lastActiveDrawingId) return;
        let targetDrawing = null;
        for (const page of pageStore.pages) {
            targetDrawing = page.drawings.find(d => d.id === uiStore.lastActiveDrawingId);
            if (targetDrawing) break;
        }
        if (!targetDrawing) return;
        if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
            e.preventDefault();
            e.shiftKey ? historyStore.redo(targetDrawing) : historyStore.undo(targetDrawing);
        } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
            e.preventDefault();
            historyStore.redo(targetDrawing);
        }
    };

    // IDB auto-save
    const autoSaveToIDB = async () => {
        if (uiStore.isRestoring) return;
        uiStore.saveStatus = 'saving';
        try {
            const dataToSave = { pages: JSON.parse(JSON.stringify(pageStore.pages)), config: JSON.parse(JSON.stringify(configStore.pageConfig)) };
            await Promise.all(dataToSave.pages.map(async (page, pIdx) => {
                await Promise.all(page.drawings.map(async (d, dIdx) => {
                    delete d.history; delete d.historyStep;
                    const originalDrawing = pageStore.pages[pIdx].drawings[dIdx];
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
            uiStore.saveStatus = 'saved';
        } catch (e) {
            console.error(e);
            uiStore.saveStatus = 'error';
        }
    };

    return {
        saveAllCanvases, restoreAllCanvases,
        openDrawingModal, closeDrawingModal,
        startDraw, draw, stopDraw, clearCurrentPageCanvas,
        handleGlobalKeydown, autoSaveToIDB
    };
};
