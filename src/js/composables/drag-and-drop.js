// js/composables/drag-and-drop.js - 配列移動 + ポインタリスナー管理
window.MangaApp = window.MangaApp || {};

window.MangaApp.dndUtils = {
    // 配列要素の移動 (in-place)
    arrayMove(array, fromIndex, toIndex) {
        const [item] = array.splice(fromIndex, 1);
        array.splice(toIndex, 0, item);
    },

    // document に mousemove/touchmove/mouseup/touchend を一括登録
    addPointerListeners(moveHandler, endHandler) {
        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('touchmove', moveHandler, { passive: false });
        document.addEventListener('mouseup', endHandler);
        document.addEventListener('touchend', endHandler);
    },

    // 指定した moveHandler/endHandler を一括解除
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
