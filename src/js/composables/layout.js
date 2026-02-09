// js/composables/layout.js - ページ座標計算・境界クランプ
window.MangaApp = window.MangaApp || {};

window.MangaApp.layoutUtils = {
    // 右ページ判定 (index 0 または奇数)
    isRightPage(pageIndex) {
        return (pageIndex === 0) || (pageIndex % 2 !== 0);
    },

    // 安全領域座標の計算
    // scale=1 でスケールなし (export用)、scale=config.scale でスケール済み
    getSafeArea(config, pageIndex, scale) {
        if (scale === undefined) scale = 1;
        const { canvasW, canvasH, finishW, finishH, safeTop, safeBottom, safeInside, safeOutside } = config;

        const fx = (canvasW - finishW) / 2;
        const fy = (canvasH - finishH) / 2;
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

    // 矩形を 0〜pageW/pageH 内にクランプ
    clampRect(x, y, w, h, pageW, pageH) {
        if (x < 0) { w += x; x = 0; }
        if (y < 0) { h += y; y = 0; }
        if (x + w > pageW) w = pageW - x;
        if (y + h > pageH) h = pageH - y;
        return { x, y, w, h };
    }
};
