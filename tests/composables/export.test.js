import { loadModule } from '../setup.js';

describe('exportUtils', () => {
    let exportUtils;

    beforeAll(() => {
        loadModule('src/js/composables/export.js');
        exportUtils = window.MangaApp.exportUtils;
    });

    describe('getTargetPageIndices', () => {
        it('rangeType=all で全ページ', () => {
            const result = exportUtils.getTargetPageIndices({ rangeType: 'all' }, 5, 2);
            expect(result).toEqual([0, 1, 2, 3, 4]);
        });

        it('rangeType=current で現在のページのみ', () => {
            const result = exportUtils.getTargetPageIndices({ rangeType: 'current' }, 5, 2);
            expect(result).toEqual([2]);
        });

        it('rangeType=custom で範囲指定', () => {
            const result = exportUtils.getTargetPageIndices(
                { rangeType: 'custom', rangeStart: 2, rangeEnd: 4 }, 10, 0
            );
            expect(result).toEqual([1, 2, 3]); // 1-based → 0-based
        });

        it('custom の範囲がページ数を超えた場合クランプ', () => {
            const result = exportUtils.getTargetPageIndices(
                { rangeType: 'custom', rangeStart: 1, rangeEnd: 100 }, 5, 0
            );
            expect(result).toEqual([0, 1, 2, 3, 4]);
        });
    });
});
