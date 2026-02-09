// js/mode/plot/drag.js - Plot drag & drop
window.MangaApp = window.MangaApp || {};

window.MangaApp.createDragPlot = function (deps) {
    const pageStore = deps.pageStore;
    const uiStore = deps.uiStore;

    const dragStart = (pIndex, idx) => {
        uiStore.draggingItem = { pIndex, idx };
    };

    const dragOverScript = (pIndex, idx) => {
        if (uiStore.draggingItem.pIndex === pIndex && uiStore.draggingItem.idx === idx) {
            if (uiStore.dropTarget !== null) uiStore.dropTarget = null;
            return;
        }
        if (!uiStore.dropTarget || uiStore.dropTarget.pIndex !== pIndex || uiStore.dropTarget.idx !== idx) {
            uiStore.dropTarget = { pIndex, idx };
        }
    };

    const dragOverPage = (pIndex) => {
        if (uiStore.dropTarget && uiStore.dropTarget.pIndex === pIndex && uiStore.dropTarget.idx !== null) return;
        uiStore.dropTarget = { pIndex, idx: null };
    };

    const executeScriptMove = (targetPIndex, targetIdx) => {
        const dragInfo = uiStore.draggingItem;
        if (!dragInfo) return;

        const { pIndex: srcP, idx: srcIdx } = dragInfo;
        const srcScripts = pageStore.pages[srcP].scripts;
        const item = srcScripts[srcIdx];

        if (srcP !== targetPIndex) item.drawingId = null;

        srcScripts.splice(srcIdx, 1);

        if (targetIdx === null) {
            pageStore.pages[targetPIndex].scripts.push(item);
        } else {
            pageStore.pages[targetPIndex].scripts.splice(targetIdx, 0, item);
        }

        uiStore.draggingItem = null;
        uiStore.dropTarget = null;
    };

    const dropOnScript = (pIndex, idx) => executeScriptMove(pIndex, idx);
    const dropOnPage = (pIndex) => executeScriptMove(pIndex, null);

    const dragEnd = () => {
        uiStore.draggingItem = null;
        uiStore.dropTarget = null;
    };

    const isDropTarget = (pIndex, idx) => {
        return uiStore.dropTarget && uiStore.dropTarget.pIndex === pIndex && uiStore.dropTarget.idx === idx;
    };

    const isDragging = (pIndex, idx) => {
        return uiStore.draggingItem && uiStore.draggingItem.pIndex === pIndex && uiStore.draggingItem.idx === idx;
    };

    return {
        dragStart, dragOverScript, dragOverPage,
        dropOnScript, dropOnPage, dragEnd,
        isDropTarget, isDragging
    };
};
