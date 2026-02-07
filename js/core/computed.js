// js/core/computed.js - Computed properties
window.MangaApp = window.MangaApp || {};

window.MangaApp.createComputed = function (deps) {
    const { computed } = deps.Vue;
    const state = deps.state;

    const saveStatusText = computed(() => {
        switch (state.saveStatus.value) {
            case 'saving': return '保存中...';
            case 'saved': return '保存完了';
            case 'error': return '保存失敗';
            case 'idle': return '未保存';
            default: return '';
        }
    });

    const displayW = computed(() => state.pageConfig.value.canvasW * state.pageConfig.value.scale);
    const displayH = computed(() => state.pageConfig.value.canvasH * state.pageConfig.value.scale);
    const pageStyle = computed(() => ({ width: displayW.value + 'px', height: displayH.value + 'px' }));

    const checkScreenSize = () => {
        const singleW = displayW.value;
        state.isSmallScreen.value = window.innerWidth < (singleW * 2 + 40);
    };

    const drawingCountWarning = computed(() => {
        const page = state.pages.value[state.activePageIndex.value];
        if (!page) return null;
        const count = page.drawings.length;
        if (count >= 9) {
            return { text: `コマ数過多 (${count})`, class: 'text-red-400 bg-red-900/30 border-red-500' };
        } else if (count >= 7) {
            return { text: `コマ数多め (${count})`, class: 'text-yellow-400 bg-yellow-900/30 border-yellow-500' };
        }
        return null;
    });

    const spreads = computed(() => {
        if (state.isSmallScreen.value) {
            return state.pages.value.map((page, i) => [{ ...page, pageIndex: i }]);
        }
        const result = [];
        if (state.pages.value.length > 0) result.push([{ ...state.pages.value[0], pageIndex: 0 }]);
        for (let i = 1; i < state.pages.value.length; i += 2) {
            const pair = [];
            pair.push({ ...state.pages.value[i], pageIndex: i });
            if (i + 1 < state.pages.value.length) pair.push({ ...state.pages.value[i + 1], pageIndex: i + 1 });
            result.push(pair);
        }
        return result;
    });

    const uniqueCharacters = computed(() => {
        const chars = new Set();
        state.pages.value.forEach(p => {
            p.scripts.forEach(s => {
                const name = s.char ? s.char.trim() : '';
                if (name) chars.add(name);
            });
        });
        return Array.from(chars).sort();
    });

    return {
        saveStatusText, displayW, displayH, pageStyle,
        checkScreenSize, drawingCountWarning, spreads, uniqueCharacters
    };
};
