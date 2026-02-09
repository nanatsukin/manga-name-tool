
const { createApp, ref, computed, nextTick, watch, onMounted, onBeforeUpdate } = Vue;
const { createPinia, storeToRefs } = Pinia;
const { get, set } = idbKeyval;

const pinia = createPinia();

const app = createApp({
    setup() {
        const VueDeps = { Vue: { ref, computed, nextTick, watch, onMounted, onBeforeUpdate } };

        // --- 1. Stores ---
        const pageStore = window.MangaApp.stores.usePageStore();
        const configStore = window.MangaApp.stores.useConfigStore();
        const uiStore = window.MangaApp.stores.useUiStore();
        const historyStore = window.MangaApp.stores.useHistoryStore();

        // Wire cross-store dependencies
        pageStore.setUiStore(uiStore);
        uiStore.setConfigStore(configStore);
        historyStore.setStores(pageStore, uiStore);

        // --- Composables (pure functions, no factory needed) ---
        const canvasUtils = window.MangaApp.canvasUtils;
        const dndUtils = window.MangaApp.dndUtils;
        const layoutUtils = window.MangaApp.layoutUtils;
        const exportUtils = window.MangaApp.exportUtils;
        const autoSaveUtils = window.MangaApp.autoSaveUtils;

        // Inject canvasUtils into historyStore
        historyStore.setCanvasUtils(canvasUtils);

        // --- 2. Helpers ---
        const helpers = window.MangaApp.createHelpers({
            Vue: VueDeps.Vue, pageStore, configStore, uiStore, layoutUtils, addScript: null
        });

        // --- 3. Canvas ---
        const canvas = window.MangaApp.createCanvas({
            Vue: VueDeps.Vue, pageStore, uiStore, historyStore, helpers, canvasUtils
        });

        // --- 4. Page Operations ---
        const pageOps = window.MangaApp.createPageOps({
            Vue: VueDeps.Vue, pageStore, configStore, uiStore, historyStore, helpers, canvas, canvasUtils, dndUtils
        });

        // Wire up late dependency: helpers.focusNext needs addScript
        helpers.setAddScript(pageOps.addScript);

        // --- 5. Drag Plot ---
        const dragPlot = window.MangaApp.createDragPlot({ pageStore, uiStore });

        // --- 6. Drag Conte ---
        const dragConte = window.MangaApp.createDragConte({ pageStore, uiStore, canvas, canvasUtils, dndUtils });

        // --- 7. Layout ---
        const layout = window.MangaApp.createLayout({
            pageStore, configStore, uiStore, historyStore, helpers, canvas, layoutUtils, dndUtils
        });

        // --- 8. Project I/O ---
        const projectIO = window.MangaApp.createProjectIO({
            Vue: VueDeps.Vue, pageStore, configStore, uiStore, helpers, canvas, canvasUtils, autoSaveUtils
        });

        // --- 9. Export ---
        const exporter = window.MangaApp.createExport({
            Vue: VueDeps.Vue, pageStore, configStore, uiStore, layoutUtils, exportUtils
        });

        // --- 10. Keyboard ---
        const keyboard = window.MangaApp.createKeyboard({
            Vue: VueDeps.Vue, pageStore, uiStore, helpers
        });

        // --- Watchers ---
        const { currentMode, activePageIndex, pages } = storeToRefs(pageStore);
        const { pageConfig, displayW } = storeToRefs(configStore);

        watch([currentMode, activePageIndex], async () => {
            if (pageStore.currentMode === 'conte') {
                canvas.restoreAllCanvases();
            }
        });

        watch([pages, pageConfig], () => {
            if (uiStore.isRestoring) return;
            clearTimeout(uiStore.autoSaveTimer);
            uiStore.autoSaveTimer = setTimeout(() => autoSaveUtils.autoSaveToIDB(pageStore, configStore, uiStore), 2000);
        }, { deep: true });

        watch(displayW, () => uiStore.checkScreenSize());

        // --- Lifecycle ---
        onMounted(async () => {
            try {
                const restored = await autoSaveUtils.restoreFromIDB(
                    pageStore, configStore, uiStore, canvasUtils, helpers, nextTick
                );
                if (!restored) {
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

            window.addEventListener('resize', () => {
                helpers.resizeTextareas();
                uiStore.checkScreenSize();
            });
            uiStore.checkScreenSize();
            window.addEventListener('keydown', canvas.handleGlobalKeydown);
        });

        onBeforeUpdate(() => {
            uiStore.canvasRefs = {};
            uiStore.scriptInputRefs = {};
        });

        // --- Return ---
        // storeToRefs for template reactivity
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
