// js/mode/conte/drag.js - コンテモードの Drawing/Script Drag & Drop
window.MangaApp = window.MangaApp || {};

/** @param {DragConteDeps} deps @returns {DragConteInstance} */
window.MangaApp.createDragConte = function (deps) {
    /** @type {PageStoreInstance} */
    const pageStore = deps.pageStore;
    /** @type {UiStoreInstance} */
    const uiStore = deps.uiStore;
    /** @type {CanvasModuleInstance} */
    const canvas = deps.canvas;
    /** @type {CanvasUtils} */
    const canvasUtils = deps.canvasUtils;
    /** @type {DndUtils} */
    const dndUtils = deps.dndUtils;

    /**
     * Drawing の並び替えハンドルが押下されたときの処理。
     * ハンドルを押した状態のみドラッグを許可するために isDrawingDragReady フラグを立てる。
     */
    const onHandleDown = () => { uiStore.isDrawingDragReady = true; };

    /**
     * Drawing の並び替えハンドルが離されたときの処理。
     * ドラッグ準備フラグをリセットする。
     */
    const onHandleUp = () => { uiStore.isDrawingDragReady = false; };

    /**
     * Drawing の並び替えドラッグを開始する。
     * ハンドルを経由せずに dragstart が発火した場合はキャンセルする。
     * @param {DragEvent} e
     * @param {number} idx ドラッグ元の Drawing インデックス
     */
    const dragStartDrawing = (e, idx) => {
        if (!uiStore.isDrawingDragReady) {
            e.preventDefault();
            return;
        }
        uiStore.draggingDrawingIndex = idx;
    };

    /**
     * Drawing のドラッグ終了・キャンセル時の後処理。
     * 各種ドラッグ状態フラグをリセットする。
     */
    const dragEndDrawing = () => {
        uiStore.draggingDrawingIndex = null;
        uiStore.dropTargetDrawingIndex = null;
        uiStore.isDrawingDragReady = false;
    };

    /**
     * Drawing の上にドラッグオーバーしたときの処理。
     * ドラッグ元と同じ Drawing の場合はスキップする。
     * @param {number} idx ドラッグオーバー中の Drawing インデックス
     */
    const dragOverDrawing = (idx) => {
        if (uiStore.draggingDrawingIndex === null) return;
        if (uiStore.draggingDrawingIndex === idx) return;
        if (uiStore.dropTargetDrawingIndex !== idx) uiStore.dropTargetDrawingIndex = idx;
    };

    /**
     * Drawing を別の位置にドロップして並び替える。
     * 並び替え前に全 Canvas を保存し、並び替え後に Canvas を復元する。
     * @param {number} targetIdx ドロップ先の Drawing インデックス
     * @returns {Promise<void>}
     */
    const dropOnDrawing = async (targetIdx) => {
        const srcIdx = uiStore.draggingDrawingIndex;
        if (srcIdx === null) return;

        const page = pageStore.pages[pageStore.activePageIndex];

        // 並び替えの前に全 Drawing の Canvas 内容を保存する（並び替え後の復元のため）
        await Promise.all(page.drawings.map(d => {
            const cvs = uiStore.canvasRefs[d.id];
            if (cvs) return canvasUtils.saveDrawingBlob(cvs, d);
            return Promise.resolve();
        }));

        dndUtils.arrayMove(page.drawings, srcIdx, targetIdx);

        dragEndDrawing();
        // 並び替え後の新しい順序で Canvas を再描画する
        canvas.restoreAllCanvases();
    };

    /**
     * コンテモードでセリフのドラッグを開始する。
     * HTML5 Drag & Drop API を使用。セリフ ID を dataTransfer に設定する。
     * @param {DragEvent} e
     * @param {Script} script ドラッグするセリフ
     */
    const dragStartConteScript = (e, script) => {
        e.stopPropagation();
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.dropEffect = 'move';
            e.dataTransfer.setData('text/plain', String(script.id));
        }
        uiStore.draggingConteScript = script;
    };

    /**
     * セリフのドラッグ終了・キャンセル時の後処理。
     */
    const dragEndConteScript = () => {
        uiStore.draggingConteScript = null;
        uiStore.isConteDropTarget = null;
    };

    /**
     * 別のセリフの上にドラッグオーバーしたときの処理。
     * Drawing のドラッグ中はセリフのドラッグ処理をスキップする。
     * @param {number} targetId ドラッグオーバー中のセリフ ID
     */
    const dragOverConteScript = (targetId) => {
        if (uiStore.draggingDrawingIndex !== null) return;
        if (!uiStore.draggingConteScript) return;
        if (uiStore.isConteDropTarget !== targetId) uiStore.isConteDropTarget = targetId;
    };

    /**
     * 別のセリフの上にドロップして並び替える。
     * ドロップ先セリフと同じ drawingId に変更し、ドロップ先の直前に挿入する。
     * @param {Script} targetScript ドロップ先のセリフ
     */
    const dropOnConteScript = (targetScript) => {
        const sourceScriptRef = uiStore.draggingConteScript;
        if (!sourceScriptRef || sourceScriptRef.id === targetScript.id) return;

        const scripts = pageStore.pages[pageStore.activePageIndex].scripts;
        const srcIdx = scripts.findIndex(s => s.id === sourceScriptRef.id);

        if (srcIdx > -1) {
            const [item] = scripts.splice(srcIdx, 1);
            // ドロップ先セリフと同じコマ（Drawing）に紐付ける
            item.drawingId = targetScript.drawingId;

            let targetIdx = scripts.findIndex(s => s.id === targetScript.id);
            if (targetIdx === -1) targetIdx = scripts.length;

            scripts.splice(targetIdx, 0, item);
        }

        uiStore.draggingConteScript = null;
        uiStore.isConteDropTarget = null;
    };

    /**
     * Drawing（コマ）の上にセリフをドロップして紐付ける。
     * そのコマの最後のセリフの後に挿入する。
     * 同コマのセリフがない場合は、Drawing の順序（前のコマの最後）を参照して挿入位置を決める。
     * @param {number} drawingId ドロップ先 Drawing の ID
     */
    const dropOnConteDrawing = (drawingId) => {
        const sourceScriptRef = uiStore.draggingConteScript;
        if (!sourceScriptRef) return;

        const pIdx = pageStore.activePageIndex;
        const scripts = pageStore.pages[pIdx].scripts;
        const srcIdx = scripts.findIndex(s => s.id === sourceScriptRef.id);

        if (srcIdx > -1) {
            const [item] = scripts.splice(srcIdx, 1);
            item.drawingId = drawingId;

            // 同じコマに既に紐付いているセリフの末尾に挿入する位置を探す
            let insertIndex = -1;
            for (let i = scripts.length - 1; i >= 0; i--) {
                if (scripts[i].drawingId === drawingId) {
                    insertIndex = i + 1;
                    break;
                }
            }

            // 同コマのセリフが見つからない場合は、前のコマのセリフの末尾を基準にする
            if (insertIndex === -1) {
                const drawings = pageStore.pages[pIdx].drawings;
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

            // 適切な挿入位置が見つからない場合は先頭に挿入する
            if (insertIndex === -1) insertIndex = 0;
            scripts.splice(insertIndex, 0, item);
        }

        uiStore.draggingConteScript = null;
        uiStore.isConteDropTarget = null;
    };

    /**
     * 「未割り当て」領域にセリフをドロップして Drawing との紐付けを解除する。
     * セリフをページの末尾（未割り当てリストの末尾）に移動する。
     */
    const dropOnConteUnassigned = () => {
        const sourceScriptRef = uiStore.draggingConteScript;
        if (!sourceScriptRef) return;

        const scripts = pageStore.pages[pageStore.activePageIndex].scripts;
        const srcIdx = scripts.findIndex(s => s.id === sourceScriptRef.id);

        if (srcIdx > -1) {
            const [item] = scripts.splice(srcIdx, 1);
            item.drawingId = null;  // コマとの紐付けを解除
            scripts.push(item);     // ページ末尾（未割り当てリスト末尾）に追加
        }

        uiStore.draggingConteScript = null;
        uiStore.isConteDropTarget = null;
    };

    return {
        onHandleDown, onHandleUp,
        dragStartDrawing, dragEndDrawing, dragOverDrawing, dropOnDrawing,
        dragStartConteScript, dragEndConteScript, dragOverConteScript,
        dropOnConteScript, dropOnConteDrawing, dropOnConteUnassigned
    };
};
