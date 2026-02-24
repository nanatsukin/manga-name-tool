// js/mode/conte/canvas.js - コンテモードの Canvas 描画・モーダル・保存・復元
window.MangaApp = window.MangaApp || {};

/** @param {CanvasModuleDeps} deps @returns {CanvasModuleInstance} */
window.MangaApp.createCanvas = function (deps) {
    const { nextTick } = deps.Vue;
    /** @type {PageStoreInstance} */
    const pageStore = deps.pageStore;
    /** @type {UiStoreInstance} */
    const uiStore = deps.uiStore;
    /** @type {HistoryStoreInstance} */
    const historyStore = deps.historyStore;
    /** @type {HelpersInstance} */
    const helpers = deps.helpers;
    /** @type {CanvasUtils} */
    const canvasUtils = deps.canvasUtils;

    /**
     * Canvas の 2D コンテキストを WeakMap でキャッシュして返す。
     * mousemove 毎に getContext('2d') を呼ぶコストを削減する。
     * WeakMap を使うため Canvas が GC されると自動的にエントリも消える。
     * @type {WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>}
     */
    const _ctxCache = new WeakMap();
    /** @param {HTMLCanvasElement} canvas @returns {CanvasRenderingContext2D} */
    const getCtx = (canvas) => {
        let ctx = _ctxCache.get(canvas);
        if (!ctx) {
            ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
            _ctxCache.set(canvas, ctx);
        }
        return ctx;
    };

    /**
     * 全ページの全 Drawing の Canvas 内容を Blob として保存する。
     * モード切替前やエクスポート前に呼び出して、描画データを imgSrc/cachedBlob に確定させる。
     * @returns {Promise<void>}
     */
    const saveAllCanvases = async () => {
        /** @type {Promise<void>[]} */
        const promises = [];
        pageStore.pages.forEach(page => {
            page.drawings.forEach(d => {
                const cvs = uiStore.canvasRefs[d.id];
                if (cvs) promises.push(canvasUtils.saveDrawingBlob(cvs, d));
            });
        });
        await Promise.all(promises);
    };

    /**
     * アクティブページの全 Drawing の Canvas に imgSrc から画像を復元する。
     * Canvas 要素が DOM に追加されるまで最大10回（50ms間隔）リトライする。
     * ページ遷移やモード切替後に呼び出す。
     */
    const restoreAllCanvases = async () => {
        await nextTick();

        // Canvas 要素が DOM に存在するか確認しながらリトライする
        const tryRestore = (count = 0) => {
            const pageData = pageStore.pages[pageStore.activePageIndex];
            if (!pageData) return;

            let allDone = true;
            pageData.drawings.forEach(d => {
                if (d.imgSrc && uiStore.canvasRefs[d.id]) {
                    // Canvas 要素が存在する → 描画を復元
                    historyStore.drawToCanvas(d, d.imgSrc);
                } else if (d.imgSrc && !uiStore.canvasRefs[d.id]) {
                    // imgSrc はあるが Canvas 要素がまだ存在しない → リトライ対象
                    allDone = false;
                }
            });

            // 未完了の描画があり、リトライ上限に達していなければ 50ms 後に再試行
            if (!allDone && count < 10) {
                setTimeout(() => tryRestore(count + 1), 50);
            }
        };
        tryRestore();
    };

    /**
     * 描画モーダルを開く。モーダルを開く前に全 Canvas を保存し、
     * モーダル Canvas に既存の描画内容を読み込む。
     * @param {Drawing} drawing @returns {Promise<void>}
     */
    const openDrawingModal = async (drawing) => {
        // モーダルを開く前に現在の Canvas 状態を保存する
        await saveAllCanvases();
        uiStore.currentEditingDrawing = drawing;
        uiStore.showDrawingModal = true;

        await nextTick();

        const canvas = uiStore.modalCanvasRef;
        if (canvas && drawing.imgSrc) {
            // 既存の描画内容をモーダル Canvas に転写する
            const ctx = getCtx(canvas);
            const img = new Image();
            img.onload = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
            };
            img.src = drawing.imgSrc;
        } else if (canvas) {
            // 新規 Drawing は白背景で初期化する
            const ctx = getCtx(canvas);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    };

    /**
     * 描画モーダルを閉じる。
     * モーダル Canvas の現在の状態を Blob として保存してから閉じる。
     */
    const closeDrawingModal = () => {
        const drawing = uiStore.currentEditingDrawing;
        const canvas = uiStore.modalCanvasRef;

        if (drawing && canvas) {
            // モーダルを閉じる前に最終状態を履歴に保存する
            canvas.toBlob(blob => {
                canvasUtils.pushDrawingHistory(drawing, blob);
                uiStore.showDrawingModal = false;
                uiStore.currentEditingDrawing = null;
            });
        } else {
            uiStore.showDrawingModal = false;
        }
    };

    /**
     * ポインターダウン時の描画開始処理。
     * isDrawing フラグを立て、最初のポインター位置を記録する。
     * @param {MouseEvent | TouchEvent} e
     * @param {Drawing} drawing
     */
    const startDraw = (e, drawing) => {
        if (e.type === 'touchstart') e.preventDefault();
        uiStore.isDrawing = true;
        uiStore.lastActiveDrawingId = drawing.id;
        const canvas = /** @type {HTMLCanvasElement} */ (e.target);
        const rect = canvas.getBoundingClientRect();
        const pos = helpers.getClientPos(e);
        uiStore.lastPos.x = pos.x - rect.left;
        uiStore.lastPos.y = pos.y - rect.top;
    };

    /**
     * ポインタームーブ時の描画処理。
     * 直前の座標から現在の座標まで線を引く。
     * ツールに応じてペン（黒・3px）またはイレーサー（白・20px）で描画する。
     * @param {MouseEvent | TouchEvent} e
     * @param {Drawing} drawing
     */
    const draw = (e, drawing) => {
        if (!uiStore.isDrawing) return;
        if (e.type === 'touchmove') e.preventDefault();

        const canvas = /** @type {HTMLCanvasElement} */ (e.target);
        const ctx = getCtx(canvas);
        const rect = canvas.getBoundingClientRect();
        const pos = helpers.getClientPos(e);
        const x = pos.x - rect.left;
        const y = pos.y - rect.top;

        // 直前の座標から現在座標まで連続した線を描画する
        ctx.beginPath();
        ctx.moveTo(uiStore.lastPos.x, uiStore.lastPos.y);
        ctx.lineTo(x, y);
        ctx.strokeStyle = uiStore.drawingTool === 'eraser' ? '#ffffff' : '#000000';
        ctx.lineWidth = uiStore.drawingTool === 'eraser' ? 20 : 3;
        ctx.lineCap = 'round';
        ctx.stroke();

        uiStore.lastPos.x = x;
        uiStore.lastPos.y = y;
    };

    /**
     * ポインターアップ時の描画終了処理。
     * 描画内容を historyStore に保存する。
     * @param {Drawing} [drawing]
     */
    const stopDraw = (drawing) => {
        if (uiStore.isDrawing) {
            uiStore.isDrawing = false;
            const target = drawing || uiStore.currentEditingDrawing;
            if (target) {
                historyStore.saveHistory(target);
            }
        }
    };

    /**
     * アクティブページの全 Drawing の Canvas を白紙にクリアする。
     * 実行前に確認ダイアログを表示する。
     */
    const clearCurrentPageCanvas = () => {
        if (!confirm('全消去しますか？')) return;
        pageStore.pages[pageStore.activePageIndex].drawings.forEach(d => {
            const cvs = uiStore.canvasRefs[d.id];
            if (cvs) getCtx(cvs).clearRect(0, 0, 360, 240);
            historyStore.saveHistory(d);
        });
    };

    /**
     * グローバルキーボードショートカットの処理（Ctrl+Z/Ctrl+Y/Ctrl+Shift+Z）。
     * コンテモード以外、または最後にアクティブだった Drawing がない場合は何もしない。
     * @param {KeyboardEvent} e
     */
    const handleGlobalKeydown = (e) => {
        if (pageStore.currentMode !== 'conte') return;
        if (!uiStore.lastActiveDrawingId) return;

        // 最後にアクティブだった Drawing を全ページから検索する
        let targetDrawing = null;
        for (const page of pageStore.pages) {
            targetDrawing = page.drawings.find(d => d.id === uiStore.lastActiveDrawingId);
            if (targetDrawing) break;
        }
        if (!targetDrawing) return;

        if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
            e.preventDefault();
            // Shift+Z は Redo、単体 Z は Undo
            e.shiftKey ? historyStore.redo(targetDrawing) : historyStore.undo(targetDrawing);
        } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
            e.preventDefault();
            historyStore.redo(targetDrawing);
        }
    };

    return {
        saveAllCanvases, restoreAllCanvases,
        openDrawingModal, closeDrawingModal,
        startDraw, draw, stopDraw, clearCurrentPageCanvas,
        handleGlobalKeydown
    };
};
