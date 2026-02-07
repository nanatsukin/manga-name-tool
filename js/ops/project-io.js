// js/ops/project-io.js - Project save/load
window.MangaApp = window.MangaApp || {};

window.MangaApp.createProjectIO = function (deps) {
    const { nextTick } = deps.Vue;
    const state = deps.state;
    const helpers = deps.helpers;
    const canvas = deps.canvas;

    // Blob to Base64
    const blobToBase64 = (blob) => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    };

    // Create export JSON data
    const createExportData = async () => {
        if (state.currentMode.value === 'conte') await canvas.saveAllCanvases();
        const exportData = {
            pages: JSON.parse(JSON.stringify(state.pages.value)),
            config: state.pageConfig.value
        };
        for (const page of exportData.pages) {
            for (const drawing of page.drawings) {
                delete drawing.history;
                delete drawing.historyStep;
                if (drawing.imgSrc) {
                    const livePage = state.pages.value.find(p => p.id === page.id);
                    const liveDrawing = livePage.drawings.find(d => d.id === drawing.id);
                    if (liveDrawing && liveDrawing.imgSrc) {
                        try {
                            const response = await fetch(liveDrawing.imgSrc);
                            const blob = await response.blob();
                            drawing.imgSrc = await blobToBase64(blob);
                        } catch (e) { console.error(e); }
                    }
                }
            }
        }
        return JSON.stringify(exportData);
    };

    // Save (overwrite)
    const saveProject = async () => {
        if (!state.currentFileHandle.value) {
            saveProjectAs();
            return;
        }
        try {
            state.isProcessing.value = true;
            const jsonString = await createExportData();
            const blob = new Blob([jsonString], { type: "application/json" });
            const writable = await state.currentFileHandle.value.createWritable();
            await writable.write(blob);
            await writable.close();
            alert("上書き保存しました");
        } catch (e) {
            console.error(e);
            alert("保存に失敗しました");
        } finally {
            state.isProcessing.value = false;
        }
    };

    // Save as
    const saveProjectAs = async () => {
        state.isProcessing.value = true;
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
                    state.currentFileHandle.value = handle;
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
            state.isProcessing.value = false;
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
                state.currentFileHandle.value = handle;
            } catch (err) {
                if (err.name !== 'AbortError') console.error(err);
            }
        } else {
            state.fileInput.value.click();
        }
    };

    // Handle file input change (mobile)
    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        await loadFileContent(file);
        e.target.value = '';
        state.currentFileHandle.value = null;
    };

    // Load file content (shared)
    const loadFileContent = async (file) => {
        state.isProcessing.value = true;
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
                    drawing.history = drawing.imgSrc ? [drawing.imgSrc] : [];
                    drawing.historyStep = drawing.imgSrc ? 0 : -1;
                }
            }

            state.pages.value.forEach(p => p.drawings.forEach(d => {
                if (d.imgSrc) URL.revokeObjectURL(d.imgSrc);
            }));

            state.pages.value = importedPages;
            if (importedData.config) state.pageConfig.value = importedData.config;

            state.activePageIndex.value = 0;
            nextTick(() => {
                if (state.currentMode.value === 'conte') canvas.restoreAllCanvases();
                state.isProcessing.value = false;
                helpers.resizeTextareas();
            });

        } catch (e) {
            console.error(e);
            alert("ファイルの読み込みに失敗しました");
            state.isProcessing.value = false;
        }
    };

    return {
        saveProject, saveProjectAs, loadProjectFromFile, handleFileChange
    };
};
