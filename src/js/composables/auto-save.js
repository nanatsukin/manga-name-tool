// js/composables/auto-save.js - IDB永続化 + 汎用ユーティリティ
window.MangaApp = window.MangaApp || {};

/** @type {AutoSaveUtils} */
window.MangaApp.autoSaveUtils = {
    /**
     * Blob を base64 データ URL に変換する（FileReader を使用）。
     * @param {Blob} blob @returns {Promise<string>}
     */
    blobToBase64(blob) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(/** @type {string} */ (reader.result));
            reader.readAsDataURL(blob);
        });
    },

    /**
     * JSON シリアライズ/デシリアライズを使ったディープクローンを返す。
     * 関数・undefined・循環参照を含むオブジェクトには使用不可。
     * @template T
     * @param {T} obj
     * @returns {T}
     */
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    },

    /**
     * 現在のプロジェクトデータを IndexedDB に自動保存する。
     * 描画 Blob はキャッシュがあればそのまま利用し、なければ fetch で取得する。
     * 保存中は uiStore.saveStatus を 'saving' に設定し、完了後に 'saved' へ更新する。
     * @param {PageStoreInstance} pageStore
     * @param {ConfigStoreInstance} configStore
     * @param {UiStoreInstance} uiStore
     * @returns {Promise<void>}
     */
    async autoSaveToIDB(pageStore, configStore, uiStore) {
        // 復元処理中は自動保存しない（復元データで上書きされるのを防ぐ）
        if (uiStore.isRestoring) return;
        uiStore.saveStatus = 'saving';
        try {
            // ページデータを JSON クローンして保存用オブジェクトを作成
            const dataToSave = {
                pages: JSON.parse(JSON.stringify(pageStore.pages)),
                config: JSON.parse(JSON.stringify(configStore.pageConfig))
            };

            // 各 drawing の imgSrc（blob URL）を Blob に変換して IDB に保存できる形にする
            await Promise.all(dataToSave.pages.map(async (/** @type {any} */ page, /** @type {number} */ pIdx) => {
                await Promise.all(page.drawings.map(async (/** @type {any} */ d, /** @type {number} */ dIdx) => {
                    // history/historyStep は IDB 保存不要（容量節約のため削除）
                    delete d.history; delete d.historyStep;
                    const originalDrawing = pageStore.pages[pIdx].drawings[dIdx];
                    const originalImgSrc = originalDrawing.imgSrc;
                    if (originalDrawing.cachedBlob) {
                        // キャッシュ済み Blob があればそのまま使用
                        d.imgBlob = originalDrawing.cachedBlob;
                        delete d.imgSrc; delete d.cachedBlob;
                    } else if (originalImgSrc) {
                        // blob URL から fetch して Blob を取得し、キャッシュに保存
                        try {
                            const res = await fetch(originalImgSrc);
                            d.imgBlob = await res.blob();
                            originalDrawing.cachedBlob = d.imgBlob;
                            delete d.imgSrc;
                        } catch (e) { }
                    }
                }));
            }));

            await idbKeyval.set('manga_project_autosave', dataToSave);
            uiStore.saveStatus = 'saved';
        } catch (e) {
            console.error(e);
            uiStore.saveStatus = 'error';
        }
    },

    /**
     * IndexedDB から前回の自動保存データを復元する。
     * ユーザーに確認ダイアログを表示し、拒否された場合は何もしない。
     * 復元後は Canvas に描画内容を反映し、Textarea の高さを再調整する。
     * @param {PageStoreInstance} pageStore
     * @param {ConfigStoreInstance} configStore
     * @param {UiStoreInstance} uiStore
     * @param {CanvasUtils} canvasUtils
     * @param {HelpersInstance} helpers
     * @param {(fn?: () => void) => Promise<void>} nextTick
     * @returns {Promise<boolean>} 復元した場合 true、キャンセルまたはデータなしの場合 false
     */
    async restoreFromIDB(pageStore, configStore, uiStore, canvasUtils, helpers, nextTick) {
        const savedData = await idbKeyval.get('manga_project_autosave');
        if (!savedData || !confirm('前回の作業データを復元しますか？')) return false;

        uiStore.isProcessing = true;
        if (savedData.pages) {
            // IDB に保存されている Blob を blob URL に変換して drawing に設定する
            for (const page of savedData.pages) {
                for (const drawing of page.drawings) {
                    if (drawing.imgBlob) {
                        drawing.imgSrc = URL.createObjectURL(drawing.imgBlob);
                        drawing.cachedBlob = drawing.imgBlob;
                        delete drawing.imgBlob;
                    }
                    // 履歴は空の状態から再スタート（復元データには含まれないため）
                    drawing.history = [];
                    drawing.historyStep = -1;
                }
            }
            pageStore.pages = savedData.pages;
        }
        if (savedData.config) configStore.pageConfig = savedData.config;

        // DOM が更新されるまで待ってから Canvas を初期化
        await nextTick();

        // imgSrc が存在する drawing の履歴を初期化（undo/redo 用）
        pageStore.pages.forEach(p => p.drawings.forEach(d => {
            if (d.imgSrc) canvasUtils.initDrawingHistory(d);
        }));
        helpers.resizeTextareas();

        return true;
    }
};
