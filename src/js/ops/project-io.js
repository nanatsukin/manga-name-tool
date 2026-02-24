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

    /** @returns {Promise<string>} */
    const createExportData = async () => {
        if (pageStore.currentMode === 'conte') await canvas.saveAllCanvases();
        const exportData = {
            pages: autoSaveUtils.deepClone(pageStore.pages),
            config: configStore.pageConfig
        };
        for (const page of exportData.pages) {
            for (const drawing of page.drawings) {
                delete drawing.history;
                delete drawing.historyStep;
                if (drawing.imgSrc) {
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

    // Save (overwrite)
    const saveProject = async () => {
        if (!configStore.currentFileHandle) {
            saveProjectAs();
            return;
        }
        try {
            uiStore.isProcessing = true;
            const jsonString = await createExportData();
            const blob = new Blob([jsonString], { type: "application/json" });
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

    // Save as
    const saveProjectAs = async () => {
        uiStore.isProcessing = true;
        try {
            const jsonString = await createExportData();
            const blob = new Blob([jsonString], { type: "application/json" });

            if ('showSaveFilePicker' in window) {
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
                    configStore.currentFileHandle = handle;
                    alert("保存しました");
                } catch (err) {
                    if (err.name !== 'AbortError') console.error(err);
                }
            } else {
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

    // Load from file
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
                configStore.currentFileHandle = handle;
            } catch (err) {
                if (err.name !== 'AbortError') console.error(err);
            }
        } else {
            uiStore.fileInput.click();
        }
    };

    /** @param {Event} e @returns {Promise<void>} */
    const handleFileChange = async (e) => {
        const input = /** @type {HTMLInputElement} */ (e.target);
        const file = input.files && input.files[0];
        if (!file) return;
        await loadFileContent(file);
        input.value = '';
        configStore.currentFileHandle = null;
    };

    /** @param {File} file @returns {Promise<void>} */
    const loadFileContent = async (file) => {
        uiStore.isProcessing = true;
        try {
            const text = await file.text();
            const importedData = JSON.parse(text);
            const importedPages = importedData.pages || importedData;

            for (const page of importedPages) {
                for (const drawing of page.drawings) {
                    if (drawing.imgSrc && drawing.imgSrc.startsWith('data:')) {
                        const res = await fetch(drawing.imgSrc);
                        const blob = await res.blob();
                        drawing.imgSrc = URL.createObjectURL(blob);
                        drawing.cachedBlob = blob;
                    }
                    canvasUtils.initDrawingHistory(drawing);
                }
            }

            pageStore.pages.forEach(p => p.drawings.forEach(d => {
                if (d.imgSrc) URL.revokeObjectURL(d.imgSrc);
            }));

            pageStore.pages = importedPages;
            if (importedData.config) configStore.pageConfig = importedData.config;

            pageStore.activePageIndex = 0;
            nextTick(() => {
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
