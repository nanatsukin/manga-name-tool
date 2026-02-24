// js/mode/plot/drag.js - Plot drag & drop
window.MangaApp = window.MangaApp || {};

/** @param {DragPlotDeps} deps @returns {DragPlotInstance} */
window.MangaApp.createDragPlot = function (deps) {
    /** @type {PageStoreInstance} */
    const pageStore = deps.pageStore;
    /** @type {UiStoreInstance} */
    const uiStore = deps.uiStore;

    /** @param {number} pIndex @param {number} idx */
    const dragStart = (pIndex, idx) => {
        uiStore.draggingItem = { pIndex, idx };
    };

    /** @param {number} pIndex @param {number} idx */
    const dragOverScript = (pIndex, idx) => {
        if (uiStore.draggingItem.pIndex === pIndex && uiStore.draggingItem.idx === idx) {
            if (uiStore.dropTarget !== null) uiStore.dropTarget = null;
            return;
        }
        if (!uiStore.dropTarget || uiStore.dropTarget.pIndex !== pIndex || uiStore.dropTarget.idx !== idx) {
            uiStore.dropTarget = { pIndex, idx };
        }
    };

    /** @param {number} pIndex */
    const dragOverPage = (pIndex) => {
        if (uiStore.dropTarget && uiStore.dropTarget.pIndex === pIndex && uiStore.dropTarget.idx !== null) return;
        uiStore.dropTarget = { pIndex, idx: null };
    };

    /** @param {number} targetPIndex @param {number | null} targetIdx */
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

    /** @param {number} pIndex @param {number} idx */
    const dropOnScript = (pIndex, idx) => executeScriptMove(pIndex, idx);
    /** @param {number} pIndex */
    const dropOnPage = (pIndex) => executeScriptMove(pIndex, null);

    const dragEnd = () => {
        uiStore.draggingItem = null;
        uiStore.dropTarget = null;
    };

    /** @param {number} pIndex @param {number} idx @returns {boolean} */
    const isDropTarget = (pIndex, idx) => {
        return uiStore.dropTarget && uiStore.dropTarget.pIndex === pIndex && uiStore.dropTarget.idx === idx;
    };

    /** @param {number} pIndex @param {number} idx @returns {boolean} */
    const isDragging = (pIndex, idx) => {
        return uiStore.draggingItem && uiStore.draggingItem.pIndex === pIndex && uiStore.draggingItem.idx === idx;
    };

    return {
        dragStart, dragOverScript, dragOverPage,
        dropOnScript, dropOnPage, dragEnd,
        isDropTarget, isDragging
    };
};
