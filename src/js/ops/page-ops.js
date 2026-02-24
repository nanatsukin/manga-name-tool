// js/ops/page-ops.js - Page/script CRUD, mode switching, navigation
window.MangaApp = window.MangaApp || {};

/** @param {PageOpsDeps} deps @returns {PageOpsInstance} */
window.MangaApp.createPageOps = function (deps) {
    const { nextTick } = deps.Vue;
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
    /** @type {CanvasUtils} */
    const canvasUtils = deps.canvasUtils;
    /** @type {DndUtils} */
    const dndUtils = deps.dndUtils;

    /**
     * アプリの表示モードを切り替える（plot / conte / name）。
     * - name から離れる際はスクロール位置を記憶する
     * - conte から離れる際は全 Canvas を Blob に保存する
     * - plot に切り替える際は Textarea の高さを再計算する
     * - name に切り替える際はスクロール位置を復元し、Undo 履歴を初期化する
     * @param {string} mode @returns {Promise<void>}
     */
    const changeMode = async (mode) => {
        // name モードを離れる前にスクロール位置を保存する
        if (pageStore.currentMode === 'name' && uiStore.nameModeContainer) {
            uiStore.nameModeScrollTop = uiStore.nameModeContainer.scrollTop;
        }
        // conte モードを離れる前に Canvas の内容を Blob に確定させる
        if (pageStore.currentMode === 'conte') await canvas.saveAllCanvases();
        pageStore.currentMode = mode;
        uiStore.selectedItemId = null;
        uiStore.isImageEditMode = false;

        if (mode === 'plot') {
            // plot に切り替えたら Textarea の高さをコンテンツに合わせて調整する
            nextTick(() => helpers.resizeTextareas());
        } else if (mode === 'name') {
            nextTick(() => {
                // name に切り替えたらスクロール位置を復元し、Undo 履歴をリセット＆初期記録する
                if (uiStore.nameModeContainer) {
                    uiStore.nameModeContainer.scrollTop = uiStore.nameModeScrollTop;
                }
                historyStore.resetNameHistory();
                historyStore.recordNameHistory();
            });
        }
    };

    /**
     * 新規ページをページリストの末尾に追加する。
     * conte モード中は先に全 Canvas を保存してから追加する。
     * @returns {Promise<void>}
     */
    const addPage = async () => {
        if (pageStore.currentMode === 'conte') await canvas.saveAllCanvases();
        pageStore.pages.push({ id: Date.now(), scripts: [], drawings: [] });
    };

    /**
     * 指定インデックスのページを削除する。
     * - index 0（先頭ページ）はセリフを前のページへ結合せず削除のみ
     * - index > 0 でセリフがある場合は前のページへ結合してから削除する
     * - セリフがない場合は確認なしで即削除する
     * @param {number} idx
     */
    const deletePage = (idx) => {
        if (idx === 0) {
            // 先頭ページは結合先がないため、確認後にそのまま削除する
            if (pageStore.pages.length > 1) {
                if (confirm("最初のページを削除しますか？（セリフはすべて消去されます）")) {
                    pageStore.pages.splice(idx, 1);
                }
            }
            return;
        }
        const scriptsToMove = pageStore.pages[idx].scripts;
        if (scriptsToMove.length > 0) {
            // セリフが残っている場合は前のページへ結合してから削除する
            if (!confirm(`ページ ${idx + 1} を削除して、セリフを前のページに結合しますか？`)) return;
            pageStore.pages[idx - 1].scripts.push(...scriptsToMove);
        } else {
            // セリフがない場合はそのままページを削除する
            pageStore.pages.splice(idx, 1);
            return;
        }
        pageStore.pages.splice(idx, 1);
        nextTick(() => helpers.resizeTextareas());
    };

    /**
     * 指定ページに新規セリフを追加する。
     * 初期位置・フォントサイズは configStore の設定値を使用する。
     * @param {number} pIdx
     */
    const addScript = (pIdx) => {
        /** @type {Script} */
        const newScript = {
            id: Date.now() + Math.random(),
            type: 'dialogue',
            char: '', text: '',
            drawingId: null,
            layout: { x: 300, y: 200, fontSize: configStore.pageConfig.defaultFontSize }
        };
        pageStore.pages[pIdx].scripts.push(newScript);
        nextTick(() => helpers.resizeTextareas());
    };

    /**
     * 指定ページ・インデックスのセリフを削除する。
     * テキストが入力されている場合は確認ダイアログを表示する（先頭20文字をプレビュー）。
     * @param {number} pIndex @param {number} idx
     */
    const removeScript = (pIndex, idx) => {
        const script = pageStore.pages[pIndex].scripts[idx];
        if (script.text && script.text.trim() !== '') {
            if (!confirm('このセリフを削除しますか？\n\n' + (script.text.substring(0, 20) + '...'))) return;
        }
        pageStore.pages[pIndex].scripts.splice(idx, 1);
        nextTick(() => helpers.resizeTextareas());
    };

    /**
     * セリフのタイプを dialogue → direction → note → dialogue の順に循環切替する。
     * direction / note に変更した場合はキャラクター名をクリアする。
     * type が未設定の場合は char の有無で初期タイプを判定する。
     * @param {number} pIndex @param {number} idx
     */
    const toggleScriptType = (pIndex, idx) => {
        const script = pageStore.pages[pIndex].scripts[idx];
        if (!script.type) {
            // type 未設定の場合は char の有無で初期タイプを決定する
            script.type = script.char ? 'dialogue' : 'direction';
        }
        if (script.type === 'dialogue') {
            script.type = 'direction';
            script.char = '';
        } else if (script.type === 'direction') {
            script.type = 'note';
            script.char = '';
        } else {
            script.type = 'dialogue';
        }
    };

    /**
     * アクティブページに「注意書き」タイプのセリフを追加する。
     * 配置 y 座標はビューポート中央に合わせて計算し、ページ内に収まるようにクランプする。
     */
    const addNoteToCurrentPage = () => {
        const pIdx = pageStore.activePageIndex;
        const page = pageStore.pages[pIdx];
        // ビューポートの中央付近に配置するよう y 座標を計算する
        const viewportCenterY = (uiStore.nameModeContainer?.scrollTop || 0) + (window.innerHeight / 2) - 100;
        const y = Math.max(50, Math.min(configStore.pageConfig.canvasH * configStore.pageConfig.scale - 100, viewportCenterY));
        /** @type {Script} */
        const noteScript = {
            id: Date.now(), type: 'note', char: '', text: '注意書き',
            drawingId: null,
            layout: { x: 100, y: y, fontSize: configStore.pageConfig.defaultFontSize }
        };
        page.scripts.push(noteScript);
        historyStore.recordNameHistory();
    };

    /**
     * 指定ページ内のセリフを上下に移動する。
     * dir が -1 なら上へ、+1 なら下へ移動する。
     * @param {number} pIndex @param {number} sIndex @param {number} dir
     */
    const moveScript = (pIndex, sIndex, dir) => {
        const scripts = pageStore.pages[pIndex].scripts;
        const targetIndex = sIndex + dir;
        if (targetIndex >= 0 && targetIndex < scripts.length) {
            dndUtils.arrayMove(scripts, sIndex, targetIndex);
            nextTick(() => helpers.resizeTextareas());
        }
    };

    /**
     * 指定インデックスの直後に新規セリフを挿入し、挿入後のキャラクター名入力欄にフォーカスする。
     * @param {number} pIndex @param {number} sIndex
     */
    const insertScriptAfter = (pIndex, sIndex) => {
        const scripts = pageStore.pages[pIndex].scripts;
        /** @type {Script} */
        const newScript = {
            id: Date.now() + Math.random(),
            type: 'dialogue', char: '', text: '',
            drawingId: null,
            layout: { x: 300, y: 200, fontSize: 14 }
        };
        // sIndex + 1 の位置に挿入する
        scripts.splice(sIndex + 1, 0, newScript);
        nextTick(() => {
            helpers.resizeTextareas();
            // 挿入されたセリフのキャラクター名入力欄にフォーカスする
            const nextCharInput = uiStore.scriptInputRefs[`${pIndex}-${sIndex + 1}-char`];
            if (nextCharInput) nextCharInput.focus();
        });
    };

    /**
     * 指定セリフ以降を新しいページに移動してページ分割する。
     * 元のページから splice で切り出し、新ページとして直後に挿入する。
     * @param {number} pIndex @param {number} sIndex @returns {Promise<void>}
     */
    const moveSubsequentScriptsToNewPage = async (pIndex, sIndex) => {
        if (!confirm("このセリフ以降を新しいページに移動しますか？")) return;
        // sIndex 以降のセリフを元のページから切り出す
        const scriptsToMove = pageStore.pages[pIndex].scripts.splice(sIndex);
        const newPage = /** @type {Page} */ ({ id: Date.now(), scripts: scriptsToMove, drawings: [] });
        // 切り出したセリフを持つ新ページを直後に挿入する
        pageStore.pages.splice(pIndex + 1, 0, newPage);
        nextTick(() => helpers.resizeTextareas());
    };

    /**
     * 次のページに移動する。
     * conte モード中は先に全 Canvas を保存してから移動する。
     */
    const nextPage = async () => {
        if (pageStore.activePageIndex < pageStore.pages.length - 1) {
            if (pageStore.currentMode === 'conte') await canvas.saveAllCanvases();
            pageStore.activePageIndex++;
        }
    };

    /**
     * 前のページに移動する。
     * conte モード中は先に全 Canvas を保存してから移動する。
     */
    const prevPage = async () => {
        if (pageStore.activePageIndex > 0) {
            if (pageStore.currentMode === 'conte') await canvas.saveAllCanvases();
            pageStore.activePageIndex--;
        }
    };

    /**
     * 指定 ID のアイテム（Drawing または Script）を選択状態にする。
     * null を渡すと選択を解除し、画像編集モードも終了する。
     * アイテムが存在するページに activePageIndex を自動で合わせる。
     * @param {number | null} id
     */
    const selectItem = (id) => {
        uiStore.selectedItemId = id;
        if (id === null) {
            uiStore.isImageEditMode = false;
            return;
        }
        // アイテムが属するページを検索し、activePageIndex を更新する
        pageStore.pages.forEach((page, pIdx) => {
            const hasDrawing = page.drawings.some(d => d.id === id);
            const hasScript = page.scripts.some(s => s.id === id);
            if (hasDrawing || hasScript) {
                pageStore.activePageIndex = pIdx;
            }
        });
    };

    /**
     * 画像編集モード（内部画像のパン・ズーム）のオン/オフを切り替える。
     */
    const toggleImageEditMode = () => {
        uiStore.isImageEditMode = !uiStore.isImageEditMode;
    };

    /**
     * 指定ページ（省略時はアクティブページ）に新規 Drawing を追加する。
     * 初期サイズは 300×200、z-index は 1。追加後に historyStore へ初期状態を記録する。
     * @param {number} [pIdx]
     */
    const addDrawing = (pIdx) => {
        const targetIdx = (typeof pIdx === 'number') ? pIdx : pageStore.activePageIndex;
        const newDrawing = /** @type {Drawing} */ ({
            id: Date.now() + Math.random(),
            imgSrc: null,
            layout: { x: 50, y: 50, w: 300, h: 200, z: 1 },
            inner: { scale: 1, x: 0, y: 0 }
        });
        // 新規 Drawing の Undo 履歴を初期化する
        canvasUtils.initDrawingHistory(newDrawing);
        pageStore.pages[targetIdx].drawings.push(newDrawing);
        // DOM レンダリング後に初期状態を historyStore に記録する
        nextTick(() => historyStore.saveHistory(newDrawing));
    };

    /**
     * 指定ページ・インデックスの Drawing を削除する。
     * - imgSrc の blob URL をリークしないよう revoke する
     * - 削除した Drawing を参照していたセリフの drawingId を null にリセットする
     * @param {number} pIdx @param {number} idx
     */
    const removeDrawing = (pIdx, idx) => {
        if (confirm('削除しますか？')) {
            const drawing = pageStore.pages[pIdx].drawings[idx];
            const removedId = drawing.id;
            // history 配列内の全 blob URL を revoke してメモリを解放する
            if (drawing.history && Array.isArray(drawing.history)) {
                drawing.history.forEach(u => { if (u && u.startsWith('blob:')) URL.revokeObjectURL(u); });
            } else if (drawing.imgSrc && drawing.imgSrc.startsWith('blob:')) {
                URL.revokeObjectURL(drawing.imgSrc);
            }
            // 削除した Drawing を参照しているセリフの drawingId をクリアする
            pageStore.pages[pIdx].scripts.forEach(s => {
                if (s.drawingId === removedId) s.drawingId = null;
            });
            pageStore.pages[pIdx].drawings.splice(idx, 1);
        }
    };

    /**
     * plot モードに切り替えて、指定セリフの Textarea にスクロール＆フォーカスする。
     * モード切替後 100ms 待ってから DOM 要素を検索する（アニメーション完了待ち）。
     * @param {number} pIndex @param {Script} script @returns {Promise<void>}
     */
    const jumpToPlot = async (pIndex, script) => {
        const sIndex = pageStore.pages[pIndex].scripts.findIndex(s => s.id === script.id);
        if (sIndex === -1) return;
        await changeMode('plot');
        setTimeout(() => {
            // モード切替アニメーション完了後に対象 Textarea を探してフォーカスする
            const refKey = `${pIndex}-${sIndex}-text`;
            const el = uiStore.scriptInputRefs[refKey];
            if (el) {
                el.scrollIntoView({ behavior: 'auto', block: 'center' });
                el.focus();
            }
        }, 100);
    };

    /**
     * conte モードに切り替えて、指定セリフが属するコマ要素にスクロールする。
     * drawingId が設定されている場合のみスクロールを行う。
     * @param {number} pIndex @param {Script} script @returns {Promise<void>}
     */
    const jumpToConte = async (pIndex, script) => {
        await changeMode('conte');
        pageStore.activePageIndex = pIndex;
        if (script.drawingId) {
            setTimeout(() => {
                // コマ要素を ID で検索してスクロールする
                const el = document.getElementById('conte-drawing-' + script.drawingId);
                if (el) el.scrollIntoView({ behavior: 'auto', block: 'center' });
            }, 100);
        }
    };

    /**
     * name モードに切り替えて、指定セリフ要素にスクロール＆選択状態にする。
     * @param {number} pIndex @param {Script} script @returns {Promise<void>}
     */
    const jumpToName = async (pIndex, script) => {
        await changeMode('name');
        setTimeout(() => {
            // name モードの DOM が描画されてからセリフ要素を探してスクロールする
            const el = document.getElementById('name-script-' + script.id);
            if (el) {
                el.scrollIntoView({ behavior: 'auto', block: 'center' });
                selectItem(script.id);
            }
        }, 100);
    };

    /**
     * 指定ページのセリフをコンテのコマ順に並び替える。
     * Drawing の配列順にセリフを並べ、未割り当てのセリフを末尾に追加する。
     * @param {number} pageIndex
     */
    const sortScriptsByConteOrder = (pageIndex) => {
        const page = pageStore.pages[pageIndex];
        if (!page) return;
        let newScripts = [];
        // Drawing の順番に従ってセリフを並べる
        for (const drawing of page.drawings) {
            const scripts = helpers.getScriptsForDrawing(pageIndex, drawing.id);
            newScripts.push(...scripts);
        }
        // どのコマにも属さないセリフを末尾に追加する
        const unassigned = helpers.getUnassignedScripts(pageIndex);
        newScripts.push(...unassigned);
        page.scripts = newScripts;
    };

    /**
     * 全ページのセリフをコンテのコマ順に並び替える（確認ダイアログあり）。
     * 各ページに sortScriptsByConteOrder を適用し、最後に Textarea をリサイズする。
     */
    const sortAllScriptsByConteOrder = () => {
        if (!confirm('全ページのプロットをコンテのコマ順に合わせて並び替えますか？')) return;
        pageStore.pages.forEach((_, index) => {
            sortScriptsByConteOrder(index);
        });
        nextTick(() => helpers.resizeTextareas());
    };

    /**
     * 全ページ・全セリフのフォントサイズを configStore の設定値に統一する（確認ダイアログあり）。
     * name モード中は適用後に Undo 履歴に記録する。
     */
    const applyFontSizeToAll = () => {
        if (!confirm(`すべてのページのセリフのフォントサイズを、現在の設定値(${configStore.pageConfig.defaultFontSize}px)に統一しますか？`)) return;
        pageStore.pages.forEach(p => {
            p.scripts.forEach(s => {
                s.layout.fontSize = configStore.pageConfig.defaultFontSize;
            });
        });
        // name モード中は変更を Undo 履歴に記録する
        if (pageStore.currentMode === 'name') historyStore.recordNameHistory();
    };

    return {
        changeMode, addPage, deletePage,
        addScript, removeScript, toggleScriptType, addNoteToCurrentPage,
        moveScript, insertScriptAfter, moveSubsequentScriptsToNewPage,
        nextPage, prevPage, selectItem, toggleImageEditMode,
        addDrawing, removeDrawing,
        jumpToPlot, jumpToConte, jumpToName,
        sortAllScriptsByConteOrder, applyFontSizeToAll
    };
};
