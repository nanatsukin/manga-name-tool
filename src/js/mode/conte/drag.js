// js/mode/conte/drag.js - Conte drag & drop (drawings + scripts)
window.MangaApp = window.MangaApp || {};

window.MangaApp.createDragConte = function (deps) {
    const pageStore = deps.pageStore;
    const uiStore = deps.uiStore;
    const canvas = deps.canvas;
    const canvasUtils = deps.canvasUtils;
    const dndUtils = deps.dndUtils;

    // Drawing drag handle
    const onHandleDown = () => { uiStore.isDrawingDragReady = true; };
    const onHandleUp = () => { uiStore.isDrawingDragReady = false; };

    // Drawing D&D
    const dragStartDrawing = (e, idx) => {
        if (!uiStore.isDrawingDragReady) {
            e.preventDefault();
            return;
        }
        uiStore.draggingDrawingIndex = idx;
    };

    const dragEndDrawing = () => {
        uiStore.draggingDrawingIndex = null;
        uiStore.dropTargetDrawingIndex = null;
        uiStore.isDrawingDragReady = false;
    };

    const dragOverDrawing = (idx) => {
        if (uiStore.draggingDrawingIndex === null) return;
        if (uiStore.draggingDrawingIndex === idx) return;
        if (uiStore.dropTargetDrawingIndex !== idx) uiStore.dropTargetDrawingIndex = idx;
    };

    const dropOnDrawing = async (targetIdx) => {
        const srcIdx = uiStore.draggingDrawingIndex;
        if (srcIdx === null) return;

        const page = pageStore.pages[pageStore.activePageIndex];
        await Promise.all(page.drawings.map(d => {
            const cvs = uiStore.canvasRefs[d.id];
            if (cvs) return canvasUtils.saveDrawingBlob(cvs, d);
            return Promise.resolve();
        }));

        dndUtils.arrayMove(page.drawings, srcIdx, targetIdx);

        dragEndDrawing();
        canvas.restoreAllCanvases();
    };

    // Conte script D&D
    const dragStartConteScript = (e, script) => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.dropEffect = 'move';
        e.dataTransfer.setData('text/plain', script.id);
        uiStore.draggingConteScript = script;
    };

    const dragEndConteScript = () => {
        uiStore.draggingConteScript = null;
        uiStore.isConteDropTarget = null;
    };

    const dragOverConteScript = (targetId) => {
        if (uiStore.draggingDrawingIndex !== null) return;
        if (!uiStore.draggingConteScript) return;
        if (uiStore.isConteDropTarget !== targetId) uiStore.isConteDropTarget = targetId;
    };

    const dropOnConteScript = (targetScript) => {
        const sourceScriptRef = uiStore.draggingConteScript;
        if (!sourceScriptRef || sourceScriptRef.id === targetScript.id) return;

        const scripts = pageStore.pages[pageStore.activePageIndex].scripts;
        const srcIdx = scripts.findIndex(s => s.id === sourceScriptRef.id);

        if (srcIdx > -1) {
            const [item] = scripts.splice(srcIdx, 1);
            item.drawingId = targetScript.drawingId;

            let targetIdx = scripts.findIndex(s => s.id === targetScript.id);
            if (targetIdx === -1) targetIdx = scripts.length;

            scripts.splice(targetIdx, 0, item);
        }

        uiStore.draggingConteScript = null;
        uiStore.isConteDropTarget = null;
    };

    const dropOnConteDrawing = (drawingId) => {
        const sourceScriptRef = uiStore.draggingConteScript;
        if (!sourceScriptRef) return;

        const pIdx = pageStore.activePageIndex;
        const scripts = pageStore.pages[pIdx].scripts;
        const srcIdx = scripts.findIndex(s => s.id === sourceScriptRef.id);

        if (srcIdx > -1) {
            const [item] = scripts.splice(srcIdx, 1);
            item.drawingId = drawingId;

            let insertIndex = -1;
            for (let i = scripts.length - 1; i >= 0; i--) {
                if (scripts[i].drawingId === drawingId) {
                    insertIndex = i + 1;
                    break;
                }
            }

            if (insertIndex === -1) {
                const drawings = pageStore.pages[pIdx].drawings;
                const currentDrawingIdx = drawings.findIndex(d => d.id === drawingId);
                for (let d = currentDrawingIdx - 1; d >= 0; d--) {
                    const prevDId = drawings[d].id;
                    for (let i = scripts.length - 1; i >= 0; i--) {
                        if (scripts[i].drawingId === prevDId) {
                            insertIndex = i + 1;
                            break;
                        }
                    }
                    if (insertIndex !== -1) break;
                }
            }

            if (insertIndex === -1) insertIndex = 0;
            scripts.splice(insertIndex, 0, item);
        }

        uiStore.draggingConteScript = null;
        uiStore.isConteDropTarget = null;
    };

    const dropOnConteUnassigned = () => {
        const sourceScriptRef = uiStore.draggingConteScript;
        if (!sourceScriptRef) return;

        const scripts = pageStore.pages[pageStore.activePageIndex].scripts;
        const srcIdx = scripts.findIndex(s => s.id === sourceScriptRef.id);

        if (srcIdx > -1) {
            const [item] = scripts.splice(srcIdx, 1);
            item.drawingId = null;
            scripts.push(item);
        }

        uiStore.draggingConteScript = null;
        uiStore.isConteDropTarget = null;
    };

    return {
        onHandleDown, onHandleUp,
        dragStartDrawing, dragEndDrawing, dragOverDrawing, dropOnDrawing,
        dragStartConteScript, dragEndConteScript, dragOverConteScript,
        dropOnConteScript, dropOnConteDrawing, dropOnConteUnassigned
    };
};
