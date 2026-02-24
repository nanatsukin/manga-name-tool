// js/composables/canvas.js - Canvas Blob管理 + 描画履歴
window.MangaApp = window.MangaApp || {};

/** @type {CanvasUtils} */
window.MangaApp.canvasUtils = {
    /**
     * Canvas の内容を Blob に変換して drawing に保存する。
     * 古い blob URL をリーク防止のため revoke する（undo 履歴内の URL は除く）。
     * @param {HTMLCanvasElement} canvasEl
     * @param {Drawing} drawing
     * @returns {Promise<void>}
     */
    saveDrawingBlob(canvasEl, drawing) {
        return new Promise(resolve => {
            canvasEl.toBlob(blob => {
                // 古い imgSrc が blob URL で、かつ undo 履歴に含まれない場合は revoke してメモリを解放
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
     * 描画履歴（undo/redo スタック）に新しい Blob を追加する。
     * 現在の historyStep より後ろの履歴は破棄してから追加する（redo ブランチの削除）。
     * @param {Drawing} drawing
     * @param {Blob} blob
     * @returns {string} 追加した blob URL
     */
    pushDrawingHistory(drawing, blob) {
        const HISTORY_LIMIT = 20;
        const url = URL.createObjectURL(blob);
        if (!drawing.history) drawing.history = [];
        if (drawing.historyStep === undefined) drawing.historyStep = -1;

        // 現在位置より後ろに残っている redo 用履歴を revoke してから削除
        if (drawing.historyStep < drawing.history.length - 1) {
            const discarded = drawing.history.slice(drawing.historyStep + 1);
            discarded.forEach(u => URL.revokeObjectURL(u));
            drawing.history = drawing.history.slice(0, drawing.historyStep + 1);
        }

        drawing.history.push(url);
        drawing.historyStep++;
        drawing.imgSrc = url;
        drawing.cachedBlob = blob;

        // 上限超過時: 最古エントリを revoke して削除（現在表示中の URL は revoke しない）
        if (drawing.history.length > HISTORY_LIMIT) {
            const dropped = drawing.history.shift();
            drawing.historyStep--;
            if (dropped !== drawing.imgSrc) URL.revokeObjectURL(dropped);
        }

        return url;
    },

    /**
     * drawing の履歴を初期化する。
     * 既存の imgSrc がある場合はそれを先頭エントリとして設定する。
     * @param {Drawing} drawing @returns {void}
     */
    initDrawingHistory(drawing) {
        drawing.history = drawing.imgSrc ? [drawing.imgSrc] : [];
        drawing.historyStep = drawing.imgSrc ? 0 : -1;
    }
};
