// js/stores/historyStore.js - Undo/Redo履歴管理
window.MangaApp = window.MangaApp || {};
window.MangaApp.stores = window.MangaApp.stores || {};

window.MangaApp.stores.useHistoryStore = Pinia.defineStore('history', () => {
    const { ref } = Vue;

    // Cross-store dependencies (injected via setStores)
    /** @type {PageStoreInstance | null} */
    let _pageStore = null;
    /** @type {UiStoreInstance | null} */
    let _uiStore = null;
    /** @type {CanvasUtils | null} */
    let _canvasUtils = null;
    /**
     * 依存する pageStore と uiStore を注入する（循環依存回避のため setter で設定）。
     * @param {PageStoreInstance} pageStore
     * @param {UiStoreInstance} uiStore
     */
    const setStores = (pageStore, uiStore) => {
        _pageStore = pageStore;
        _uiStore = uiStore;
    };
    /**
     * canvasUtils を注入する（循環依存回避のため setter で設定）。
     * @param {CanvasUtils} canvasUtils
     */
    const setCanvasUtils = (canvasUtils) => {
        _canvasUtils = canvasUtils;
    };

    // --- Name mode history（名前モードの Undo/Redo）---
    /** ページ状態の JSON スナップショット配列（最大50件）。 */
    /** @type {VueRef<string[]>} */
    const nameHistory = ref([]);
    /** 現在の historyIndex（-1 = 空）。 */
    /** @type {VueRef<number>} */
    const nameHistoryIndex = ref(-1);

    /**
     * 名前モードの現在のページ状態を履歴に記録する。
     * 名前モード以外では何もしない。
     * 現在位置より後ろにある redo ブランチを削除してから追加する。
     * 直前のスナップショットと同一内容の場合は記録しない（重複防止）。
     * 履歴が50件を超えると最古のエントリを削除する。
     */
    const recordNameHistory = () => {
        if (_pageStore.currentMode !== 'name') return;

        // redo ブランチを削除
        if (nameHistoryIndex.value < nameHistory.value.length - 1) {
            nameHistory.value = nameHistory.value.slice(0, nameHistoryIndex.value + 1);
        }

        const snapshot = JSON.stringify(_pageStore.pages);
        // 直前と同じ内容なら記録しない
        if (nameHistory.value.length > 0 && nameHistory.value[nameHistory.value.length - 1] === snapshot) {
            return;
        }

        nameHistory.value.push(snapshot);
        nameHistoryIndex.value++;

        // 上限超過時は最古エントリを削除してインデックスを補正
        if (nameHistory.value.length > 50) {
            nameHistory.value.shift();
            nameHistoryIndex.value--;
        }
    };

    /**
     * 名前モードを1手順前の状態に戻す（Undo）。
     * historyIndex が 0 の場合（最初のスナップショット）は何もしない。
     */
    const undoName = () => {
        if (nameHistoryIndex.value > 0) {
            nameHistoryIndex.value--;
            try {
                _pageStore.pages = JSON.parse(nameHistory.value[nameHistoryIndex.value]);
            } catch (e) { console.error(e); }
        }
    };

    /**
     * 名前モードを1手順後の状態に進める（Redo）。
     * historyIndex が末尾の場合は何もしない。
     */
    const redoName = () => {
        if (nameHistoryIndex.value < nameHistory.value.length - 1) {
            nameHistoryIndex.value++;
            try {
                _pageStore.pages = JSON.parse(nameHistory.value[nameHistoryIndex.value]);
            } catch (e) { console.error(e); }
        }
    };

    /**
     * 名前モードの Undo/Redo 履歴を全消去する。
     * プロジェクト読み込み時など、履歴をリセットしたいときに呼ぶ。
     */
    const resetNameHistory = () => {
        nameHistory.value = [];
        nameHistoryIndex.value = -1;
    };

    // --- Drawing canvas history（Canvas 描画の Undo/Redo）---
    /**
     * 指定 Drawing の現在の Canvas 状態を履歴に保存する。
     * モーダルが開いていればモーダル Canvas を、そうでなければ通常の Canvas を使う。
     * @param {Drawing} drawing
     */
    const saveHistory = (drawing) => {
        const canvas = _uiStore.showDrawingModal ? _uiStore.modalCanvasRef : _uiStore.canvasRefs[drawing.id];
        if (!canvas) return;

        canvas.toBlob(blob => {
            _canvasUtils.pushDrawingHistory(drawing, blob);

            // モーダルが開いていて同じ Drawing を編集中なら、参照を更新して Vue の reactivity を維持する
            if (_uiStore.showDrawingModal && _uiStore.currentEditingDrawing?.id === drawing.id) {
                _uiStore.currentEditingDrawing = { ...drawing };
            }
        });
    };

    /**
     * 指定の blob URL から画像を読み込み、Canvas に描画する。
     * targetCanvas が指定されていなければ、モーダルまたは通常の Canvas を自動選択する。
     * @param {Drawing} drawing
     * @param {string} url
     * @param {HTMLCanvasElement | null} [targetCanvas]
     */
    const drawToCanvas = (drawing, url, targetCanvas = null) => {
        const canvas = targetCanvas || (_uiStore.showDrawingModal ? _uiStore.modalCanvasRef : _uiStore.canvasRefs[drawing.id]);
        if (!canvas) {
            console.error("Canvas not found for drawing:", drawing.id);
            return;
        }
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // 白背景で塗りつぶしてから描画（透明部分が黒くなるのを防ぐ）
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
        };
        img.src = url;
    };

    /**
     * Drawing の描画を1手順前の状態に戻す（Undo）。
     * historyStep が 0 以下の場合は何もしない。
     * @param {Drawing} drawing
     */
    const undo = (drawing) => {
        if (!drawing || drawing.historyStep <= 0) return;
        drawing.historyStep--;
        const prevUrl = drawing.history[drawing.historyStep];
        drawing.imgSrc = prevUrl;
        drawToCanvas(drawing, prevUrl);
    };

    /**
     * Drawing の描画を1手順後の状態に進める（Redo）。
     * historyStep が末尾の場合は何もしない。
     * @param {Drawing} drawing
     */
    const redo = (drawing) => {
        if (!drawing || !drawing.history || drawing.historyStep >= drawing.history.length - 1) return;
        drawing.historyStep++;
        const nextUrl = drawing.history[drawing.historyStep];
        drawing.imgSrc = nextUrl;
        drawToCanvas(drawing, nextUrl);
    };

    /**
     * Undo が可能かどうかを返す。
     * historyStep が 1 以上であれば Undo 可能。
     * @param {Drawing} drawing @returns {boolean}
     */
    const canUndo = (drawing) => {
        return drawing && drawing.history && drawing.history.length > 1 && drawing.historyStep > 0;
    };

    /**
     * Redo が可能かどうかを返す。
     * historyStep が末尾より前であれば Redo 可能。
     * @param {Drawing} drawing @returns {boolean}
     */
    const canRedo = (drawing) => {
        return drawing && drawing.history && drawing.historyStep < drawing.history.length - 1;
    };

    return {
        nameHistory, nameHistoryIndex,
        setStores, setCanvasUtils,
        recordNameHistory, undoName, redoName, resetNameHistory,
        saveHistory, drawToCanvas, undo, redo, canUndo, canRedo
    };
});
