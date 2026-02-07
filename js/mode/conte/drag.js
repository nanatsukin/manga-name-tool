// js/mode/conte/drag.js - Conte drag & drop (drawings + scripts)
window.MangaApp = window.MangaApp || {};

window.MangaApp.createDragConte = function (deps) {
    const state = deps.state;
    const canvas = deps.canvas;

    // Drawing drag handle
    const onHandleDown = () => { state.isDrawingDragReady.value = true; };
    const onHandleUp = () => { state.isDrawingDragReady.value = false; };

    // Drawing D&D
    const dragStartDrawing = (e, idx) => {
        if (!state.isDrawingDragReady.value) {
            e.preventDefault();
            return;
        }
        state.draggingDrawingIndex.value = idx;
    };

    const dragEndDrawing = () => {
        state.draggingDrawingIndex.value = null;
        state.dropTargetDrawingIndex.value = null;
        state.isDrawingDragReady.value = false;
    };

    const dragOverDrawing = (idx) => {
        if (state.draggingDrawingIndex.value === null) return;
        if (state.draggingDrawingIndex.value === idx) return;
        if (state.dropTargetDrawingIndex.value !== idx) state.dropTargetDrawingIndex.value = idx;
    };

    const dropOnDrawing = async (targetIdx) => {
        const srcIdx = state.draggingDrawingIndex.value;
        if (srcIdx === null) return;

        const page = state.pages.value[state.activePageIndex.value];
        await Promise.all(page.drawings.map(d => {
            const cvs = state.canvasRefs.value[d.id];
            if (cvs) {
                return new Promise(resolve => {
                    cvs.toBlob(blob => {
                        const isUsedInHistory = d.history && d.history.includes(d.imgSrc);
                        if (d.imgSrc && d.imgSrc.startsWith('blob:') && !isUsedInHistory) URL.revokeObjectURL(d.imgSrc);
                        d.imgSrc = URL.createObjectURL(blob);
                        d.cachedBlob = blob;
                        resolve();
                    });
                });
            }
            return Promise.resolve();
        }));

        const drawings = state.pages.value[state.activePageIndex.value].drawings;
        const item = drawings.splice(srcIdx, 1)[0];
        drawings.splice(targetIdx, 0, item);

        dragEndDrawing();
        canvas.restoreAllCanvases();
    };

    // Conte script D&D
    const dragStartConteScript = (e, script) => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.dropEffect = 'move';
        e.dataTransfer.setData('text/plain', script.id);
        state.draggingConteScript.value = script;
    };

    const dragEndConteScript = () => {
        state.draggingConteScript.value = null;
        state.isConteDropTarget.value = null;
    };

    const dragOverConteScript = (targetId) => {
        if (state.draggingDrawingIndex.value !== null) return;
        if (!state.draggingConteScript.value) return;
        if (state.isConteDropTarget.value !== targetId) state.isConteDropTarget.value = targetId;
    };

    const dropOnConteScript = (targetScript) => {
        const sourceScriptRef = state.draggingConteScript.value;
        if (!sourceScriptRef || sourceScriptRef.id === targetScript.id) return;

        const scripts = state.pages.value[state.activePageIndex.value].scripts;
        const srcIdx = scripts.findIndex(s => s.id === sourceScriptRef.id);

        if (srcIdx > -1) {
            const [item] = scripts.splice(srcIdx, 1);
            item.drawingId = targetScript.drawingId;

            let targetIdx = scripts.findIndex(s => s.id === targetScript.id);
            if (targetIdx === -1) targetIdx = scripts.length;

            scripts.splice(targetIdx, 0, item);
        }

        state.draggingConteScript.value = null;
        state.isConteDropTarget.value = null;
    };

    const dropOnConteDrawing = (drawingId) => {
        const sourceScriptRef = state.draggingConteScript.value;
        if (!sourceScriptRef) return;

        const pIdx = state.activePageIndex.value;
        const scripts = state.pages.value[pIdx].scripts;
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
                const drawings = state.pages.value[pIdx].drawings;
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

        state.draggingConteScript.value = null;
        state.isConteDropTarget.value = null;
    };

    const dropOnConteUnassigned = () => {
        const sourceScriptRef = state.draggingConteScript.value;
        if (!sourceScriptRef) return;

        const scripts = state.pages.value[state.activePageIndex.value].scripts;
        const srcIdx = scripts.findIndex(s => s.id === sourceScriptRef.id);

        if (srcIdx > -1) {
            const [item] = scripts.splice(srcIdx, 1);
            item.drawingId = null;
            scripts.push(item);
        }

        state.draggingConteScript.value = null;
        state.isConteDropTarget.value = null;
    };

    return {
        onHandleDown, onHandleUp,
        dragStartDrawing, dragEndDrawing, dragOverDrawing, dropOnDrawing,
        dragStartConteScript, dragEndConteScript, dragOverConteScript,
        dropOnConteScript, dropOnConteDrawing, dropOnConteUnassigned
    };
};
