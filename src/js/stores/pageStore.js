// js/stores/pageStore.js - ページ・セリフ・コマのデータ管理
window.MangaApp = window.MangaApp || {};
window.MangaApp.stores = window.MangaApp.stores || {};

window.MangaApp.stores.usePageStore = Pinia.defineStore('page', () => {
    const { ref, computed } = Vue;

    const pages = ref([{ id: Date.now(), scripts: [], drawings: [] }]);
    const activePageIndex = ref(0);
    const currentMode = ref('plot');

    // Cross-store dependency (injected via setUiStore)
    let _uiStore = null;
    const setUiStore = (store) => { _uiStore = store; };

    const drawingCountWarning = computed(() => {
        const page = pages.value[activePageIndex.value];
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
        const isSmall = _uiStore ? _uiStore.isSmallScreen : false;
        if (isSmall) {
            return pages.value.map((page, i) => [{ ...page, pageIndex: i }]);
        }
        const result = [];
        if (pages.value.length > 0) result.push([{ ...pages.value[0], pageIndex: 0 }]);
        for (let i = 1; i < pages.value.length; i += 2) {
            const pair = [];
            pair.push({ ...pages.value[i], pageIndex: i });
            if (i + 1 < pages.value.length) pair.push({ ...pages.value[i + 1], pageIndex: i + 1 });
            result.push(pair);
        }
        return result;
    });

    const uniqueCharacters = computed(() => {
        const chars = new Set();
        pages.value.forEach(p => {
            p.scripts.forEach(s => {
                const name = s.char ? s.char.trim() : '';
                if (name) chars.add(name);
            });
        });
        return Array.from(chars).sort();
    });

    return {
        pages, activePageIndex, currentMode,
        drawingCountWarning, spreads, uniqueCharacters,
        setUiStore
    };
});
