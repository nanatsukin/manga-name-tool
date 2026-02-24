import { loadModule } from '../setup.js';

describe('layoutUtils', () => {
    let layoutUtils;

    beforeAll(() => {
        loadModule('src/js/composables/layout.js');
        layoutUtils = window.MangaApp.layoutUtils;
    });

    describe('isRightPage', () => {
        it('index 0 は右ページ', () => {
            expect(layoutUtils.isRightPage(0)).toBe(true);
        });

        it('奇数インデックスは右ページ', () => {
            expect(layoutUtils.isRightPage(1)).toBe(true);
            expect(layoutUtils.isRightPage(3)).toBe(true);
            expect(layoutUtils.isRightPage(5)).toBe(true);
        });

        it('偶数インデックス (0以外) は左ページ', () => {
            expect(layoutUtils.isRightPage(2)).toBe(false);
            expect(layoutUtils.isRightPage(4)).toBe(false);
            expect(layoutUtils.isRightPage(6)).toBe(false);
        });
    });

    describe('getSafeArea', () => {
        const config = {
            canvasW: 1800, canvasH: 2700,
            finishW: 1500, finishH: 2400,
            safeTop: 100, safeBottom: 100,
            safeInside: 80, safeOutside: 60
        };

        it('右ページで内側/外側マージンが正しい', () => {
            const area = layoutUtils.getSafeArea(config, 0);
            // fx = (1800-1500)/2 = 150, fy = (2700-2400)/2 = 150
            // isRight → si=80, so=60
            expect(area.si).toBe(80);
            expect(area.so).toBe(60);
            expect(area.fx).toBe(150);
            expect(area.fy).toBe(150);
            // scale=1: safeX = 150+80 = 230
            expect(area.safeX).toBe(230);
            expect(area.safeY).toBe(250); // 150+100
            expect(area.safeW).toBe(1360); // 1500-80-60
            expect(area.safeH).toBe(2200); // 2400-100-100
        });

        it('左ページでマージンが反転する', () => {
            const area = layoutUtils.getSafeArea(config, 2);
            // isRight=false → si=60 (safeOutside), so=80 (safeInside)
            expect(area.si).toBe(60);
            expect(area.so).toBe(80);
            expect(area.safeX).toBe(210); // 150+60
            expect(area.safeW).toBe(1360); // 1500-60-80 = 1360 (合計は同じ)
        });

        it('scale パラメータが座標に適用される', () => {
            const scale = 0.5;
            const area = layoutUtils.getSafeArea(config, 0, scale);
            expect(area.safeX).toBe(115); // 230 * 0.5
            expect(area.safeY).toBe(125); // 250 * 0.5
            expect(area.safeW).toBe(680); // 1360 * 0.5
            expect(area.safeH).toBe(1100); // 2200 * 0.5
            // fx, fy はスケールなし
            expect(area.fx).toBe(150);
            expect(area.fy).toBe(150);
        });
    });

    describe('clampRect', () => {
        it('範囲内の矩形はそのまま返す', () => {
            const result = layoutUtils.clampRect(10, 20, 100, 200, 500, 500);
            expect(result).toEqual({ x: 10, y: 20, w: 100, h: 200 });
        });

        it('負の座標をクランプする', () => {
            const result = layoutUtils.clampRect(-10, -20, 100, 200, 500, 500);
            expect(result).toEqual({ x: 0, y: 0, w: 90, h: 180 });
        });

        it('はみ出す幅をクランプする', () => {
            const result = layoutUtils.clampRect(450, 400, 100, 200, 500, 500);
            expect(result).toEqual({ x: 450, y: 400, w: 50, h: 100 });
        });
    });
});
