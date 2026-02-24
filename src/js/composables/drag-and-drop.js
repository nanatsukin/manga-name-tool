// js/composables/drag-and-drop.js - 配列移動 + ポインタリスナー管理
window.MangaApp = window.MangaApp || {};

/** @type {DndUtils} */
window.MangaApp.dndUtils = {
    /**
     * @param {any[]} array
     * @param {number} fromIndex
     * @param {number} toIndex
     */
    arrayMove(array, fromIndex, toIndex) {
        const [item] = array.splice(fromIndex, 1);
        array.splice(toIndex, 0, item);
    },

    /**
     * @param {(e: Event) => void} moveHandler
     * @param {(e: Event) => void} endHandler
     */
    addPointerListeners(moveHandler, endHandler) {
        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('touchmove', moveHandler, { passive: false });
        document.addEventListener('mouseup', endHandler);
        document.addEventListener('touchend', endHandler);
    },

    /**
     * @param {((e: Event) => void) | ((e: Event) => void)[]} moveHandlers
     * @param {(e: Event) => void} endHandler
     */
    removePointerListeners(moveHandlers, endHandler) {
        if (!Array.isArray(moveHandlers)) moveHandlers = [moveHandlers];
        moveHandlers.forEach(handler => {
            document.removeEventListener('mousemove', handler);
            document.removeEventListener('touchmove', handler);
        });
        document.removeEventListener('mouseup', endHandler);
        document.removeEventListener('touchend', endHandler);
    }
};
