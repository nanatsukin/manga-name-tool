// js/mode/plot/drag.js - Plot drag & drop
window.MangaApp = window.MangaApp || {};

window.MangaApp.createDragPlot = function (deps) {
    const state = deps.state;

    const dragStart = (pIndex, idx) => {
        state.draggingItem.value = { pIndex, idx };
    };

    const dragOverScript = (pIndex, idx) => {
        if (state.draggingItem.value.pIndex === pIndex && state.draggingItem.value.idx === idx) {
            if (state.dropTarget.value !== null) state.dropTarget.value = null;
            return;
        }
        if (!state.dropTarget.value || state.dropTarget.value.pIndex !== pIndex || state.dropTarget.value.idx !== idx) {
            state.dropTarget.value = { pIndex, idx };
        }
    };

    const dragOverPage = (pIndex) => {
        if (state.dropTarget.value && state.dropTarget.value.pIndex === pIndex && state.dropTarget.value.idx !== null) return;
        state.dropTarget.value = { pIndex, idx: null };
    };

    const executeScriptMove = (targetPIndex, targetIdx) => {
        const dragInfo = state.draggingItem.value;
        if (!dragInfo) return;

        const { pIndex: srcP, idx: srcIdx } = dragInfo;
        const srcScripts = state.pages.value[srcP].scripts;
        const item = srcScripts[srcIdx];

        if (srcP !== targetPIndex) item.drawingId = null;

        srcScripts.splice(srcIdx, 1);

        if (targetIdx === null) {
            state.pages.value[targetPIndex].scripts.push(item);
        } else {
            state.pages.value[targetPIndex].scripts.splice(targetIdx, 0, item);
        }

        state.draggingItem.value = null;
        state.dropTarget.value = null;
    };

    const dropOnScript = (pIndex, idx) => executeScriptMove(pIndex, idx);
    const dropOnPage = (pIndex) => executeScriptMove(pIndex, null);

    const dragEnd = () => {
        state.draggingItem.value = null;
        state.dropTarget.value = null;
    };

    const isDropTarget = (pIndex, idx) => {
        return state.dropTarget.value && state.dropTarget.value.pIndex === pIndex && state.dropTarget.value.idx === idx;
    };

    const isDragging = (pIndex, idx) => {
        return state.draggingItem.value && state.draggingItem.value.pIndex === pIndex && state.draggingItem.value.idx === idx;
    };

    return {
        dragStart, dragOverScript, dragOverPage,
        dropOnScript, dropOnPage, dragEnd,
        isDropTarget, isDragging
    };
};
