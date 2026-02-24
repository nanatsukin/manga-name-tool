// js/composables/export.js - エクスポートユーティリティ
window.MangaApp = window.MangaApp || {};

/** @type {ExportUtils} */
window.MangaApp.exportUtils = {
    /**
     * エクスポート設定に基づいて出力対象の page index 配列を返す。
     * 'current': アクティブページのみ、'custom': 指定範囲、'all': 全ページ。
     * @param {ExportSettings} settings
     * @param {number} totalPages
     * @param {number} activeIndex
     * @returns {number[]}
     */
    getTargetPageIndices(settings, totalPages, activeIndex) {
        if (settings.rangeType === 'current') {
            return [activeIndex];
        }
        if (settings.rangeType === 'custom') {
            // UI上は1始まりの入力値を 0 始まりの index に変換
            const start = Math.max(0, (settings.rangeStart || 1) - 1);
            const end = Math.min(totalPages - 1, (settings.rangeEnd || 1) - 1);
            const indices = [];
            for (let i = start; i <= end; i++) indices.push(i);
            return indices;
        }
        // 'all' or default: 全ページの index を生成
        return Array.from({ length: totalPages }, (_, i) => i);
    },

    /**
     * html-to-image ライブラリに渡す options オブジェクトを生成する。
     * DOM の表示サイズと実際の Canvas 解像度の比率を transform で補正する。
     * font-awesome の SVG フォントノードはキャプチャから除外する。
     * @param {HTMLElement} el
     * @param {number} canvasW
     * @param {number} canvasH
     * @param {boolean} [transparent]
     * @returns {HtmlToImageOptions}
     */
    createHtmlToImageOptions(el, canvasW, canvasH, transparent) {
        if (transparent === undefined) transparent = false;
        const domW = el.clientWidth;
        // DOM 表示幅に対する Canvas 解像度の倍率
        const ratio = canvasW / domW;
        return {
            width: canvasW,
            height: canvasH,
            style: {
                transform: `scale(${ratio})`,
                transformOrigin: 'top left',
                width: `${domW}px`,
                height: `${el.clientHeight}px`,
                margin: 0,
                ...(transparent ? { backgroundColor: 'rgba(0,0,0,0)' } : {})
            },
            // font-awesome ノードをキャプチャから除外（SVG フォントの二重描画を防ぐ）
            filter: (node) => (node.id !== 'font-awesome')
        };
    }
};
