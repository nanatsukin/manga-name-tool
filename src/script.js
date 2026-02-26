
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

        // --- Computed ---
        // コンテモード用: アクティブページのセリフを drawingId でグループ化した Map。
        // drag 状態が変化しても再計算されず、pages / activePageIndex の変化時のみ再計算される。
        const activePageScriptsByDrawingId = computed(() => {
            const page = pageStore.pages[pageStore.activePageIndex];
            if (!page) return {};
            const validIds = new Set(page.drawings.map(d => d.id));
            /** @type {Record<string, Script[]>} */
            const map = {};
            page.scripts.forEach(s => {
                const key = (s.drawingId && validIds.has(s.drawingId)) ? s.drawingId : '__unassigned__';
                if (!map[key]) map[key] = [];
                map[key].push(s);
            });
            return map;
        });

        // --- Virtual Scroll ---
        // ネームモード: ビューポート外の見開きコンテンツを非レンダリングにして DOM ノード数を削減する。
        const visibleSpreadIndices = ref(/** @type {Set<number>} */(new Set()));
        /** @type {IntersectionObserver | null} */
        let _spreadObserver = null;

        const _initSpreadObserver = () => {
            if (_spreadObserver) _spreadObserver.disconnect();
            // Set をリセットする（モード切替時に古い状態をクリア）
            visibleSpreadIndices.value = new Set();
            _spreadObserver = new IntersectionObserver((entries) => {
                const next = new Set(visibleSpreadIndices.value);
                entries.forEach(entry => {
                    const idx = Number(/** @type {HTMLElement} */(entry.target).dataset.spreadIdx);
                    if (entry.isIntersecting) next.add(idx); else next.delete(idx);
                });
                visibleSpreadIndices.value = next;
            }, { rootMargin: '200px', threshold: 0 });
        };

        // プロットモード: ビューポート外のページセクションを非レンダリングにしてドラッグ時の再レンダリングを削減する。
        const visiblePlotPageIndices = ref(/** @type {Set<number>} */(new Set()));
        /** @type {IntersectionObserver | null} */
        let _plotObserver = null;

        const _initPlotObserver = () => {
            if (_plotObserver) _plotObserver.disconnect();
            // Set をリセットする（モード切替時に古い状態をクリア）
            visiblePlotPageIndices.value = new Set();
            _plotObserver = new IntersectionObserver((entries) => {
                const next = new Set(visiblePlotPageIndices.value);
                entries.forEach(entry => {
                    const idx = Number(/** @type {HTMLElement} */(entry.target).dataset.plotPageIdx);
                    if (entry.isIntersecting) next.add(idx); else next.delete(idx);
                });
                visiblePlotPageIndices.value = next;
                // 新たに表示された要素内の Textarea だけ高さを再計算する
                nextTick(() => {
                    entries.forEach(entry => {
                        if (!entry.isIntersecting) return;
                        const textareas = /** @type {NodeListOf<HTMLTextAreaElement>} */ (entry.target.querySelectorAll('textarea.panel-input'));
                        textareas.forEach(ta => {
                            ta.style.height = 'auto';
                            ta.style.height = ta.scrollHeight + 'px';
                        });
                    });
                });
            }, { rootMargin: '300px', threshold: 0 });
        };

        // ページ追加・削除時: Observer を再生成せず新しい要素だけ observe する。
        // _initXxxObserver() を呼ぶと Set がリセットされてフラッシュが発生するため使わない。
        // DOM から削除された要素は IntersectionObserver が自動的に監視を解除する。
        watch(pages, () => {
            nextTick(() => {
                if (_spreadObserver) {
                    document.querySelectorAll('[data-spread-idx]').forEach(el => _spreadObserver.observe(el));
                }
                if (_plotObserver) {
                    document.querySelectorAll('[data-plot-page-idx]').forEach(el => _plotObserver.observe(el));
                }
            });
        }, { deep: false });

        // 表示倍率が変わったとき、全ページのレイアウト座標を比率で変換する
        watch(() => pageConfig.value.scale, (/** @type {number} */ newScale, /** @type {number} */ oldScale) => {
            if (uiStore.isRestoring) return;   // IDB 復元中は変換しない
            if (!oldScale || oldScale === newScale) return;
            const ratio = newScale / oldScale;
            pageStore.pages.forEach(page => {
                page.drawings.forEach(d => {
                    d.layout.x *= ratio;
                    d.layout.y *= ratio;
                    d.layout.w *= ratio;
                    d.layout.h *= ratio;
                    if (d.inner) {
                        d.inner.x = (d.inner.x || 0) * ratio;
                        d.inner.y = (d.inner.y || 0) * ratio;
                    }
                });
                page.scripts.forEach(s => {
                    s.layout.x *= ratio;
                    s.layout.y *= ratio;
                    s.layout.fontSize = (s.layout.fontSize || configStore.pageConfig.defaultFontSize) * ratio;
                });
            });
        });

        // テーマ変更時に html[data-theme] 属性を更新する（初回は即時適用）
        document.documentElement.setAttribute('data-theme', configStore.pageConfig.theme || 'dark');
        watch(() => configStore.pageConfig.theme, (/** @type {string|undefined} */ newTheme) => {
            document.documentElement.setAttribute('data-theme', newTheme || 'dark');
        });

        // モード切替時に Observer を再登録する。
        // 各モードパネルは v-if で制御されるため、モード変更で DOM が完全に再生成される。
        // 古い Observer は破棄された要素を監視しているため、新しい要素を observe し直す必要がある。
        // また、プロットモードに戻った際は Textarea の高さを再計算する（v-if で DOM が再生成されるため）。
        watch(currentMode, (/** @type {string} */ newMode) => {
            nextTick(() => {
                if (newMode === 'name') {
                    _initSpreadObserver();
                    document.querySelectorAll('[data-spread-idx]').forEach(el => _spreadObserver.observe(el));
                } else if (newMode === 'plot') {
                    _initPlotObserver();
                    document.querySelectorAll('[data-plot-page-idx]').forEach(el => _plotObserver.observe(el));
                }
            });
        });

        // --- Lifecycle ---
        onMounted(async () => {
            uiStore.isProcessing = true; // 起動直後のチカつき防止
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

            // 仮想スクロール用 IntersectionObserver を初期化する
            _initSpreadObserver();
            _initPlotObserver();
            nextTick(() => {
                document.querySelectorAll('[data-spread-idx]').forEach(el => _spreadObserver.observe(el));
                document.querySelectorAll('[data-plot-page-idx]').forEach(el => _plotObserver.observe(el));
            });
        });

        // 再レンダリング前に DOM ref の辞書をクリアする（古い ref が残らないようにする）
        onBeforeUpdate(() => {
            uiStore.canvasRefs = {};
            uiStore.scriptInputRefs = {};
        });

        // --- Snackbar (Undo) ---
        const actionSnackbar = ref({ visible: false, message: '', undoFn: null });
        /** @type {ReturnType<typeof setTimeout> | null} */
        let _snackbarTimer = null;
        /**
         * 操作後にUndoスナックバーを表示する
         * @param {string} message
         * @param {() => void} undoFn
         */
        const showActionSnackbar = (message, undoFn) => {
            if (_snackbarTimer) clearTimeout(_snackbarTimer);
            actionSnackbar.value = { visible: true, message, undoFn };
            _snackbarTimer = setTimeout(() => {
                actionSnackbar.value = { visible: false, message: '', undoFn: null };
                _snackbarTimer = null;
            }, 3500);
        };
        const dismissSnackbar = () => {
            if (_snackbarTimer) clearTimeout(_snackbarTimer);
            actionSnackbar.value = { visible: false, message: '', undoFn: null };
        };
        const executeActionUndo = async () => {
            if (actionSnackbar.value.undoFn) {
                await actionSnackbar.value.undoFn();
            }
            dismissSnackbar();
        };
        /**
         * 改ページ実行 + スナックバー表示のラッパー
         * @param {number} pIndex
         * @param {number} idx
         */
        const splitPageWithSnackbar = async (pIndex, idx) => {
            await pageOps.moveSubsequentScriptsToNewPageDirect(pIndex, idx);
            // 仮想スクロールのインデックスを手動更新する。
            // ページ挿入により pIndex+1 以降の全ページのインデックスが +1 ずれるため、
            // Set を再構築して新ページも即座に表示対象に加える。
            await nextTick();
            const nextSet = new Set();
            visiblePlotPageIndices.value.forEach(i => {
                nextSet.add(i > pIndex ? i + 1 : i);
            });
            nextSet.add(pIndex + 1); // 新しく挿入されたページを即表示
            visiblePlotPageIndices.value = nextSet;
            // DOM 確定後にテキストエリアの高さを再計算する
            await nextTick();
            helpers.resizeTextareas();

            showActionSnackbar('改ページしました', async () => {
                const newPageIndex = pIndex + 1;
                const scriptsToMove = pageStore.pages[newPageIndex].scripts;

                // ページ削除時の仮想スクロール更新を同期的に発行する
                const nextUndoSet = new Set();
                visiblePlotPageIndices.value.forEach(i => {
                    if (i < newPageIndex) nextUndoSet.add(i);
                    else if (i > newPageIndex) nextUndoSet.add(i - 1);
                });
                visiblePlotPageIndices.value = nextUndoSet;

                // 配列の変更
                pageStore.pages[pIndex].scripts.push(...scriptsToMove);
                pageStore.pages.splice(newPageIndex, 1);

                // Vue3 リアクティビティ強制トリガー
                pageStore.pages = [...pageStore.pages];

                // 結合後のテキストエリア高さを再計算
                await nextTick();
                helpers.resizeTextareas();

                dismissSnackbar();
            });
        };

        /**
         * ページ削除 + 仮想スクロールのインデックス手動更新のラッパー
         * @param {number} pIndex
         */
        const deletePage = async (pIndex) => {
            const oldLength = pageStore.pages.length;
            const result = pageOps.deletePage(pIndex);
            if (result) {
                const { type, removedPage, scriptsMovedCount } = result;

                if (pageStore.pages.length < oldLength) {
                    // ページが実際に削除された場合、同期的にSetを再構築
                    const nextSet = new Set();
                    visiblePlotPageIndices.value.forEach(i => {
                        if (i < pIndex) nextSet.add(i);
                        else if (i > pIndex) nextSet.add(i - 1);
                    });
                    visiblePlotPageIndices.value = nextSet;

                    // Vue3 リアクティビティ強制トリガー
                    pageStore.pages = [...pageStore.pages];

                    // 結合後のテキストエリア高さを再計算
                    await nextTick();
                    helpers.resizeTextareas();
                }

                const message = type === 'merge' ? 'ページを結合しました' : 'ページを削除しました';
                showActionSnackbar(message, async () => {
                    if (type === 'merge') {
                        const prevPage = pageStore.pages[pIndex - 1];
                        const movedScripts = prevPage.scripts.splice(-scriptsMovedCount);
                        removedPage.scripts = movedScripts;
                    }

                    // Restore page
                    pageStore.pages.splice(pIndex, 0, removedPage);

                    const nextUndoSet = new Set();
                    visiblePlotPageIndices.value.forEach(i => {
                        if (i < pIndex) nextUndoSet.add(i);
                        else if (i >= pIndex) nextUndoSet.add(i + 1);
                    });
                    nextUndoSet.add(pIndex);
                    visiblePlotPageIndices.value = nextUndoSet;

                    pageStore.pages = [...pageStore.pages];
                    await nextTick();
                    helpers.resizeTextareas();
                    dismissSnackbar();
                });
            }
        };

        /**
         * @param {number} pIndex
         * @param {number} sIndex
         */
        const wrappedRemoveScript = (pIndex, sIndex) => {
            const removedScript = pageOps.removeScript(pIndex, sIndex);
            if (removedScript) {
                showActionSnackbar('セリフを削除しました', async () => {
                    pageStore.pages[pIndex].scripts.splice(sIndex, 0, removedScript);
                    await nextTick();
                    helpers.resizeTextareas();
                    dismissSnackbar();
                });
            }
        };

        /**
         * @param {number} pIndex
         * @param {number} sIndex
         */
        const wrappedSplitScriptFromButton = (pIndex, sIndex) => {
            const result = keyboard.splitScriptFromButton(pIndex, sIndex);
            if (result) {
                showActionSnackbar('セリフを分割しました', async () => {
                    const scripts = pageStore.pages[pIndex].scripts;
                    scripts[sIndex].text = result.originalText;
                    scripts.splice(sIndex + 1, 1);
                    await nextTick();
                    helpers.resizeTextareas();
                    dismissSnackbar();
                });
            }
        };

        /**
         * @param {KeyboardEvent} e
         * @param {number} pIndex
         * @param {number} sIndex
         */
        const wrappedHandleScriptTextKeydown = (e, pIndex, sIndex) => {
            const result = keyboard.handleScriptTextKeydown(e, pIndex, sIndex);
            if (result && result.action === 'split') {
                showActionSnackbar('セリフを分割しました', async () => {
                    const scripts = pageStore.pages[pIndex].scripts;
                    scripts[sIndex].text = result.originalText;
                    scripts.splice(sIndex + 1, 1);
                    await nextTick();
                    helpers.resizeTextareas();
                    dismissSnackbar();
                });
            }
        };

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
            showOutputMenu: uiRefs.showOutputMenu,
            openScriptMenuId: uiRefs.openScriptMenuId,
            scriptMenuDirection: uiRefs.scriptMenuDirection,
            toggleScriptMenu: uiStore.toggleScriptMenu,
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
            activePageScriptsByDrawingId,
            visibleSpreadIndices,
            visiblePlotPageIndices,
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
            deletePage,
            addScript: pageOps.addScript,
            removeScript: wrappedRemoveScript,
            toggleScriptType: pageOps.toggleScriptType,
            addNoteToCurrentPage: pageOps.addNoteToCurrentPage,
            moveScript: pageOps.moveScript,
            insertScriptAfter: pageOps.insertScriptAfter,
            moveSubsequentScriptsToNewPage: pageOps.moveSubsequentScriptsToNewPage,
            splitPageWithSnackbar,
            actionSnackbar,
            dismissSnackbar,
            executeActionUndo,
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
            setActivePage: (/** @type {number} */ idx) => { pageStore.activePageIndex = idx; },

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
            handleScriptTextKeydown: wrappedHandleScriptTextKeydown,
            splitScriptFromButton: wrappedSplitScriptFromButton
        };
    }
});

app.use(pinia);
app.mount('#app');
