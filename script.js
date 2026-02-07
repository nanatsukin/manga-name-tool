
const { createApp, ref, computed, nextTick, watch, onMounted, onBeforeUpdate } = Vue;
const { get, set } = idbKeyval;

createApp({
    setup() {
        const VueDeps = { Vue: { ref, computed, nextTick, watch, onMounted, onBeforeUpdate } };

        // --- 1. State ---
        const state = window.MangaApp.createState(VueDeps);

        // --- 2. Helpers ---
        const helpers = window.MangaApp.createHelpers({ Vue: VueDeps.Vue, state, addScript: null });

        // --- 3. Computed ---
        const computedProps = window.MangaApp.createComputed({ Vue: VueDeps.Vue, state });

        // --- 4. History ---
        const history = window.MangaApp.createHistory({ Vue: VueDeps.Vue, state });

        // --- 5. Canvas ---
        const canvas = window.MangaApp.createCanvas({ Vue: VueDeps.Vue, state, history, helpers });

        // --- 6. Page Operations ---
        const pageOps = window.MangaApp.createPageOps({ Vue: VueDeps.Vue, state, helpers, history, canvas });

        // Wire up late dependency: helpers.focusNext needs addScript
        helpers.setAddScript(pageOps.addScript);

        // --- 7. Drag Plot ---
        const dragPlot = window.MangaApp.createDragPlot({ state });

        // --- 8. Drag Conte ---
        const dragConte = window.MangaApp.createDragConte({ state, canvas });

        // --- 9. Layout ---
        const layout = window.MangaApp.createLayout({
            state, helpers, history, canvas, computed: computedProps
        });

        // --- 10. Project I/O ---
        const projectIO = window.MangaApp.createProjectIO({ Vue: VueDeps.Vue, state, helpers, canvas });

        // --- 11. Export ---
        const exporter = window.MangaApp.createExport({ Vue: VueDeps.Vue, state, helpers, canvas });

        // --- 12. Keyboard ---
        const keyboard = window.MangaApp.createKeyboard({ Vue: VueDeps.Vue, state, helpers });

        // --- Watchers ---
        watch([state.currentMode, state.activePageIndex], async () => {
            if (state.currentMode.value === 'conte') {
                canvas.restoreAllCanvases();
            }
        });

        watch([state.pages, state.pageConfig], () => {
            if (state.isRestoring.value) return;
            clearTimeout(state.autoSaveTimer);
            state.autoSaveTimer = setTimeout(canvas.autoSaveToIDB, 2000);
        }, { deep: true });

        watch(computedProps.displayW, computedProps.checkScreenSize);

        // --- Lifecycle ---
        onMounted(async () => {
            try {
                const savedData = await get('manga_project_autosave');
                if (savedData && confirm('前回の作業データを復元しますか？')) {
                    state.isProcessing.value = true;
                    if (savedData.pages) {
                        for (const page of savedData.pages) {
                            for (const drawing of page.drawings) {
                                if (drawing.imgBlob) {
                                    drawing.imgSrc = URL.createObjectURL(drawing.imgBlob);
                                    drawing.cachedBlob = drawing.imgBlob;
                                    delete drawing.imgBlob;
                                }
                                drawing.history = [];
                                drawing.historyStep = -1;
                            }
                        }
                        state.pages.value = savedData.pages;
                    }
                    if (savedData.config) state.pageConfig.value = savedData.config;

                    await nextTick();

                    state.pages.value.forEach(p => p.drawings.forEach(d => {
                        if (d.imgSrc) { d.history = [d.imgSrc]; d.historyStep = 0; }
                    }));
                    helpers.resizeTextareas();

                } else {
                    if (state.pages.value[0].drawings[0]) history.saveHistory(state.pages.value[0].drawings[0]);
                    nextTick(() => helpers.resizeTextareas());
                }
            } catch (e) {
                console.error("Restore failed:", e);
                alert("データの復元に失敗しました。");
            } finally {
                state.isRestoring.value = false;
                state.isProcessing.value = false;
            }

            window.addEventListener('resize', () => {
                helpers.resizeTextareas();
                computedProps.checkScreenSize();
            });
            computedProps.checkScreenSize();
            window.addEventListener('keydown', canvas.handleGlobalKeydown);
        });

        onBeforeUpdate(() => {
            state.canvasRefs.value = {};
            state.scriptInputRefs.value = {};
        });

        // --- Return ---
        return {
            // State
            currentMode: state.currentMode,
            pages: state.pages,
            activePageIndex: state.activePageIndex,
            drawingTool: state.drawingTool,
            isExporting: state.isExporting,
            canvasRefs: state.canvasRefs,
            showSettings: state.showSettings,
            pageConfig: state.pageConfig,
            saveStatus: state.saveStatus,
            showTextModal: state.showTextModal,
            copiedPageId: state.copiedPageId,
            selectedItemId: state.selectedItemId,
            isImageEditMode: state.isImageEditMode,
            showDrawingModal: state.showDrawingModal,
            currentEditingDrawing: state.currentEditingDrawing,
            modalCanvasRef: state.modalCanvasRef,
            isConteDropTarget: state.isConteDropTarget,
            draggingDrawingIndex: state.draggingDrawingIndex,
            dropTargetDrawingIndex: state.dropTargetDrawingIndex,
            isDrawingDragReady: state.isDrawingDragReady,
            currentFileHandle: state.currentFileHandle,
            isProcessing: state.isProcessing,
            isTextLayerMode: state.isTextLayerMode,
            isHideGuideMode: state.isHideGuideMode,
            isHideDrawingMode: state.isHideDrawingMode,
            isTransparentMode: state.isTransparentMode,
            showExportModal: state.showExportModal,
            exportSettings: state.exportSettings,
            isMenuOpen: state.isMenuOpen,
            fileInput: state.fileInput,
            nameModeContainer: state.nameModeContainer,
            progress: state.progress,
            progressMessage: state.progressMessage,
            fontOptions: state.fontOptions,

            // Computed
            saveStatusText: computedProps.saveStatusText,
            spreads: computedProps.spreads,
            drawingCountWarning: computedProps.drawingCountWarning,
            pageStyle: computedProps.pageStyle,
            uniqueCharacters: computedProps.uniqueCharacters,

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
            undo: history.undo,
            redo: history.redo,
            canUndo: history.canUndo,
            canRedo: history.canRedo,
            undoName: history.undoName,
            redoName: history.redoName,

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
}).mount('#app');
