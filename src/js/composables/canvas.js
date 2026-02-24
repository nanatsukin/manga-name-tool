// js/composables/canvas.js - Canvas Blob管理 + 描画履歴
window.MangaApp = window.MangaApp || {};

/** @type {CanvasUtils} */
window.MangaApp.canvasUtils = {
    /**
     * @param {HTMLCanvasElement} canvasEl
     * @param {Drawing} drawing
     * @returns {Promise<void>}
     */
    saveDrawingBlob(canvasEl, drawing) {
        return new Promise(resolve => {
            canvasEl.toBlob(blob => {
                const isUsedInHistory = drawing.history && drawing.history.includes(drawing.imgSrc);
                if (drawing.imgSrc && drawing.imgSrc.startsWith('blob:') && !isUsedInHistory) {
                    URL.revokeObjectURL(drawing.imgSrc);
                }
                drawing.imgSrc = URL.createObjectURL(blob);
                drawing.cachedBlob = blob;
                resolve();
            });
        });
    },

    /**
     * @param {Drawing} drawing
     * @param {Blob} blob
     * @returns {string}
     */
    pushDrawingHistory(drawing, blob) {
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
        return url;
    },

    /** @param {Drawing} drawing @returns {void} */
    initDrawingHistory(drawing) {
        drawing.history = drawing.imgSrc ? [drawing.imgSrc] : [];
        drawing.historyStep = drawing.imgSrc ? 0 : -1;
    }
};
