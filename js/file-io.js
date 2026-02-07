// js/file-io.js - File save/load/export
window.MangaApp = window.MangaApp || {};

window.MangaApp.createFileIO = function (deps) {
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

    // Export modal
    const openExportModal = () => {
        state.exportSettings.value.rangeEnd = state.pages.value.length;
        state.showExportModal.value = true;
    };

    const executeExport = () => {
        state.showExportModal.value = false;
        exportData(state.exportSettings.value.format, state.exportSettings.value);
    };

    // Export data (PNG/PSD)
    const exportData = async (format = 'png', optSettings = null) => {
        if (state.currentMode.value !== 'name') {
            alert('ネームモードに切り替えてから実行します');
            state.currentMode.value = 'name';
            await nextTick();
        }

        const settings = (optSettings && typeof optSettings === 'object') ? optSettings : { rangeType: 'all' };

        let targetPageIndices = [];
        if (settings.rangeType === 'current') {
            targetPageIndices = [state.activePageIndex.value];
        } else if (settings.rangeType === 'custom') {
            const start = Math.max(0, (settings.rangeStart || 1) - 1);
            const end = Math.min(state.pages.value.length - 1, (settings.rangeEnd || 1) - 1);
            for (let i = start; i <= end; i++) targetPageIndices.push(i);
        } else {
            targetPageIndices = state.pages.value.map((_, i) => i);
        }

        if (targetPageIndices.length === 0) {
            alert('出力対象のページがありません');
            return;
        }

        const useDirectory = 'showDirectoryPicker' in window;
        let dirHandle = null;
        if (useDirectory) {
            try {
                dirHandle = await window.showDirectoryPicker();
            } catch (e) {
                return;
            }
        }

        state.isExporting.value = true;
        state.isProcessing.value = true;
        state.progress.value = 0;
        state.progressMessage.value = '準備中...';

        if (format === 'psd') {
            state.isTextLayerMode.value = true;
            state.isHideGuideMode.value = true;
            state.isHideDrawingMode.value = true;
            state.isTransparentMode.value = true;
        } else {
            state.isTextLayerMode.value = false;
            state.isHideGuideMode.value = true;
            state.isHideDrawingMode.value = false;
            state.isTransparentMode.value = false;
        }

        state.selectedItemId.value = null;
        state.isImageEditMode.value = false;
        await nextTick();
        await new Promise(r => setTimeout(r, 1000));

        const pageElements = document.querySelectorAll('.manga-page');
        const zip = useDirectory ? null : new JSZip();

        for (let i = 0; i < pageElements.length; i++) {
            state.progress.value = Math.round((i / pageElements.length) * 100);
            state.progressMessage.value = `${i + 1} / ${pageElements.length} ページ書き出し中...`;
            await new Promise(r => setTimeout(r, 10));

            const el = pageElements[i];
            if (el.classList.contains('opacity-0')) continue;

            try {
                const canvasW = state.pageConfig.value.canvasW;
                const canvasH = state.pageConfig.value.canvasH;
                const scale = state.pageConfig.value.scale;
                const domW = el.clientWidth;
                const ratio = canvasW / domW;
                const pageNum = el.id.replace('render-page-', '');
                const pageIndex = parseInt(pageNum);

                if (!targetPageIndices.includes(pageIndex)) continue;

                if (format === 'png') {
                    const dataUrl = await htmlToImage.toPng(el, {
                        width: canvasW,
                        height: canvasH,
                        style: {
                            transform: `scale(${ratio})`,
                            transformOrigin: 'top left',
                            width: `${domW}px`,
                            height: `${el.clientHeight}px`,
                            margin: 0
                        },
                        filter: (node) => (node.id !== 'font-awesome')
                    });

                    const blob = await (await fetch(dataUrl)).blob();
                    const fileName = `page_${String(pageIndex + 1).padStart(3, '0')}.png`;
                    if (useDirectory && dirHandle) {
                        const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
                        const writable = await fileHandle.createWritable();
                        await writable.write(blob);
                        await writable.close();
                    } else if (zip) {
                        zip.file(fileName, blob);
                    }
                } else if (format === 'psd') {
                    const textDataUrl = await htmlToImage.toPng(el, {
                        width: canvasW,
                        height: canvasH,
                        style: {
                            transform: `scale(${ratio})`,
                            transformOrigin: 'top left',
                            width: `${domW}px`,
                            height: `${el.clientHeight}px`,
                            margin: 0,
                            backgroundColor: 'rgba(0,0,0,0)'
                        },
                        filter: (node) => (node.id !== 'font-awesome')
                    });

                    const textImg = new Image();
                    textImg.src = textDataUrl;
                    await new Promise(r => textImg.onload = r);

                    const textCanvas = document.createElement('canvas');
                    textCanvas.width = canvasW;
                    textCanvas.height = canvasH;
                    textCanvas.getContext('2d').drawImage(textImg, 0, 0);

                    const drawCanvas = document.createElement('canvas');
                    drawCanvas.width = canvasW;
                    drawCanvas.height = canvasH;
                    const dCtx = drawCanvas.getContext('2d');
                    const pageData = state.pages.value[pageIndex];

                    if (pageData) {
                        for (const d of pageData.drawings) {
                            if (d.imgSrc) {
                                const img = new Image();
                                img.src = d.imgSrc;
                                await new Promise(r => img.onload = r);

                                const x = d.layout.x / scale;
                                const y = d.layout.y / scale;
                                const w = d.layout.w / scale;
                                const h = d.layout.h / scale;

                                dCtx.save();
                                dCtx.beginPath();
                                dCtx.rect(x, y, w, h);
                                dCtx.clip();

                                const ix = (d.inner?.x || 0) / scale;
                                const iy = (d.inner?.y || 0) / scale;
                                const is = d.inner?.scale || 1;

                                const imgCenterX = x + w / 2 + ix;
                                const imgCenterY = y + h / 2 + iy;
                                const ratioImg = Math.min(w / img.width, h / img.height) * is;
                                const dw = img.width * ratioImg;
                                const dh = img.height * ratioImg;
                                const dx = imgCenterX - dw / 2;
                                const dy = imgCenterY - dh / 2;

                                dCtx.drawImage(img, dx, dy, dw, dh);
                                dCtx.restore();

                                dCtx.strokeStyle = "black";
                                dCtx.lineWidth = 2 / scale;
                                dCtx.strokeRect(x, y, w, h);
                            }
                        }
                    }

                    const guideCanvas = document.createElement('canvas');
                    guideCanvas.width = canvasW;
                    guideCanvas.height = canvasH;
                    const gCtx = guideCanvas.getContext('2d');

                    const { finishW, finishH, bleed, safeTop, safeBottom, safeInside, safeOutside } = state.pageConfig.value;
                    const fx = (canvasW - finishW) / 2;
                    const fy = (canvasH - finishH) / 2;

                    gCtx.strokeStyle = "rgba(136, 146, 230, 0.8)";
                    gCtx.lineWidth = 1;
                    gCtx.strokeRect(fx, fy, finishW, finishH);

                    const isRight = (pageIndex === 0) || (pageIndex % 2 !== 0);
                    const si = isRight ? safeInside : safeOutside;
                    const so = isRight ? safeOutside : safeInside;
                    gCtx.strokeRect(fx + si, fy + safeTop, finishW - si - so, finishH - safeTop - safeBottom);

                    const bx = fx - bleed;
                    const by = fy - bleed;
                    const bw = finishW + bleed * 2;
                    const bh = finishH + bleed * 2;
                    gCtx.strokeRect(bx, by, bw, bh);

                    gCtx.beginPath();
                    const tExt = 200;
                    const bxr = bx + bw;
                    const byb = by + bh;
                    const fxr = fx + finishW;
                    const fyb = fy + finishH;
                    const cx = canvasW / 2;
                    const cy = canvasH / 2;
                    const cLen = 200;

                    gCtx.moveTo(cx, by); gCtx.lineTo(cx, by - tExt);
                    gCtx.moveTo(cx - cLen, by - tExt / 2); gCtx.lineTo(cx + cLen, by - tExt / 2);
                    gCtx.moveTo(cx, byb); gCtx.lineTo(cx, byb + tExt);
                    gCtx.moveTo(cx - cLen, byb + tExt / 2); gCtx.lineTo(cx + cLen, byb + tExt / 2);
                    gCtx.moveTo(bx, cy); gCtx.lineTo(bx - tExt, cy);
                    gCtx.moveTo(bx - tExt / 2, cy - cLen); gCtx.lineTo(bx - tExt / 2, cy + cLen);
                    gCtx.moveTo(bxr, cy); gCtx.lineTo(bxr + tExt, cy);
                    gCtx.moveTo(bxr + tExt / 2, cy - cLen); gCtx.lineTo(bxr + tExt / 2, cy + cLen);

                    gCtx.moveTo(fx, by); gCtx.lineTo(fx, by - tExt);
                    gCtx.moveTo(bx, by); gCtx.lineTo(bx, by - tExt);
                    gCtx.moveTo(bx, fy); gCtx.lineTo(bx - tExt, fy);
                    gCtx.moveTo(bx, by); gCtx.lineTo(bx - tExt, by);

                    gCtx.moveTo(fxr, by); gCtx.lineTo(fxr, by - tExt);
                    gCtx.moveTo(bxr, by); gCtx.lineTo(bxr, by - tExt);
                    gCtx.moveTo(bxr, fy); gCtx.lineTo(bxr + tExt, fy);
                    gCtx.moveTo(bxr, by); gCtx.lineTo(bxr + tExt, by);

                    gCtx.moveTo(fx, byb); gCtx.lineTo(fx, byb + tExt);
                    gCtx.moveTo(bx, byb); gCtx.lineTo(bx, byb + tExt);
                    gCtx.moveTo(bx, fyb); gCtx.lineTo(bx - tExt, fyb);
                    gCtx.moveTo(bx, byb); gCtx.lineTo(bx - tExt, byb);

                    gCtx.moveTo(fxr, byb); gCtx.lineTo(fxr, byb + tExt);
                    gCtx.moveTo(bxr, byb); gCtx.lineTo(bxr, byb + tExt);
                    gCtx.moveTo(bxr, fyb); gCtx.lineTo(bxr + tExt, fyb);
                    gCtx.moveTo(bxr, byb); gCtx.lineTo(bxr + tExt, byb);

                    gCtx.stroke();

                    const bgCanvas = document.createElement('canvas');
                    bgCanvas.width = canvasW;
                    bgCanvas.height = canvasH;
                    bgCanvas.getContext('2d').fillStyle = "white";
                    bgCanvas.getContext('2d').fillRect(0, 0, canvasW, canvasH);

                    const psd = {
                        width: canvasW,
                        height: canvasH,
                        children: [
                            { name: 'Paper', canvas: bgCanvas },
                            { name: 'Guide', canvas: guideCanvas },
                            { name: 'Drawings', canvas: drawCanvas },
                            { name: 'Text', canvas: textCanvas }
                        ]
                    };

                    const buffer = agPsd.writePsd(psd);
                    const blob = new Blob([buffer]);
                    const fileName = `page_${String(pageIndex + 1).padStart(3, '0')}.psd`;

                    if (useDirectory && dirHandle) {
                        const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
                        const writable = await fileHandle.createWritable();
                        await writable.write(blob);
                        await writable.close();
                    } else if (zip) {
                        zip.file(fileName, blob);
                    }
                }
            } catch (e) {
                console.error(e);
            }
        }

        state.isTextLayerMode.value = false;
        state.isHideGuideMode.value = false;
        state.isHideDrawingMode.value = false;
        state.isTransparentMode.value = false;
        state.isExporting.value = false;
        state.isProcessing.value = false;
        state.progress.value = 0;
        state.progressMessage.value = '';

        if (zip) {
            zip.generateAsync({ type: "blob" }).then(c => saveAs(c, format === 'png' ? "manga_png.zip" : "manga_psd.zip"));
        } else {
            alert("保存完了");
        }
    };

    return {
        saveProject, saveProjectAs, loadProjectFromFile, handleFileChange,
        openExportModal, executeExport, exportData
    };
};
