// js/mode/plot/drag.js - プロットモードのセリフ並び替え Drag & Drop
window.MangaApp = window.MangaApp || {};

/** @param {DragPlotDeps} deps @returns {DragPlotInstance} */
window.MangaApp.createDragPlot = function (deps) {
    /** @type {PageStoreInstance} */
    const pageStore = deps.pageStore;
    /** @type {UiStoreInstance} */
    const uiStore = deps.uiStore;

    /**
     * セリフのドラッグを開始する。draggingItem に元の位置を記録する。
     * @param {number} pIndex ページインデックス
     * @param {number} idx セリフインデックス
     */
    const dragStart = (pIndex, idx) => {
        uiStore.draggingItem = { pIndex, idx };
    };

    /**
     * セリフの上にドラッグオーバーしたときの処理。
     * ドラッグ元と同じセリフの場合は dropTarget をクリアする。
     * @param {number} pIndex
     * @param {number} idx
     */
    const dragOverScript = (pIndex, idx) => {
        if (uiStore.draggingItem.pIndex === pIndex && uiStore.draggingItem.idx === idx) {
            if (uiStore.dropTarget !== null) uiStore.dropTarget = null;
            return;
        }
        if (!uiStore.dropTarget || uiStore.dropTarget.pIndex !== pIndex || uiStore.dropTarget.idx !== idx) {
            uiStore.dropTarget = { pIndex, idx };
        }
    };

    /**
     * ページ全体の上にドラッグオーバーしたときの処理。
     * idx: null はページ末尾へのドロップを示す。
     * @param {number} pIndex
     */
    const dragOverPage = (pIndex) => {
        if (uiStore.dropTarget && uiStore.dropTarget.pIndex === pIndex && uiStore.dropTarget.idx !== null) return;
        uiStore.dropTarget = { pIndex, idx: null };
    };

    /**
     * セリフを移動する共通処理。
     * 別ページへの移動時は drawingId をリセットして Conte との紐付けを解除する。
     * targetIdx が null の場合はページ末尾に追加する。
     * @param {number} targetPIndex 移動先ページインデックス
     * @param {number | null} targetIdx 移動先セリフインデックス（null: 末尾）
     */
    const executeScriptMove = (targetPIndex, targetIdx) => {
        const dragInfo = uiStore.draggingItem;
        if (!dragInfo) return;

        const { pIndex: srcP, idx: srcIdx } = dragInfo;
        const srcScripts = pageStore.pages[srcP].scripts;
        const item = srcScripts[srcIdx];

        // 別ページへの移動時はコマとの紐付けを解除
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

    /**
     * 別のセリフの上にドロップしたときの処理。そのセリフの位置に挿入する。
     * @param {number} pIndex
     * @param {number} idx
     */
    const dropOnScript = (pIndex, idx) => executeScriptMove(pIndex, idx);

    /**
     * ページ全体（セリフなしの領域）にドロップしたときの処理。ページ末尾に追加する。
     * @param {number} pIndex
     */
    const dropOnPage = (pIndex) => executeScriptMove(pIndex, null);

    /**
     * ドラッグ操作が完了・キャンセルされたときの後処理。draggingItem と dropTarget をリセットする。
     */
    const dragEnd = () => {
        uiStore.draggingItem = null;
        uiStore.dropTarget = null;
    };

    /**
     * 指定セリフが現在のドロップターゲットかどうかを返す（スタイル用）。
     * @param {number} pIndex @param {number} idx @returns {boolean}
     */
    const isDropTarget = (pIndex, idx) => {
        return uiStore.dropTarget && uiStore.dropTarget.pIndex === pIndex && uiStore.dropTarget.idx === idx;
    };

    /**
     * 指定セリフが現在ドラッグ中かどうかを返す（スタイル用）。
     * @param {number} pIndex @param {number} idx @returns {boolean}
     */
    const isDragging = (pIndex, idx) => {
        return uiStore.draggingItem && uiStore.draggingItem.pIndex === pIndex && uiStore.draggingItem.idx === idx;
    };

    return {
        dragStart, dragOverScript, dragOverPage,
        dropOnScript, dropOnPage, dragEnd,
        isDropTarget, isDragging
    };
};
