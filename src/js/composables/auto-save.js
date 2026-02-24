// js/composables/auto-save.js - IDB永続化 + 汎用ユーティリティ
window.MangaApp = window.MangaApp || {};

/** @type {AutoSaveUtils} */
window.MangaApp.autoSaveUtils = {
    /** @param {Blob} blob @returns {Promise<string>} */
    blobToBase64(blob) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(/** @type {string} */ (reader.result));
            reader.readAsDataURL(blob);
        });
    },

    /**
     * @template T
     * @param {T} obj
     * @returns {T}
     */
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    },

    /**
     * @param {PageStoreInstance} pageStore
     * @param {ConfigStoreInstance} configStore
     * @param {UiStoreInstance} uiStore
     * @returns {Promise<void>}
     */
    async autoSaveToIDB(pageStore, configStore, uiStore) {
        if (uiStore.isRestoring) return;
        uiStore.saveStatus = 'saving';
        try {
            const dataToSave = {
                pages: JSON.parse(JSON.stringify(pageStore.pages)),
                config: JSON.parse(JSON.stringify(configStore.pageConfig))
            };
            await Promise.all(dataToSave.pages.map(async (/** @type {any} */ page, /** @type {number} */ pIdx) => {
                await Promise.all(page.drawings.map(async (/** @type {any} */ d, /** @type {number} */ dIdx) => {
                    delete d.history; delete d.historyStep;
                    const originalDrawing = pageStore.pages[pIdx].drawings[dIdx];
                    const originalImgSrc = originalDrawing.imgSrc;
                    if (originalDrawing.cachedBlob) {
                        d.imgBlob = originalDrawing.cachedBlob;
                        delete d.imgSrc; delete d.cachedBlob;
                    } else if (originalImgSrc) {
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
     * @param {PageStoreInstance} pageStore
     * @param {ConfigStoreInstance} configStore
     * @param {UiStoreInstance} uiStore
     * @param {CanvasUtils} canvasUtils
     * @param {HelpersInstance} helpers
     * @param {(fn?: () => void) => Promise<void>} nextTick
     * @returns {Promise<boolean>}
     */
    async restoreFromIDB(pageStore, configStore, uiStore, canvasUtils, helpers, nextTick) {
        const savedData = await idbKeyval.get('manga_project_autosave');
        if (!savedData || !confirm('前回の作業データを復元しますか？')) return false;

        uiStore.isProcessing = true;
        if (savedData.pages) {
            for (const page of savedData.pages) {
                for (const drawing of page.drawings) {
                    if (drawing.imgBlob) {
                        drawing.imgSrc = URL.createObjectURL(drawing.imgBlob);
                        drawing.cachedBlob = drawing.imgBlob;
                        delete drawing.imgBlob;
                    }
                    drawing.history = [];
                    drawing.historyStep = -1;
                }
            }
            pageStore.pages = savedData.pages;
        }
        if (savedData.config) configStore.pageConfig = savedData.config;

        await nextTick();

        pageStore.pages.forEach(p => p.drawings.forEach(d => {
            if (d.imgSrc) canvasUtils.initDrawingHistory(d);
        }));
        helpers.resizeTextareas();

        return true;
    }
};
