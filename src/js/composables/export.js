// js/composables/export.js - エクスポートユーティリティ
window.MangaApp = window.MangaApp || {};

/** @type {ExportUtils} */
window.MangaApp.exportUtils = {
    /**
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
            const start = Math.max(0, (settings.rangeStart || 1) - 1);
            const end = Math.min(totalPages - 1, (settings.rangeEnd || 1) - 1);
            const indices = [];
            for (let i = start; i <= end; i++) indices.push(i);
            return indices;
        }
        // 'all' or default
        return Array.from({ length: totalPages }, (_, i) => i);
    },

    /**
     * @param {HTMLElement} el
     * @param {number} canvasW
     * @param {number} canvasH
     * @param {boolean} [transparent]
     * @returns {HtmlToImageOptions}
     */
    createHtmlToImageOptions(el, canvasW, canvasH, transparent) {
        if (transparent === undefined) transparent = false;
        const domW = el.clientWidth;
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
            filter: (node) => (node.id !== 'font-awesome')
        };
    }
};
