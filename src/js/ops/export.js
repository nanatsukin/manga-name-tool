// js/ops/export.js - PNG/PSD export
window.MangaApp = window.MangaApp || {};

/** @param {ExportModuleDeps} deps @returns {ExportModuleInstance} */
window.MangaApp.createExport = function (deps) {
    const { nextTick } = deps.Vue;
    /** @type {PageStoreInstance} */
    const pageStore = deps.pageStore;
    /** @type {ConfigStoreInstance} */
    const configStore = deps.configStore;
    /** @type {UiStoreInstance} */
    const uiStore = deps.uiStore;
    /** @type {LayoutUtils} */
    const layoutUtils = deps.layoutUtils;
    /** @type {ExportUtils} */
    const exportUtils = deps.exportUtils;

    /**
     * エクスポートモーダルを開く。
     * rangeEnd をページ総数で初期化してからモーダルを表示する。
     */
    const openExportModal = () => {
        configStore.exportSettings.rangeEnd = pageStore.pages.length;
        uiStore.showExportModal = true;
    };

    /**
     * エクスポートモーダルの「実行」ボタンの処理。
     * モーダルを閉じてから exportData を呼び出す。
     */
    const executeExport = () => {
        uiStore.showExportModal = false;
        exportData(configStore.exportSettings.format, configStore.exportSettings);
    };

    /**
     * 指定形式（png / psd）で全ページをエクスポートする。
     * - name モード以外で呼ばれた場合は name モードに切り替えてから実行する
     * - File System Access API（showDirectoryPicker）が使える場合はフォルダに直接書き込む
     * - 使えない場合は JSZip で ZIP に束ねて FileSaver.js でダウンロードする
     * - psd エクスポートでは Paper / Guide / Drawings / Text の4レイヤー構成で出力する
     * @param {string} [format]
     * @param {ExportSettings | null} [optSettings]
     * @returns {Promise<void>}
     */
    const exportData = async (format = 'png', optSettings = null) => {
        // name モード以外からのエクスポートは name モードに切り替えてから実行する
        if (pageStore.currentMode !== 'name') {
            alert('ネームモードに切り替えてから実行します');
            pageStore.currentMode = 'name';
            await nextTick();
        }

        const settings = /** @type {ExportSettings} */ ((optSettings && typeof optSettings === 'object') ? optSettings : { rangeType: 'all' });

        const targetPageIndices = exportUtils.getTargetPageIndices(
            settings, pageStore.pages.length, pageStore.activePageIndex
        );

        if (targetPageIndices.length === 0) {
            alert('出力対象のページがありません');
            return;
        }

        // File System Access API が使えれば フォルダに直接書き込む。使えなければ ZIP にまとめる
        const useDirectory = 'showDirectoryPicker' in window;
        let dirHandle = null;
        if (useDirectory) {
            try {
                dirHandle = await window.showDirectoryPicker();
            } catch (e) {
                // ユーザーがキャンセルした場合はエクスポートを中断する
                return;
            }
        }

        uiStore.isExporting = true;
        uiStore.isProcessing = true;
        uiStore.progress = 0;
        uiStore.progressMessage = '準備中...';

        if (format === 'psd') {
            // PSD エクスポート：テキスト・描画・ガイドを分離するため各レイヤー用のモードフラグを立てる
            uiStore.isTextLayerMode = true;      // テキストレイヤーのみ表示
            uiStore.isHideGuideMode = true;       // ガイド線を非表示
            uiStore.isHideDrawingMode = true;     // Drawing レイヤーを非表示（Canvas から別途合成）
            uiStore.isTransparentMode = true;     // 背景を透明にする
        } else {
            // PNG エクスポート：ガイド線を非表示にするが、描画は通常表示する
            uiStore.isTextLayerMode = false;
            uiStore.isHideGuideMode = true;
            uiStore.isHideDrawingMode = false;
            uiStore.isTransparentMode = false;
        }

        uiStore.selectedItemId = null;
        uiStore.isImageEditMode = false;
        await nextTick();
        // DOM レンダリングが落ち着くまで 1 秒待つ（フォント読み込み等の完了を待機）
        await new Promise(r => setTimeout(r, 1000));

        const pageElements = /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.manga-page'));
        const zip = useDirectory ? null : new JSZip();

        for (let i = 0; i < pageElements.length; i++) {
            uiStore.progress = Math.round((i / pageElements.length) * 100);
            uiStore.progressMessage = `${i + 1} / ${pageElements.length} ページ書き出し中...`;
            // UI の進捗表示を更新するための短い待機
            await new Promise(r => setTimeout(r, 10));

            const el = pageElements[i];
            // opacity-0 のページ（見開きで非表示側）はスキップする
            if (el.classList.contains('opacity-0')) continue;

            try {
                const canvasW = configStore.pageConfig.canvasW;
                const canvasH = configStore.pageConfig.canvasH;
                const scale = configStore.pageConfig.scale;
                const pageNum = el.id.replace('render-page-', '');
                const pageIndex = parseInt(pageNum);

                // エクスポート対象外のページはスキップする
                if (!targetPageIndices.includes(pageIndex)) continue;

                if (format === 'png') {
                    // html-to-image で DOM を PNG に変換する（実寸 canvasW×canvasH で出力）
                    const dataUrl = await htmlToImage.toPng(el,
                        exportUtils.createHtmlToImageOptions(el, canvasW, canvasH)
                    );

                    const blob = await (await fetch(dataUrl)).blob();
                    const fileName = `page_${String(pageIndex + 1).padStart(3, '0')}.png`;
                    if (useDirectory && dirHandle) {
                        // File System Access API でフォルダに直接書き込む
                        const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
                        const writable = await fileHandle.createWritable();
                        await writable.write(blob);
                        await writable.close();
                    } else if (zip) {
                        zip.file(fileName, blob);
                    }
                } else if (format === 'psd') {
                    // ---- PSD エクスポート ----
                    // [レイヤー1: Text] テキスト部分を html-to-image で PNG として取得する
                    const textDataUrl = await htmlToImage.toPng(el,
                        exportUtils.createHtmlToImageOptions(el, canvasW, canvasH, true)
                    );

                    const textImg = new Image();
                    textImg.src = textDataUrl;
                    await new Promise(r => textImg.onload = r);

                    // テキスト画像を実寸 Canvas に転写する（html-to-image の scale 倍率を元に戻す）
                    const textCanvas = document.createElement('canvas');
                    textCanvas.width = canvasW;
                    textCanvas.height = canvasH;
                    textCanvas.getContext('2d').drawImage(textImg, 0, 0);

                    // [レイヤー2: Drawings] 各 Drawing の imgSrc を実寸 Canvas に合成する
                    const drawCanvas = document.createElement('canvas');
                    drawCanvas.width = canvasW;
                    drawCanvas.height = canvasH;
                    const dCtx = drawCanvas.getContext('2d');
                    const pageData = pageStore.pages[pageIndex];

                    if (pageData) {
                        for (const d of pageData.drawings) {
                            if (d.imgSrc) {
                                const img = new Image();
                                img.src = d.imgSrc;
                                await new Promise(r => img.onload = r);

                                // Drawing の layout 座標は scale 倍なので、実寸に変換する
                                const x = d.layout.x / scale;
                                const y = d.layout.y / scale;
                                const w = d.layout.w / scale;
                                const h = d.layout.h / scale;

                                // コマ枠でクリッピングしてから画像を描画する
                                dCtx.save();
                                dCtx.beginPath();
                                dCtx.rect(x, y, w, h);
                                dCtx.clip();

                                // 内部オフセット（パン・ズーム）を scale 変換して適用する
                                const ix = (d.inner?.x || 0) / scale;
                                const iy = (d.inner?.y || 0) / scale;
                                const is = d.inner?.scale || 1;

                                // コマ中央を基準に画像をアスペクト比を保ってフィットさせる
                                const imgCenterX = x + w / 2 + ix;
                                const imgCenterY = y + h / 2 + iy;
                                const ratioImg = Math.min(w / img.width, h / img.height) * is;
                                const dw = img.width * ratioImg;
                                const dh = img.height * ratioImg;
                                const dx = imgCenterX - dw / 2;
                                const dy = imgCenterY - dh / 2;

                                dCtx.drawImage(img, dx, dy, dw, dh);
                                dCtx.restore();

                                // コマの枠線を描画する（2px / scale で実寸に合わせる）
                                dCtx.strokeStyle = "black";
                                dCtx.lineWidth = 2 / scale;
                                dCtx.strokeRect(x, y, w, h);
                            }
                        }
                    }

                    // [レイヤー3: Guide] 仕上がり線・セーフエリア・塗り足し・トンボを Canvas に描画する
                    const guideCanvas = document.createElement('canvas');
                    guideCanvas.width = canvasW;
                    guideCanvas.height = canvasH;
                    const gCtx = guideCanvas.getContext('2d');

                    const { finishW, finishH, bleed } = configStore.pageConfig;
                    const { safeX: sX, safeY: sY, safeW: sW, safeH: sH, fx, fy } = layoutUtils.getSafeArea(configStore.pageConfig, pageIndex);

                    // ガイド線の色（半透明の青紫）で統一する
                    gCtx.strokeStyle = "rgba(136, 146, 230, 0.8)";
                    gCtx.lineWidth = 1;

                    // 仕上がり線（トリムライン）を描画する
                    gCtx.strokeRect(fx, fy, finishW, finishH);
                    // セーフエリア（文字・絵の安全領域）を描画する
                    gCtx.strokeRect(sX, sY, sW, sH);

                    // 塗り足し線（ブリードライン）を描画する
                    const bx = fx - bleed;
                    const by = fy - bleed;
                    const bw = finishW + bleed * 2;
                    const bh = finishH + bleed * 2;
                    gCtx.strokeRect(bx, by, bw, bh);

                    // トンボ（センターマーク＋コーナーマーク）を描画する
                    gCtx.beginPath();
                    const tExt = 200;  // トンボの延長長さ（ページ外側への突き出し）
                    const bxr = bx + bw;  // 塗り足し右端
                    const byb = by + bh;  // 塗り足し下端
                    const fxr = fx + finishW;  // 仕上がり右端
                    const fyb = fy + finishH;  // 仕上がり下端
                    const cx = canvasW / 2;  // Canvas 中心 X
                    const cy = canvasH / 2;  // Canvas 中心 Y
                    const cLen = 200;  // センターマークの腕の長さ

                    // センターマーク：上下左右の中央にクロスマークを描く
                    gCtx.moveTo(cx, by); gCtx.lineTo(cx, by - tExt);
                    gCtx.moveTo(cx - cLen, by - tExt / 2); gCtx.lineTo(cx + cLen, by - tExt / 2);
                    gCtx.moveTo(cx, byb); gCtx.lineTo(cx, byb + tExt);
                    gCtx.moveTo(cx - cLen, byb + tExt / 2); gCtx.lineTo(cx + cLen, byb + tExt / 2);
                    gCtx.moveTo(bx, cy); gCtx.lineTo(bx - tExt, cy);
                    gCtx.moveTo(bx - tExt / 2, cy - cLen); gCtx.lineTo(bx - tExt / 2, cy + cLen);
                    gCtx.moveTo(bxr, cy); gCtx.lineTo(bxr + tExt, cy);
                    gCtx.moveTo(bxr + tExt / 2, cy - cLen); gCtx.lineTo(bxr + tExt / 2, cy + cLen);

                    // コーナーマーク：4隅に L 字型のトンボを描く
                    // 左上コーナー
                    gCtx.moveTo(fx, by); gCtx.lineTo(fx, by - tExt);
                    gCtx.moveTo(bx, by); gCtx.lineTo(bx, by - tExt);
                    gCtx.moveTo(bx, fy); gCtx.lineTo(bx - tExt, fy);
                    gCtx.moveTo(bx, by); gCtx.lineTo(bx - tExt, by);
                    // 右上コーナー
                    gCtx.moveTo(fxr, by); gCtx.lineTo(fxr, by - tExt);
                    gCtx.moveTo(bxr, by); gCtx.lineTo(bxr, by - tExt);
                    gCtx.moveTo(bxr, fy); gCtx.lineTo(bxr + tExt, fy);
                    gCtx.moveTo(bxr, by); gCtx.lineTo(bxr + tExt, by);
                    // 左下コーナー
                    gCtx.moveTo(fx, byb); gCtx.lineTo(fx, byb + tExt);
                    gCtx.moveTo(bx, byb); gCtx.lineTo(bx, byb + tExt);
                    gCtx.moveTo(bx, fyb); gCtx.lineTo(bx - tExt, fyb);
                    gCtx.moveTo(bx, byb); gCtx.lineTo(bx - tExt, byb);
                    // 右下コーナー
                    gCtx.moveTo(fxr, byb); gCtx.lineTo(fxr, byb + tExt);
                    gCtx.moveTo(bxr, byb); gCtx.lineTo(bxr, byb + tExt);
                    gCtx.moveTo(bxr, fyb); gCtx.lineTo(bxr + tExt, fyb);
                    gCtx.moveTo(bxr, byb); gCtx.lineTo(bxr + tExt, byb);

                    gCtx.stroke();

                    // [レイヤー4: Paper] 白紙の背景レイヤー
                    const bgCanvas = document.createElement('canvas');
                    bgCanvas.width = canvasW;
                    bgCanvas.height = canvasH;
                    bgCanvas.getContext('2d').fillStyle = "white";
                    bgCanvas.getContext('2d').fillRect(0, 0, canvasW, canvasH);

                    // ag-psd の writePsd で 4 レイヤー構成の PSD ファイルを生成する
                    const psd = {
                        width: canvasW,
                        height: canvasH,
                        children: [
                            { name: 'Paper', canvas: bgCanvas },    // 最下層：白背景
                            { name: 'Guide', canvas: guideCanvas }, // ガイド線
                            { name: 'Drawings', canvas: drawCanvas }, // コマ・描画
                            { name: 'Text', canvas: textCanvas }    // 最上層：セリフ・テキスト
                        ]
                    };

                    const buffer = agPsd.writePsd(psd);
                    const blob = new Blob([buffer]);
                    const fileName = `page_${String(pageIndex + 1).padStart(3, '0')}.psd`;

                    if (useDirectory && dirHandle) {
                        // File System Access API でフォルダに直接書き込む
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

        // エクスポート完了後、すべての表示モードフラグをリセットする
        uiStore.isTextLayerMode = false;
        uiStore.isHideGuideMode = false;
        uiStore.isHideDrawingMode = false;
        uiStore.isTransparentMode = false;
        uiStore.isExporting = false;
        uiStore.isProcessing = false;
        uiStore.progress = 0;
        uiStore.progressMessage = '';

        if (zip) {
            // ZIP モードの場合は全ページを束ねて FileSaver.js でダウンロードする
            zip.generateAsync({ type: "blob" }).then(c => saveAs(c, format === 'png' ? "manga_png.zip" : "manga_psd.zip"));
        } else {
            alert("保存完了");
        }
    };

    return {
        openExportModal, executeExport, exportData
    };
};
