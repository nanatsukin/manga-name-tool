// js/stores/uiStore.js - モーダル・選択状態・UI状態管理
window.MangaApp = window.MangaApp || {};
window.MangaApp.stores = window.MangaApp.stores || {};

window.MangaApp.stores.useUiStore = Pinia.defineStore('ui', () => {
    const { ref, computed } = Vue;

    // --- Modals ---
    /** 設定モーダルの表示フラグ。 */
    /** @type {VueRef<boolean>} */
    const showSettings = ref(false);
    /** テキスト確認モーダルの表示フラグ。 */
    /** @type {VueRef<boolean>} */
    const showTextModal = ref(false);
    /** エクスポートモーダルの表示フラグ。 */
    /** @type {VueRef<boolean>} */
    const showExportModal = ref(false);
    /** 描画モーダルの表示フラグ。 */
    /** @type {VueRef<boolean>} */
    const showDrawingModal = ref(false);
    /** 描画モーダルで現在編集中の Drawing オブジェクト。 */
    /** @type {VueRef<Drawing | null>} */
    const currentEditingDrawing = ref(null);
    /** 描画モーダル内の Canvas 要素への参照。 */
    /** @type {VueRef<HTMLCanvasElement | null>} */
    const modalCanvasRef = ref(null);

    // --- Selection ---
    /** 名前モードで選択中のアイテム ID（Script または Drawing の id）。 */
    /** @type {VueRef<number | null>} */
    const selectedItemId = ref(null);
    /** コピー済みページの ID（コピー完了フィードバック表示用、1秒後に null にリセット）。 */
    /** @type {VueRef<number | null>} */
    const copiedPageId = ref(null);

    // --- Menu / responsive ---
    /** ハンバーガーメニューの開閉状態。 */
    /** @type {VueRef<boolean>} */
    const isMenuOpen = ref(false);
    /** 出力・連携ドロップダウンの開閉状態。 */
    /** @type {VueRef<boolean>} */
    const showOutputMenu = ref(false);
    /** ウィンドウ幅が見開き2ページ表示に足りない小画面かどうか。 */
    /** @type {VueRef<boolean>} */
    const isSmallScreen = ref(false);
    /** プロットモードで「…」メニューが開いているセリフの一意キー（"pIndex-idx" 形式）。 */
    /** @type {VueRef<string | null>} */
    const openScriptMenuId = ref(null);

    // --- Save / processing ---
    /** 自動保存の現在のステータス。 */
    /** @type {VueRef<SaveStatus>} */
    const saveStatus = ref('idle');
    /** 起動時の IDB 復元処理中フラグ（復元中は自動保存をスキップする）。 */
    /** @type {VueRef<boolean>} */
    const isRestoring = ref(true);
    /** 重い処理（復元・プロジェクト読み込み等）の実行中フラグ。 */
    /** @type {VueRef<boolean>} */
    const isProcessing = ref(false);
    /** エクスポート処理の実行中フラグ。 */
    /** @type {VueRef<boolean>} */
    const isExporting = ref(false);
    /** エクスポートのプログレスバー値（0〜100）。 */
    /** @type {VueRef<number>} */
    const progress = ref(0);
    /** プログレスバーに表示するメッセージ（例: "エクスポート中 (3/10)"）。 */
    /** @type {VueRef<string>} */
    const progressMessage = ref('');
    /** 自動保存のデバウンスタイマー ID（setTimeout の戻り値）。 */
    /** @type {ReturnType<typeof setTimeout> | null} */
    let autoSaveTimer = null;

    /**
     * saveStatus を日本語のラベルに変換する computed。
     * ヘッダーのステータス表示テキストとして使用する。
     * @type {VueComputedRef<string>}
     */
    const saveStatusText = computed(() => {
        switch (saveStatus.value) {
            case 'saving': return '保存中...';
            case 'saved': return '保存完了';
            case 'error': return '保存失敗';
            case 'idle': return '未保存';
            default: return '';
        }
    });

    // --- Drag & drop (plot mode) ---
    /** プロットモードでドラッグ中のセリフの位置情報。 */
    /** @type {VueRef<DraggingItem | null>} */
    const draggingItem = ref(null);
    /** プロットモードでのドロップ先の位置情報。 */
    /** @type {VueRef<DropTarget | null>} */
    const dropTarget = ref(null);

    // --- Drag & drop (conte mode) ---
    /** コンテモードでドラッグ中のセリフ。 */
    /** @type {VueRef<Script | null>} */
    const draggingConteScript = ref(null);
    /** コンテモードのドロップターゲット Drawing の ID。 */
    /** @type {VueRef<number | null>} */
    const isConteDropTarget = ref(null);
    /** コンテモードでドラッグ中の Drawing のインデックス。 */
    /** @type {VueRef<number | null>} */
    const draggingDrawingIndex = ref(null);
    /** コンテモードでのドロップ先 Drawing のインデックス。 */
    /** @type {VueRef<number | null>} */
    const dropTargetDrawingIndex = ref(null);
    /** Drawing のドラッグ操作が開始可能な状態かどうか（ハンドル長押し後 true になる）。 */
    /** @type {VueRef<boolean>} */
    const isDrawingDragReady = ref(false);

    // --- Drawing mode ---
    /** 画像の移動・スケール編集モードが有効かどうか。 */
    /** @type {VueRef<boolean>} */
    const isImageEditMode = ref(false);
    /** アクティブな描画ツール（'pen' | 'eraser'）。 */
    /** @type {VueRef<string>} */
    const drawingTool = ref('pen');
    /** 描画操作中（ポインターダウン中）かどうか。 */
    /** @type {VueRef<boolean>} */
    const isDrawing = ref(false);
    /** 最後にアクティブだった Drawing の ID（Canvas 復元時の参照用）。 */
    /** @type {VueRef<number | null>} */
    const lastActiveDrawingId = ref(null);
    /** 描画時の直前のポインター座標（連続線を引くために使用）。 */
    /** @type {{ x: number, y: number }} */
    const lastPos = { x: 0, y: 0 };

    // --- Export/view flags ---
    /** テキストレイヤーのみ表示するモード（テキスト位置確認用）。 */
    /** @type {VueRef<boolean>} */
    const isTextLayerMode = ref(false);
    /** ガイド線（安全マージン・仕上がり線等）を非表示にするモード。 */
    /** @type {VueRef<boolean>} */
    const isHideGuideMode = ref(false);
    /** 描画レイヤーを非表示にするモード。 */
    /** @type {VueRef<boolean>} */
    const isHideDrawingMode = ref(false);
    /** 背景を透明にするモード（PNG エクスポート時の透明度確認用）。 */
    /** @type {VueRef<boolean>} */
    const isTransparentMode = ref(false);

    // --- DOM refs ---
    /** コンテモードの各 Drawing の Canvas 要素（Drawing ID をキーとする辞書）。 */
    /** @type {VueRef<Record<number, HTMLCanvasElement>>} */
    const canvasRefs = ref({});
    /** 名前モードのセリフ入力欄（"ページインデックス-セリフインデックス-type" をキーとする辞書）。 */
    /** @type {VueRef<Record<string, HTMLElement>>} */
    const scriptInputRefs = ref({});
    /** 名前モードのスクロールコンテナ要素（スクロール位置の保存・復元に使用）。 */
    /** @type {VueRef<HTMLElement | null>} */
    const nameModeContainer = ref(null);
    /** ファイル選択の input 要素（旧来のファイルピッカーフォールバック用）。 */
    /** @type {VueRef<HTMLInputElement | null>} */
    const fileInput = ref(null);
    /** 名前モードのスクロール位置（モード切替時に復元するために保存）。 */
    /** @type {number} */
    let nameModeScrollTop = 0;

    // Cross-store dependency (injected via setConfigStore)
    /** @type {ConfigStoreInstance | null} */
    let _configStore = null;
    /**
     * configStore への参照を注入する（循環依存回避のため setter で後から設定）。
     * @param {ConfigStoreInstance} store
     */
    const setConfigStore = (store) => { _configStore = store; };

    /**
     * ウィンドウ幅を判定して isSmallScreen を更新する。
     * 見開き2ページ分の幅（displayW × 2 + 40px）より小さければ小画面と判定する。
     */
    const checkScreenSize = () => {
        if (!_configStore) return;
        const singleW = _configStore.displayW;
        isSmallScreen.value = window.innerWidth < (singleW * 2 + 40);
    };

    return {
        showSettings, showTextModal, showExportModal, showDrawingModal,
        currentEditingDrawing, modalCanvasRef,
        selectedItemId, copiedPageId,
        isMenuOpen, showOutputMenu, isSmallScreen, openScriptMenuId,
        saveStatus, saveStatusText, isRestoring, isProcessing, isExporting,
        progress, progressMessage,
        get autoSaveTimer() { return autoSaveTimer; },
        set autoSaveTimer(v) { autoSaveTimer = v; },
        draggingItem, dropTarget,
        draggingConteScript, isConteDropTarget,
        draggingDrawingIndex, dropTargetDrawingIndex, isDrawingDragReady,
        isImageEditMode, drawingTool, isDrawing, lastActiveDrawingId, lastPos,
        isTextLayerMode, isHideGuideMode, isHideDrawingMode, isTransparentMode,
        canvasRefs, scriptInputRefs, nameModeContainer, fileInput,
        get nameModeScrollTop() { return nameModeScrollTop; },
        set nameModeScrollTop(v) { nameModeScrollTop = v; },
        checkScreenSize, setConfigStore
    };
});
