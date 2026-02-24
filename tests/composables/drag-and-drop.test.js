import { loadModule } from '../setup.js';

describe('dndUtils', () => {
    let dndUtils;

    beforeAll(() => {
        loadModule('src/js/composables/drag-and-drop.js');
        dndUtils = window.MangaApp.dndUtils;
    });

    describe('arrayMove', () => {
        it('前方に移動 (index 3 → 1)', () => {
            const arr = ['a', 'b', 'c', 'd', 'e'];
            dndUtils.arrayMove(arr, 3, 1);
            expect(arr).toEqual(['a', 'd', 'b', 'c', 'e']);
        });

        it('後方に移動 (index 1 → 3)', () => {
            const arr = ['a', 'b', 'c', 'd', 'e'];
            dndUtils.arrayMove(arr, 1, 3);
            expect(arr).toEqual(['a', 'c', 'd', 'b', 'e']);
        });

        it('同位置は変化なし', () => {
            const arr = ['a', 'b', 'c'];
            dndUtils.arrayMove(arr, 1, 1);
            expect(arr).toEqual(['a', 'b', 'c']);
        });

        it('先頭に移動', () => {
            const arr = ['a', 'b', 'c'];
            dndUtils.arrayMove(arr, 2, 0);
            expect(arr).toEqual(['c', 'a', 'b']);
        });

        it('末尾に移動', () => {
            const arr = ['a', 'b', 'c'];
            dndUtils.arrayMove(arr, 0, 2);
            expect(arr).toEqual(['b', 'c', 'a']);
        });
    });
});
