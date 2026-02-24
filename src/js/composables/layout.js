// js/composables/layout.js - ページ座標計算・境界クランプ
window.MangaApp = window.MangaApp || {};

/** @type {LayoutUtils} */
window.MangaApp.layoutUtils = {
    /**
     * pageIndexが右ページかどうかを判定する。
     * index 0 と奇数 index が右ページ（見開きの右側）。
     * @param {number} pageIndex @returns {boolean}
     */
    isRightPage(pageIndex) {
        return (pageIndex === 0) || (pageIndex % 2 !== 0);
    },

    /**
     * 仕上がり線・安全マージンを考慮した描画可能領域（safe area）を計算する。
     * ページの左右によって内側・外側のマージンが入れ替わる。
     * @param {PageConfig} config
     * @param {number} pageIndex
     * @param {number} [scale]
     * @returns {SafeArea}
     */
    getSafeArea(config, pageIndex, scale) {
        if (scale === undefined) scale = 1;
        const { canvasW, canvasH, finishW, finishH, safeTop, safeBottom, safeInside, safeOutside } = config;

        // Canvas の中央に仕上がり領域を配置するためのオフセット
        const fx = (canvasW - finishW) / 2;
        const fy = (canvasH - finishH) / 2;

        // 右ページ：内側（ノド側）= safeInside、外側 = safeOutside
        const isRight = this.isRightPage(pageIndex);
        const si = isRight ? safeInside : safeOutside;
        const so = isRight ? safeOutside : safeInside;

        return {
            safeX: (fx + si) * scale,
            safeY: (fy + safeTop) * scale,
            safeW: (finishW - si - so) * scale,
            safeH: (finishH - safeTop - safeBottom) * scale,
            fx, fy, si, so
        };
    },

    /**
     * 矩形をページ境界内に収まるようにクランプする。
     * はみ出した分だけサイズを縮小し、位置を補正する。
     * @param {number} x @param {number} y @param {number} w @param {number} h
     * @param {number} pageW @param {number} pageH
     * @returns {{ x: number, y: number, w: number, h: number }}
     */
    clampRect(x, y, w, h, pageW, pageH) {
        if (x < 0) { w += x; x = 0; }
        if (y < 0) { h += y; y = 0; }
        if (x + w > pageW) w = pageW - x;
        if (y + h > pageH) h = pageH - y;
        return { x, y, w, h };
    }
};
