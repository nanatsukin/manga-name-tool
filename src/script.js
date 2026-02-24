
const { createApp, ref, computed, nextTick, watch, onMounted, onBeforeUpdate } = Vue;
const { createPinia, storeToRefs } = Pinia;
const { get, set } = idbKeyval;

const pinia = createPinia();

/**
 * Vue アプリケーションのルートコンポーネント。
 * setup() でストア・コンポーザブル・モジュールをすべてインスタンス化し、
 * テンプレートに必要な状態・関数を return で公開する。
 */
const app = createApp({
    setup() {
        const VueDeps = { Vue: { ref, computed, nextTick, watch, onMounted, onBeforeUpdate } };

        // --- 1. Stores ---
        // Pinia ストアをインスタンス化する（各ストアはシングルトン）
        /** @type {PageStoreInstance} */
        const pageStore = window.MangaApp.stores.usePageStore();
        /** @type {ConfigStoreInstance} */
        const configStore = window.MangaApp.stores.useConfigStore();
        /** @type {UiStoreInstance} */
        const uiStore = window.MangaApp.stores.useUiStore();
        /** @type {HistoryStoreInstance} */
        const historyStore = window.MangaApp.stores.useHistoryStore();

        // ストア間の循環依存を setter で後から解決する
        pageStore.setUiStore(uiStore);       // pageStore.spreads が uiStore.isSmallScreen を参照する
        uiStore.setConfigStore(configStore); // uiStore.saveStatusText が configStore を参照する
        historyStore.setStores(pageStore, uiStore); // historyStore が drawing 検索に pageStore を使う

        // --- Composables (pure functions, no factory needed) ---
        // コンポーザブルは依存なしの純粋関数オブジェクト（インスタンス化不要）
        /** @type {CanvasUtils} */
        const canvasUtils = window.MangaApp.canvasUtils;
        /** @type {DndUtils} */
        const dndUtils = window.MangaApp.dndUtils;
        /** @type {LayoutUtils} */
        const layoutUtils = window.MangaApp.layoutUtils;
        /** @type {ExportUtils} */
        const exportUtils = window.MangaApp.exportUtils;
        /** @type {AutoSaveUtils} */
        const autoSaveUtils = window.MangaApp.autoSaveUtils;

        // historyStore が Canvas の Undo/Redo に canvasUtils を使うので注入する
        historyStore.setCanvasUtils(canvasUtils);

        // --- 2. Helpers ---
        // helpers は addScript（page-ops で定義）への参照を後から setAddScript で注入する
        /** @type {HelpersInstance} */
        const helpers = window.MangaApp.createHelpers({
            Vue: VueDeps.Vue, pageStore, configStore, uiStore, layoutUtils, addScript: null
        });

        // --- 3. Canvas ---
        // Canvas 描画・モーダル・undo/redo を担当するモジュール
        /** @type {CanvasModuleInstance} */
        const canvas = window.MangaApp.createCanvas({
            Vue: VueDeps.Vue, pageStore, uiStore, historyStore, helpers, canvasUtils
        });

        // --- 4. Page Operations ---
        // ページ・セリフ・Drawing の CRUD、モード切替、ページ移動を担当するモジュール
        /** @type {PageOpsInstance} */
        const pageOps = window.MangaApp.createPageOps({
            Vue: VueDeps.Vue, pageStore, configStore, uiStore, historyStore, helpers, canvas, canvasUtils, dndUtils
        });

        // helpers.focusNext は「最後のセリフで Tab → 新規セリフ追加」のために addScript が必要。
        // page-ops が生成された後にバインドして循環依存を解消する（late binding）
        helpers.setAddScript(pageOps.addScript);

        // --- 5. Drag Plot ---
        // plot モードのセリフ並び替えドラッグ操作を担当するモジュール
        /** @type {DragPlotInstance} */
        const dragPlot = window.MangaApp.createDragPlot({ pageStore, uiStore });

        // --- 6. Drag Conte ---
        // conte モードの Drawing・セリフのドラッグ操作を担当するモジュール
        /** @type {DragConteInstance} */
        const dragConte = window.MangaApp.createDragConte({ pageStore, uiStore, canvas, canvasUtils, dndUtils });

        // --- 7. Layout ---
        // name モードの Drawing・セリフのドラッグ・リサイズ・自動レイアウトを担当するモジュール
        /** @type {LayoutModuleInstance} */
        const layout = window.MangaApp.createLayout({
            pageStore, configStore, uiStore, historyStore, helpers, canvas, layoutUtils, dndUtils
        });

        // --- 8. Project I/O ---
        // プロジェクトファイルの保存・読み込みを担当するモジュール
        /** @type {ProjectIOInstance} */
        const projectIO = window.MangaApp.createProjectIO({
            Vue: VueDeps.Vue, pageStore, configStore, uiStore, helpers, canvas, canvasUtils, autoSaveUtils
        });

        // --- 9. Export ---
        // PNG・PSD への書き出しを担当するモジュール
        /** @type {ExportModuleInstance} */
        const exporter = window.MangaApp.createExport({
            Vue: VueDeps.Vue, pageStore, configStore, uiStore, layoutUtils, exportUtils
        });

        // --- 10. Keyboard ---
        // セリフの分割・結合、フォーカス移動などのキーボード操作を担当するモジュール
        /** @type {KeyboardInstance} */
        const keyboard = window.MangaApp.createKeyboard({
            Vue: VueDeps.Vue, pageStore, uiStore, helpers
        });

        // --- Watchers ---
        const { currentMode, activePageIndex, pages } = storeToRefs(pageStore);
        const { pageConfig, displayW } = storeToRefs(configStore);

        // モードまたはページが変わったとき、conte モードなら Canvas の描画内容を復元する
        watch([currentMode, activePageIndex], async () => {
            if (pageStore.currentMode === 'conte') {
                canvas.restoreAllCanvases();
            }
        });

        // ページデータまたは設定が変わったとき、2 秒後に IndexedDB へ自動保存する（デバウンス）
        watch([pages, pageConfig], () => {
            if (uiStore.isRestoring) return; // IDB からの復元中は自動保存しない
            clearTimeout(uiStore.autoSaveTimer);
            uiStore.autoSaveTimer = setTimeout(() => autoSaveUtils.autoSaveToIDB(pageStore, configStore, uiStore), 2000);
        }, { deep: true });

        // 画面幅が変わったとき（ページ設定の scale 変更など）、小画面判定を更新する
        watch(displayW, () => uiStore.checkScreenSize());

        // --- Lifecycle ---
        onMounted(async () => {
            try {
                // IndexedDB から前回のプロジェクトを復元する
                const restored = await autoSaveUtils.restoreFromIDB(
                    pageStore, configStore, uiStore, canvasUtils, helpers, nextTick
                );
                if (!restored) {
                    // 復元データがない場合は初期 Drawing の Undo 履歴を初期化する
                    if (pageStore.pages[0].drawings[0]) historyStore.saveHistory(pageStore.pages[0].drawings[0]);
                    nextTick(() => helpers.resizeTextareas());
                }
            } catch (e) {
                console.error("Restore failed:", e);
                alert("データの復元に失敗しました。");
            } finally {
                uiStore.isRestoring = false;
                uiStore.isProcessing = false;
            }

            // ウィンドウリサイズ時に Textarea の高さと小画面フラグを更新する
            window.addEventListener('resize', () => {
                helpers.resizeTextareas();
                uiStore.checkScreenSize();
            });
            uiStore.checkScreenSize();

            // グローバルキーボードショートカット（Ctrl+Z / Ctrl+Y）を登録する
            window.addEventListener('keydown', canvas.handleGlobalKeydown);
        });

        // 再レンダリング前に DOM ref の辞書をクリアする（古い ref が残らないようにする）
        onBeforeUpdate(() => {
            uiStore.canvasRefs = {};
            uiStore.scriptInputRefs = {};
        });

        // --- Return ---
        // テンプレートのリアクティビティのために storeToRefs でラップして返す
        const pageRefs = storeToRefs(pageStore);
        const configRefs = storeToRefs(configStore);
        const uiRefs = storeToRefs(uiStore);
        const historyRefs = storeToRefs(historyStore);

        return {
            // Page store
            currentMode: pageRefs.currentMode,
            pages: pageRefs.pages,
            activePageIndex: pageRefs.activePageIndex,
            spreads: pageRefs.spreads,
            drawingCountWarning: pageRefs.drawingCountWarning,
            uniqueCharacters: pageRefs.uniqueCharacters,

            // Config store
            pageConfig: configRefs.pageConfig,
            exportSettings: configRefs.exportSettings,
            currentFileHandle: configRefs.currentFileHandle,
            fontOptions: configStore.fontOptions,
            pageStyle: configRefs.pageStyle,

            // UI store
            drawingTool: uiRefs.drawingTool,
            isExporting: uiRefs.isExporting,
            canvasRefs: uiRefs.canvasRefs,
            showSettings: uiRefs.showSettings,
            saveStatus: uiRefs.saveStatus,
            saveStatusText: uiRefs.saveStatusText,
            showTextModal: uiRefs.showTextModal,
            copiedPageId: uiRefs.copiedPageId,
            selectedItemId: uiRefs.selectedItemId,
            isImageEditMode: uiRefs.isImageEditMode,
            showDrawingModal: uiRefs.showDrawingModal,
            currentEditingDrawing: uiRefs.currentEditingDrawing,
            modalCanvasRef: uiRefs.modalCanvasRef,
            isConteDropTarget: uiRefs.isConteDropTarget,
            draggingDrawingIndex: uiRefs.draggingDrawingIndex,
            dropTargetDrawingIndex: uiRefs.dropTargetDrawingIndex,
            isDrawingDragReady: uiRefs.isDrawingDragReady,
            isProcessing: uiRefs.isProcessing,
            isTextLayerMode: uiRefs.isTextLayerMode,
            isHideGuideMode: uiRefs.isHideGuideMode,
            isHideDrawingMode: uiRefs.isHideDrawingMode,
            isTransparentMode: uiRefs.isTransparentMode,
            showExportModal: uiRefs.showExportModal,
            isMenuOpen: uiRefs.isMenuOpen,
            fileInput: uiRefs.fileInput,
            nameModeContainer: uiRefs.nameModeContainer,
            progress: uiRefs.progress,
            progressMessage: uiRefs.progressMessage,

            // Helpers
            guideProps: helpers.guideProps,
            adjustHeight: helpers.adjustHeight,
            setInputRef: helpers.setInputRef,
            focusText: helpers.focusText,
            focusNext: helpers.focusNext,
            focusPrev: helpers.focusPrev,
            getPageTextPreview: helpers.getPageTextPreview,
            copyPageText: helpers.copyPageText,
            copyAllPlots: helpers.copyAllPlots,
            getUnassignedScripts: helpers.getUnassignedScripts,
            getScriptsForDrawing: helpers.getScriptsForDrawing,
            getClientPos: helpers.getClientPos,

            // History
            undo: historyStore.undo,
            redo: historyStore.redo,
            canUndo: historyStore.canUndo,
            canRedo: historyStore.canRedo,
            undoName: historyStore.undoName,
            redoName: historyStore.redoName,

            // Canvas
            startDraw: canvas.startDraw,
            draw: canvas.draw,
            stopDraw: canvas.stopDraw,
            clearCurrentPageCanvas: canvas.clearCurrentPageCanvas,
            openDrawingModal: canvas.openDrawingModal,
            closeDrawingModal: canvas.closeDrawingModal,

            // Page operations
            changeMode: pageOps.changeMode,
            addPage: pageOps.addPage,
            deletePage: pageOps.deletePage,
            addScript: pageOps.addScript,
            removeScript: pageOps.removeScript,
            toggleScriptType: pageOps.toggleScriptType,
            addNoteToCurrentPage: pageOps.addNoteToCurrentPage,
            moveScript: pageOps.moveScript,
            insertScriptAfter: pageOps.insertScriptAfter,
            moveSubsequentScriptsToNewPage: pageOps.moveSubsequentScriptsToNewPage,
            nextPage: pageOps.nextPage,
            prevPage: pageOps.prevPage,
            selectItem: pageOps.selectItem,
            toggleImageEditMode: pageOps.toggleImageEditMode,
            addDrawing: pageOps.addDrawing,
            removeDrawing: pageOps.removeDrawing,
            jumpToPlot: pageOps.jumpToPlot,
            jumpToConte: pageOps.jumpToConte,
            jumpToName: pageOps.jumpToName,
            sortAllScriptsByConteOrder: pageOps.sortAllScriptsByConteOrder,
            applyFontSizeToAll: pageOps.applyFontSizeToAll,

            // Drag plot
            dragStart: dragPlot.dragStart,
            dragOverScript: dragPlot.dragOverScript,
            dragOverPage: dragPlot.dragOverPage,
            dropOnScript: dragPlot.dropOnScript,
            dropOnPage: dragPlot.dropOnPage,
            dragEnd: dragPlot.dragEnd,
            isDropTarget: dragPlot.isDropTarget,
            isDragging: dragPlot.isDragging,

            // Drag conte
            onHandleDown: dragConte.onHandleDown,
            onHandleUp: dragConte.onHandleUp,
            dragStartDrawing: dragConte.dragStartDrawing,
            dragEndDrawing: dragConte.dragEndDrawing,
            dragOverDrawing: dragConte.dragOverDrawing,
            dropOnDrawing: dragConte.dropOnDrawing,
            dragStartConteScript: dragConte.dragStartConteScript,
            dragEndConteScript: dragConte.dragEndConteScript,
            dragOverConteScript: dragConte.dragOverConteScript,
            dropOnConteScript: dragConte.dropOnConteScript,
            dropOnConteDrawing: dragConte.dropOnConteDrawing,
            dropOnConteUnassigned: dragConte.dropOnConteUnassigned,

            // Layout
            startLayoutDrag: layout.startLayoutDrag,
            startLayoutResize: layout.startLayoutResize,
            onImageWheel: layout.onImageWheel,
            zoomImage: layout.zoomImage,
            moveItemPage: layout.moveItemPage,
            moveDrawingPage: layout.moveDrawingPage,
            autoLayoutCurrentPage: layout.autoLayoutCurrentPage,

            // Project I/O
            saveProject: projectIO.saveProject,
            saveProjectAs: projectIO.saveProjectAs,
            loadProjectFromFile: projectIO.loadProjectFromFile,
            handleFileChange: projectIO.handleFileChange,

            // Export
            openExportModal: exporter.openExportModal,
            executeExport: exporter.executeExport,
            exportData: exporter.exportData,

            // Keyboard
            handleScriptTextKeydown: keyboard.handleScriptTextKeydown,
            splitScriptFromButton: keyboard.splitScriptFromButton
        };
    }
});

app.use(pinia);
app.mount('#app');
