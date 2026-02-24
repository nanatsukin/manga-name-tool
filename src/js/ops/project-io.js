// js/ops/project-io.js - Project save/load
window.MangaApp = window.MangaApp || {};

/** @param {ProjectIODeps} deps @returns {ProjectIOInstance} */
window.MangaApp.createProjectIO = function (deps) {
    const { nextTick } = deps.Vue;
    /** @type {PageStoreInstance} */
    const pageStore = deps.pageStore;
    /** @type {ConfigStoreInstance} */
    const configStore = deps.configStore;
    /** @type {UiStoreInstance} */
    const uiStore = deps.uiStore;
    /** @type {HelpersInstance} */
    const helpers = deps.helpers;
    /** @type {CanvasModuleInstance} */
    const canvas = deps.canvas;
    /** @type {CanvasUtils} */
    const canvasUtils = deps.canvasUtils;
    /** @type {AutoSaveUtils} */
    const autoSaveUtils = deps.autoSaveUtils;

    /**
     * 保存用の JSON 文字列を生成する。
     * - conte モード中は先に全 Canvas を Blob に保存する
     * - pageStore のデータを deepClone して Drawing の history/historyStep を削除する
     * - Drawing の imgSrc が blob URL の場合は fetch して base64 に変換する（ファイルに埋め込むため）
     * @returns {Promise<string>}
     */
    const createExportData = async () => {
        // conte モードの場合は Canvas の内容を確定させてから JSON 化する
        if (pageStore.currentMode === 'conte') await canvas.saveAllCanvases();
        const exportData = {
            pages: autoSaveUtils.deepClone(pageStore.pages),
            config: configStore.pageConfig
        };
        for (const page of exportData.pages) {
            for (const drawing of page.drawings) {
                // undo/redo 履歴はファイルに保存しない（サイズ削減のため）
                delete drawing.history;
                delete drawing.historyStep;
                if (drawing.imgSrc) {
                    // blob URL はファイルに保存できないので base64 に変換する
                    // ライブデータから最新の imgSrc を参照して fetch する
                    const livePage = pageStore.pages.find(p => p.id === page.id);
                    const liveDrawing = livePage.drawings.find(d => d.id === drawing.id);
                    if (liveDrawing && liveDrawing.imgSrc) {
                        try {
                            const response = await fetch(liveDrawing.imgSrc);
                            const blob = await response.blob();
                            drawing.imgSrc = await autoSaveUtils.blobToBase64(blob);
                        } catch (e) { console.error(e); }
                    }
                }
            }
        }
        return JSON.stringify(exportData);
    };

    /**
     * プロジェクトを上書き保存する。
     * currentFileHandle が未設定の場合は saveProjectAs（名前を付けて保存）にフォールバックする。
     * File System Access API の writable ストリームを使って直接ファイルに書き込む。
     */
    const saveProject = async () => {
        if (!configStore.currentFileHandle) {
            // ファイルハンドルがない場合は名前を付けて保存ダイアログを開く
            saveProjectAs();
            return;
        }
        try {
            uiStore.isProcessing = true;
            const jsonString = await createExportData();
            const blob = new Blob([jsonString], { type: "application/json" });
            // File System Access API でファイルに書き込む
            const writable = await configStore.currentFileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
            alert("上書き保存しました");
        } catch (e) {
            console.error(e);
            alert("保存に失敗しました");
        } finally {
            uiStore.isProcessing = false;
        }
    };

    /**
     * 名前を付けてプロジェクトを保存する。
     * - File System Access API（showSaveFilePicker）が使える場合はネイティブの保存ダイアログを開く
     * - 使えない場合は FileSaver.js の saveAs でダウンロードにフォールバックする
     * - 保存成功後は configStore.currentFileHandle を更新して次回の上書き保存に備える
     */
    const saveProjectAs = async () => {
        uiStore.isProcessing = true;
        try {
            const jsonString = await createExportData();
            const blob = new Blob([jsonString], { type: "application/json" });

            if ('showSaveFilePicker' in window) {
                // File System Access API が利用可能な場合はネイティブダイアログを使う
                try {
                    const opts = {
                        types: [{
                            description: 'Manga Project File',
                            accept: { 'application/json': ['.json'] }
                        }],
                    };
                    const handle = await window.showSaveFilePicker(opts);
                    const writable = await handle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    // 次回の上書き保存のためにファイルハンドルを保持する
                    configStore.currentFileHandle = handle;
                    alert("保存しました");
                } catch (err) {
                    // ユーザーがキャンセルした場合（AbortError）はエラー表示しない
                    if (err.name !== 'AbortError') console.error(err);
                }
            } else {
                // File System Access API 非対応（Firefox など）は FileSaver.js でダウンロードする
                saveAs(blob, "manga_project.json");
                alert("ファイルをダウンロードしました。\nGoogleドライブ等に手動でアップロードしてください。");
            }
        } catch (e) {
            console.error(e);
            alert("エラーが発生しました");
        } finally {
            uiStore.isProcessing = false;
        }
    };

    /**
     * ファイルからプロジェクトを読み込む。
     * - File System Access API（showOpenFilePicker）が使える場合はネイティブダイアログを開く
     * - 使えない場合は hidden な <input type="file"> をクリックして読み込む
     */
    const loadProjectFromFile = async () => {
        if ('showOpenFilePicker' in window) {
            try {
                const [handle] = await window.showOpenFilePicker({
                    types: [{
                        description: 'Manga Project File',
                        accept: { 'application/json': ['.json'] }
                    }],
                    multiple: false
                });
                const file = await handle.getFile();
                await loadFileContent(file);
                // 読み込んだファイルのハンドルを保持して次回の上書き保存に備える
                configStore.currentFileHandle = handle;
            } catch (err) {
                // ユーザーがキャンセルした場合（AbortError）はエラー表示しない
                if (err.name !== 'AbortError') console.error(err);
            }
        } else {
            // File System Access API 非対応の場合は hidden の input 要素を使う
            uiStore.fileInput.click();
        }
    };

    /**
     * <input type="file"> の change イベントを処理する。
     * ファイルが選択されたら loadFileContent で内容を読み込み、input をリセットする。
     * File System Access API 非対応環境でのフォールバック用。
     * @param {Event} e @returns {Promise<void>}
     */
    const handleFileChange = async (e) => {
        const input = /** @type {HTMLInputElement} */ (e.target);
        const file = input.files && input.files[0];
        if (!file) return;
        await loadFileContent(file);
        // 同じファイルを再度選択できるよう input をリセットする
        input.value = '';
        // input 経由の場合はファイルハンドルが取得できない
        configStore.currentFileHandle = null;
    };

    /**
     * File オブジェクトからプロジェクトデータを読み込んでアプリに反映する。
     * - JSON を解析してページデータと設定を読み込む
     * - Drawing の imgSrc が base64 の場合は blob URL に変換する（メモリ効率のため）
     * - 既存の blob URL を revoke してメモリリークを防ぐ
     * - 読み込み後は conte モードの場合 Canvas を復元し、Textarea をリサイズする
     * @param {File} file @returns {Promise<void>}
     */
    const loadFileContent = async (file) => {
        uiStore.isProcessing = true;
        try {
            const text = await file.text();
            const importedData = JSON.parse(text);
            // 旧形式（pages 配列のみ）と新形式（pages + config）の両方に対応する
            const importedPages = importedData.pages || importedData;

            for (const page of importedPages) {
                for (const drawing of page.drawings) {
                    if (drawing.imgSrc && drawing.imgSrc.startsWith('data:')) {
                        // base64 → Blob → blob URL に変換してメモリ効率よく扱う
                        const res = await fetch(drawing.imgSrc);
                        const blob = await res.blob();
                        drawing.imgSrc = URL.createObjectURL(blob);
                        drawing.cachedBlob = blob;
                    }
                    // 読み込んだ Drawing の Undo 履歴を初期化する
                    canvasUtils.initDrawingHistory(drawing);
                }
            }

            // 現在のページの blob URL を revoke してメモリリークを防ぐ
            pageStore.pages.forEach(p => p.drawings.forEach(d => {
                if (d.imgSrc) URL.revokeObjectURL(d.imgSrc);
            }));

            pageStore.pages = importedPages;
            if (importedData.config) configStore.pageConfig = importedData.config;

            pageStore.activePageIndex = 0;
            nextTick(() => {
                // conte モードの場合は Canvas の描画内容を復元する
                if (pageStore.currentMode === 'conte') canvas.restoreAllCanvases();
                uiStore.isProcessing = false;
                helpers.resizeTextareas();
            });

        } catch (e) {
            console.error(e);
            alert("ファイルの読み込みに失敗しました");
            uiStore.isProcessing = false;
        }
    };

    return {
        saveProject, saveProjectAs, loadProjectFromFile, handleFileChange
    };
};
