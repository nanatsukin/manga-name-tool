// js/stores/pageStore.js - ページ・セリフ・コマのデータ管理
window.MangaApp = window.MangaApp || {};
window.MangaApp.stores = window.MangaApp.stores || {};

window.MangaApp.stores.usePageStore = Pinia.defineStore('page', () => {
    const { ref, computed } = Vue;

    /** @type {VueRef<Page[]>} */
    const pages = ref([{ id: Date.now(), scripts: [], drawings: [] }]);
    /** @type {VueRef<number>} */
    const activePageIndex = ref(0);
    /** @type {VueRef<string>} */
    const currentMode = ref('plot');

    // Cross-store dependency (injected via setUiStore)
    /** @type {UiStoreInstance | null} */
    let _uiStore = null;
    /**
     * uiStore への参照を注入する（循環依存回避のため setter で後から設定）。
     * @param {UiStoreInstance} store
     */
    const setUiStore = (store) => { _uiStore = store; };

    /**
     * アクティブページのコマ数が多い場合に警告テキストとスタイルクラスを返す computed。
     * 7コマ以上で黄色警告、9コマ以上で赤警告。
     * @type {VueComputedRef<{ text: string, class: string } | null>}
     */
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

    /**
     * 全ページを見開き単位の配列に変換する computed。
     * スマートフォンなど小画面では1ページずつの配列を返す。
     * index 0 のページは単独（右ページ扱い）、以降は2ページずつペアになる。
     * @type {VueComputedRef<SpreadPage[][]>}
     */
    const spreads = computed(() => {
        const isSmall = _uiStore ? _uiStore.isSmallScreen : false;
        if (isSmall) {
            // 小画面：全ページを1枚ずつ独立した見開きとして扱う
            return pages.value.map((page, i) => [{ ...page, pageIndex: i }]);
        }
        const result = [];
        // index 0 は単独の右ページ（表紙）
        if (pages.value.length > 0) result.push([{ ...pages.value[0], pageIndex: 0 }]);
        // index 1 以降は 2 ページずつペアリング（奇数=右、偶数=左）
        for (let i = 1; i < pages.value.length; i += 2) {
            const pair = [];
            pair.push({ ...pages.value[i], pageIndex: i });
            if (i + 1 < pages.value.length) pair.push({ ...pages.value[i + 1], pageIndex: i + 1 });
            result.push(pair);
        }
        return result;
    });

    /**
     * 全ページのセリフから登場人物名を重複なく抽出してソートした配列を返す computed。
     * キャラクター名候補の datalist に使用する。
     * @type {VueComputedRef<string[]>}
     */
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
