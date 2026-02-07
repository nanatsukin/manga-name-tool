// js/ops/export.js - PNG/PSD export
window.MangaApp = window.MangaApp || {};

window.MangaApp.createExport = function (deps) {
    const { nextTick } = deps.Vue;
    const state = deps.state;

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
        openExportModal, executeExport, exportData
    };
};
