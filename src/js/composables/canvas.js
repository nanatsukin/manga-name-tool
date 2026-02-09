// js/composables/canvas.js - Canvas Blob管理 + 描画履歴
window.MangaApp = window.MangaApp || {};

window.MangaApp.canvasUtils = {
    // canvasをBlobに変換し、drawing.imgSrc と drawing.cachedBlob を更新
    // 旧blob URLは履歴内にない場合のみ revoke する
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

    // 描画履歴の push (初期化・未来切り捨て・step更新を一括処理)
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

    // drawing.history と drawing.historyStep を imgSrc有無に応じて初期化
    initDrawingHistory(drawing) {
        drawing.history = drawing.imgSrc ? [drawing.imgSrc] : [];
        drawing.historyStep = drawing.imgSrc ? 0 : -1;
    }
};
