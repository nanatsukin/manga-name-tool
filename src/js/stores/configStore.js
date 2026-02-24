// js/stores/configStore.js - 設定・キャンバスサイズ等の管理
window.MangaApp = window.MangaApp || {};
window.MangaApp.stores = window.MangaApp.stores || {};

window.MangaApp.stores.useConfigStore = Pinia.defineStore('config', () => {
    const { ref, computed } = Vue;

    /**
     * ページの寸法・余白・スケール・フォント設定。
     * 単位はピクセル（印刷解像度 350dpi 相当の実寸値を使用）。
     * @type {VueRef<PageConfig>}
     */
    const pageConfig = ref({
        canvasW: 6071, canvasH: 8598,      // Canvas の実寸（断ち落とし含む全体）
        finishW: 5197, finishH: 7323,       // 仕上がりサイズ（断ち落とし除く）
        bleed: 118,                          // 断ち落とし幅
        safeTop: 472, safeBottom: 472,       // 天地の安全マージン
        safeInside: 472, safeOutside: 472,   // ノド・小口の安全マージン
        scale: 0.12,                         // 画面表示倍率（実寸 × scale = 表示px）
        fontFamily: '"HiraMinProN-W3", "Yu Mincho", "MS PMincho", "Hiragino Mincho ProN", serif',
        defaultFontSize: 18
    });

    /** 使用可能なフォントの選択肢（UI のセレクトボックス用）。 */
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

    /** 上書き保存に使う File System Access API のファイルハンドル。null なら未保存。 */
    /** @type {VueRef<FileSystemFileHandle | null>} */
    const currentFileHandle = ref(null);

    /**
     * 画面表示用の Canvas 横幅（ピクセル）。
     * canvasW × scale で計算される。
     * @type {VueComputedRef<number>}
     */
    const displayW = computed(() => pageConfig.value.canvasW * pageConfig.value.scale);

    /**
     * 画面表示用の Canvas 縦幅（ピクセル）。
     * canvasH × scale で計算される。
     * @type {VueComputedRef<number>}
     */
    const displayH = computed(() => pageConfig.value.canvasH * pageConfig.value.scale);

    /**
     * ページ要素に適用する CSS サイズスタイル。
     * @type {VueComputedRef<{ width: string, height: string }>}
     */
    const pageStyle = computed(() => ({ width: displayW.value + 'px', height: displayH.value + 'px' }));

    return {
        pageConfig, fontOptions, exportSettings, currentFileHandle,
        displayW, displayH, pageStyle
    };
});
