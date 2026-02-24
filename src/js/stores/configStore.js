// js/stores/configStore.js - 設定・キャンバスサイズ等の管理
window.MangaApp = window.MangaApp || {};
window.MangaApp.stores = window.MangaApp.stores || {};

window.MangaApp.stores.useConfigStore = Pinia.defineStore('config', () => {
    const { ref, computed } = Vue;

    /** @type {VueRef<PageConfig>} */
    const pageConfig = ref({
        canvasW: 6071, canvasH: 8598,
        finishW: 5197, finishH: 7323,
        bleed: 118, safeTop: 472, safeBottom: 472, safeInside: 472, safeOutside: 472,
        scale: 0.12,
        fontFamily: '"HiraMinProN-W3", "Yu Mincho", "MS PMincho", "Hiragino Mincho ProN", serif',
        defaultFontSize: 18
    });

    /** @type {FontOption[]} */
    const fontOptions = [
        { label: '明朝体 (標準)', value: '"HiraMinProN-W3", "Yu Mincho", "MS PMincho", "Hiragino Mincho ProN", serif' },
        { label: 'ゴシック体', value: '"HiraKakuProN-W3", "Yu Gothic", "MS PGothic", "Hiragino Sans", sans-serif' },
        { label: '丸ゴシック', value: '"Kosugi Maru", "Arial Rounded MT Bold", "Rounded Mplus 1c", sans-serif' },
        { label: 'アンチック体風 (Gothic+Mincho)', value: '"HiraMinProN-W3", "Yu Mincho", "MS PMincho", serif' }
    ];

    /** @type {VueRef<ExportSettings>} */
    const exportSettings = ref({
        format: 'png',
        rangeType: 'all',
        rangeStart: 1,
        rangeEnd: 1
    });

    /** @type {VueRef<FileSystemFileHandle | null>} */
    const currentFileHandle = ref(null);

    const displayW = computed(() => pageConfig.value.canvasW * pageConfig.value.scale);
    const displayH = computed(() => pageConfig.value.canvasH * pageConfig.value.scale);
    const pageStyle = computed(() => ({ width: displayW.value + 'px', height: displayH.value + 'px' }));

    return {
        pageConfig, fontOptions, exportSettings, currentFileHandle,
        displayW, displayH, pageStyle
    };
});
