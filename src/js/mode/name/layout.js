// js/mode/name/layout.js - 名前モードのレイアウト操作（移動・リサイズ・オートレイアウト）
window.MangaApp = window.MangaApp || {};

/** @param {LayoutModuleDeps} deps @returns {LayoutModuleInstance} */
window.MangaApp.createLayout = function (deps) {
    /** @type {PageStoreInstance} */
    const pageStore = deps.pageStore;
    /** @type {ConfigStoreInstance} */
    const configStore = deps.configStore;
    /** @type {UiStoreInstance} */
    const uiStore = deps.uiStore;
    /** @type {HistoryStoreInstance} */
    const historyStore = deps.historyStore;
    /** @type {HelpersInstance} */
    const helpers = deps.helpers;
    /** @type {CanvasModuleInstance} */
    const canvas = deps.canvas;
    /** @type {LayoutUtils} */
    const layoutUtils = deps.layoutUtils;
    /** @type {DndUtils} */
    const dndUtils = deps.dndUtils;

    // ---- ドラッグ・リサイズ操作の状態変数 ----
    /** 現在操作中の Drawing または Script（操作中は null 以外）。 */
    /** @type {Drawing | Script | null} */
    let interactTarget = null;
    /** ポインターダウン時の座標と、操作対象の初期値。 */
    /** @type {number} */
    let startX = 0, startY = 0, startValX = 0, startValY = 0, startW = 0, startH = 0;
    /** リサイズ時のハンドル種別（'tl' | 'tr' | 'bl' | 'br'）。 */
    /** @type {string} */
    let activeHandleType = '';
    /** Drawing をドラッグするときに連動して移動するセリフの初期座標リスト。 */
    /** @type {{ item: Script, startX: number, startY: number }[]} */
    let linkedItems = [];

    /**
     * Drawing または Script のレイアウトドラッグを開始する。
     * リサイズハンドルをクリックした場合はドラッグ処理をスキップする。
     * 画像編集モード（isImageEditMode）の場合は画像内部の移動（onImageDrag）、
     * 通常モードはコマ全体の移動（onLayoutDrag）を行う。
     * Drawing をドラッグする場合は、紐付いているセリフも連動して移動する（linkedItems）。
     * @param {MouseEvent | TouchEvent} e
     * @param {Drawing | Script} item
     */
    const startLayoutDrag = (e, item) => {
        if (/** @type {HTMLElement} */ (e.target).classList.contains('resize-handle')) return;
        if (e.type === 'touchstart') e.preventDefault();
        e.stopPropagation();

        interactTarget = item;
        const pos = helpers.getClientPos(e);
        startX = pos.x;
        startY = pos.y;

        if (uiStore.isImageEditMode && /** @type {Drawing} */ (item).inner) {
            // 画像編集モード：コマ内の画像（inner）の移動
            startValX = /** @type {Drawing} */ (item).inner.x || 0;
            startValY = /** @type {Drawing} */ (item).inner.y || 0;
            dndUtils.addPointerListeners(onImageDrag, stopInteract);
        } else {
            // 通常モード：コマ全体の移動
            startValX = item.layout.x;
            startValY = item.layout.y;
            linkedItems = [];
            // この Drawing に紐付いているセリフも一緒に移動するためリストを作成する
            const page = pageStore.pages.find(p => p.drawings.some(d => d.id === item.id));
            if (page) {
                const scripts = page.scripts.filter(s => s.drawingId === item.id);
                linkedItems = scripts.map(s => ({ item: s, startX: s.layout.x, startY: s.layout.y }));
            }
            dndUtils.addPointerListeners(onLayoutDrag, stopInteract);
        }
    };

    /**
     * レイアウトドラッグ中のポインタームーブ処理。
     * interactTarget の位置を更新し、ページ境界内に収める。
     * 紐付きセリフ（linkedItems）も同じ delta 分だけ移動する。
     * @param {any} e
     */
    const onLayoutDrag = (e) => {
        if (!interactTarget) return;
        e.preventDefault();

        const pos = helpers.getClientPos(e);
        let newX = startValX + (pos.x - startX);
        let newY = startValY + (pos.y - startY);

        // Drawing の幅・高さでページ右端・下端をクランプ（Script の場合は 50px をフォールバック）
        const w = /** @type {Drawing} */ (interactTarget).layout.w || 50;
        const h = /** @type {Drawing} */ (interactTarget).layout.h || 50;
        newX = Math.max(0, Math.min(configStore.displayW - w, newX));
        newY = Math.max(0, Math.min(configStore.displayH - h, newY));
        interactTarget.layout.x = newX;
        interactTarget.layout.y = newY;

        // 紐付きセリフを同じ delta 分だけ移動する（ページ外への大幅なはみ出しは許容）
        if (linkedItems.length > 0) {
            const dx = newX - startValX;
            const dy = newY - startValY;
            linkedItems.forEach(link => {
                let lx = link.startX + dx;
                let ly = link.startY + dy;
                lx = Math.max(-50, Math.min(configStore.displayW + 50, lx));
                ly = Math.max(-50, Math.min(configStore.displayH + 50, ly));
                link.item.layout.x = lx;
                link.item.layout.y = ly;
            });
        }
    };

    /**
     * 画像内部ドラッグ中のポインタームーブ処理。
     * Drawing.inner（画像のパン座標）を更新する。
     * @param {any} e
     */
    const onImageDrag = (e) => {
        if (!interactTarget) return;
        if (e.type === 'touchmove') e.preventDefault();
        const pos = helpers.getClientPos(e);
        const imgTarget = /** @type {Drawing} */ (interactTarget);
        if (!imgTarget.inner) imgTarget.inner = { scale: 1, x: 0, y: 0 };
        imgTarget.inner.x = startValX + (pos.x - startX);
        imgTarget.inner.y = startValY + (pos.y - startY);
    };

    /**
     * マウスホイールで画像のスケールを変更する。
     * 画像編集モードかつ選択中のコマのみ有効。
     * @param {WheelEvent} e @param {Drawing} item
     */
    const onImageWheel = (e, item) => {
        // @ts-ignore - intentional loose comparison
        if (!uiStore.isImageEditMode || !uiStore.selectedItemId === item.id) return;
        if (!item.inner) item.inner = { scale: 1, x: 0, y: 0 };
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        item.inner.scale = Math.max(0.1, (item.inner.scale || 1) + delta);
    };

    /**
     * ボタン操作で画像のスケールを指定量だけ変更する。
     * @param {Drawing} item @param {number} amount 正の値で拡大、負の値で縮小
     */
    const zoomImage = (item, amount) => {
        if (!item.inner) item.inner = { scale: 1, x: 0, y: 0 };
        item.inner.scale = Math.max(0.1, (item.inner.scale || 1) + amount);
    };

    /**
     * Drawing のリサイズを開始する。ハンドル種別（4隅）を記録し、
     * 初期サイズと座標を保存してポインタリスナーを登録する。
     * @param {MouseEvent | TouchEvent} e
     * @param {Drawing} item
     * @param {'tl' | 'tr' | 'bl' | 'br'} handleType リサイズハンドルの位置
     */
    const startLayoutResize = (e, item, handleType) => {
        if (e.type === 'touchstart') e.preventDefault();
        interactTarget = item;
        activeHandleType = handleType;
        const pos = helpers.getClientPos(e);
        startX = pos.x;
        startY = pos.y;
        startValX = item.layout.x;
        startValY = item.layout.y;
        startW = item.layout.w;
        startH = item.layout.h;
        e.stopPropagation();

        dndUtils.addPointerListeners(onLayoutResize, stopInteract);
    };

    /**
     * リサイズ中のポインタームーブ処理。
     * ハンドル種別に応じて新しい幅・高さ・位置を計算し、ページ境界内に収める。
     * 最小サイズは 20px。
     * @param {any} e
     */
    const onLayoutResize = (e) => {
        if (!interactTarget) return;
        if (e.type === 'touchmove') e.preventDefault();

        const pos = helpers.getClientPos(e);
        const dx = pos.x - startX;
        const dy = pos.y - startY;
        let newX = startValX, newY = startValY, newW = startW, newH = startH;

        // ハンドル種別に応じてサイズ変更の方向を決定する
        if (activeHandleType === 'br') { newW = Math.max(20, startW + dx); newH = Math.max(20, startH + dy); }
        else if (activeHandleType === 'bl') { newW = Math.max(20, startW - dx); newX = startValX + (startW - newW); newH = Math.max(20, startH + dy); }
        else if (activeHandleType === 'tr') { newH = Math.max(20, startH - dy); newY = startValY + (startH - newH); newW = Math.max(20, startW + dx); }
        else if (activeHandleType === 'tl') { newW = Math.max(20, startW - dx); newH = Math.max(20, startH - dy); newX = startValX + (startW - newW); newY = startValY + (startH - newH); }

        // ページ境界からはみ出た分をクランプする
        if (newX < 0) { newW += newX; newX = 0; }
        if (newY < 0) { newH += newY; newY = 0; }
        if (newX + newW > configStore.displayW) newW = configStore.displayW - newX;
        if (newY + newH > configStore.displayH) newH = configStore.displayH - newY;

        interactTarget.layout.x = newX;
        interactTarget.layout.y = newY;
        const resizeTarget = /** @type {Drawing} */ (interactTarget);
        resizeTarget.layout.w = newW;
        resizeTarget.layout.h = newH;
    };

    /**
     * ドラッグ・リサイズ操作の終了処理。
     * interactTarget をクリアし、ポインタリスナーを削除する。
     * 名前モードで実際に操作が行われていた場合は Undo 履歴に記録する。
     */
    const stopInteract = () => {
        const wasInteracting = !!interactTarget;
        interactTarget = null;
        dndUtils.removePointerListeners([onLayoutDrag, onImageDrag, onLayoutResize], stopInteract);

        if (pageStore.currentMode === 'name' && wasInteracting) {
            historyStore.recordNameHistory();
        }
    };

    /**
     * Script または Drawing を前後のページに移動する。
     * @param {number} pageIdx 移動元ページインデックス
     * @param {'scripts' | 'drawings'} type 移動する配列の種別
     * @param {number} itemIdx 移動する要素のインデックス
     * @param {number} dir 移動方向（-1: 前のページ、+1: 次のページ）
     */
    const moveItemPage = (pageIdx, type, itemIdx, dir) => {
        const targetPageIdx = pageIdx + dir;
        if (targetPageIdx >= 0 && targetPageIdx < pageStore.pages.length) {
            const item = pageStore.pages[pageIdx][type].splice(itemIdx, 1)[0];
            pageStore.pages[targetPageIdx][type].push(/** @type {any} */ (item));
            historyStore.recordNameHistory();
        }
    };

    /**
     * Drawing（コマ）を前後のページに移動する。
     * Drawing に紐付いたセリフも一緒に移動する。
     * Canvas 保存→移動→Undo 履歴記録の順に処理する。
     * @param {number} pageIdx 移動元ページインデックス
     * @param {number} drawingIdx 移動する Drawing のインデックス
     * @param {number} dir 移動方向（-1: 前のページ、+1: 次のページ）
     * @returns {Promise<void>}
     */
    const moveDrawingPage = async (pageIdx, drawingIdx, dir) => {
        const targetPageIdx = pageIdx + dir;
        if (targetPageIdx >= 0 && targetPageIdx < pageStore.pages.length) {
            // Canvas 内容を保存してからページ間移動を行う
            await canvas.saveAllCanvases();
            const drawing = pageStore.pages[pageIdx].drawings.splice(drawingIdx, 1)[0];
            // 前ページへ移動は末尾、次ページへ移動は先頭に追加する
            if (dir === -1) pageStore.pages[targetPageIdx].drawings.push(drawing);
            else pageStore.pages[targetPageIdx].drawings.unshift(drawing);

            // この Drawing に紐付いているセリフも一緒に移動させる
            const relatedScripts = pageStore.pages[pageIdx].scripts.filter(s => s.drawingId === drawing.id);
            for (let i = pageStore.pages[pageIdx].scripts.length - 1; i >= 0; i--) {
                if (pageStore.pages[pageIdx].scripts[i].drawingId === drawing.id) {
                    pageStore.pages[pageIdx].scripts.splice(i, 1);
                }
            }
            pageStore.pages[targetPageIdx].scripts.push(...relatedScripts);

            if (pageStore.currentMode === 'name') historyStore.recordNameHistory();
        }
    };

    /**
     * アクティブページの Drawing を2列に自動配置し、
     * 各 Drawing に紐付いているセリフも自動的に位置を設定する。
     * 未割り当てのセリフはページ右外に縦に並べる。
     * 処理後に Undo 履歴に記録する。
     */
    const autoLayoutCurrentPage = () => {
        const pIdx = pageStore.activePageIndex;
        const page = pageStore.pages[pIdx];
        const config = configStore.pageConfig;
        const scale = config.scale;

        if (!page) return;

        // 安全マージン領域を基準にレイアウトを計算する
        const { safeX, safeY, safeW, safeH } = layoutUtils.getSafeArea(config, pIdx, scale);

        const panelMargin = 20;  // コマ間の余白（px）
        let currentY = safeY;

        // Drawing を2列グリッドに配置する（マンガは右→左の順なので col 0 が右列）
        page.drawings.forEach((drawing, dIdx) => {
            const col = dIdx % 2;  // 0 = 右列、1 = 左列
            const colW = (safeW - panelMargin) / 2;
            const ratio = drawing.layout.h / drawing.layout.w;
            drawing.layout.w = colW;
            drawing.layout.h = colW * ratio;  // アスペクト比を維持してサイズを決定

            if (col === 0) {
                // 右列に配置（safe area の右端に揃える）
                drawing.layout.x = safeX + safeW - drawing.layout.w;
            } else {
                // 左列に配置（safe area の左端）
                drawing.layout.x = safeX;
                // 行の高さ = 左右両コマのうち高い方
                const prev = page.drawings[dIdx - 1];
                const rowH = Math.max(drawing.layout.h, prev ? prev.layout.h : 0);
                currentY += rowH + panelMargin;
            }

            // 右列は currentY の位置、左列は同行の右コマと同じ Y 座標
            drawing.layout.y = (col === 1 && page.drawings[dIdx - 1]) ? page.drawings[dIdx - 1].layout.y : currentY;

            // safe area の下端を超えないようにクランプする
            if (drawing.layout.y + drawing.layout.h > safeY + safeH) {
                drawing.layout.y = safeY + safeH - drawing.layout.h;
            }
        });

        // 各 Drawing に紐付いているセリフを Drawing の内側に配置する
        page.drawings.forEach((drawing) => {
            const scripts = helpers.getScriptsForDrawing(pIdx, drawing.id);
            if (scripts.length > 0) {
                const dX = drawing.layout.x;
                const dY = drawing.layout.y;
                const dW = drawing.layout.w;

                const innerMarginTop = 20;   // コマ上端からのセリフ上マージン
                const innerMarginSide = 10;  // コマ左右端からのマージン
                const usableW = dW - (innerMarginSide * 2);
                // セリフが複数ある場合は横方向に均等に並べる
                const stepX = scripts.length > 1 ? (usableW / scripts.length) : 0;

                scripts.forEach((script, sIdx) => {
                    const fontSize = script.layout.fontSize || config.defaultFontSize || 18;
                    const lineCount = script.text ? script.text.split('\n').length : 1;
                    const lineHeight = 1.5;
                    // 縦書きの場合、列幅 = 行数 × フォントサイズ × 行間
                    const scriptWidth = lineCount * fontSize * lineHeight;
                    // 右から順にセリフを配置する
                    const targetRightEdge = (dX + dW) - innerMarginSide - (stepX * sIdx);
                    script.layout.x = targetRightEdge - scriptWidth;
                    script.layout.y = dY + innerMarginTop;
                    if (script.layout.fontSize === undefined) {
                        script.layout.fontSize = config.defaultFontSize || 18;
                    }
                });
            }
        });

        // 未割り当てのセリフはページ右外に縦に並べる（はみ出し領域）
        const unassigned = helpers.getUnassignedScripts(pIdx);
        unassigned.forEach((script, uIdx) => {
            script.layout.x = safeX + safeW + 20;
            script.layout.y = safeY + (uIdx * 120);
            if (script.layout.fontSize === undefined) {
                script.layout.fontSize = config.defaultFontSize || 18;
            }
        });

        historyStore.recordNameHistory();
    };

    return {
        startLayoutDrag, startLayoutResize,
        onImageWheel, zoomImage,
        moveItemPage, moveDrawingPage,
        autoLayoutCurrentPage
    };
};
