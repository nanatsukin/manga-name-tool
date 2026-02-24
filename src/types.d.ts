// types.d.ts - Domain type definitions for MangaNameTool

// ============================================================
// Core Domain Models
// ============================================================

/** セリフの種別 */
type ScriptType = 'dialogue' | 'direction' | 'note';

/** セリフのレイアウト情報 */
interface ScriptLayout {
    x: number;
    y: number;
    fontSize?: number;
}

/** セリフ */
interface Script {
    id: number;
    type: ScriptType;
    char: string;
    text: string;
    drawingId: number | null;
    layout: ScriptLayout;
}

/** コマのレイアウト情報 */
interface DrawingLayout {
    x: number;
    y: number;
    w: number;
    h: number;
    z?: number;
}

/** コマ内の画像位置・スケール */
interface DrawingInner {
    scale: number;
    x: number;
    y: number;
}

/** コマ（描画枠） */
interface Drawing {
    id: number;
    imgSrc: string | null;
    layout: DrawingLayout;
    inner?: DrawingInner;
    cachedBlob?: Blob;
    history?: string[];
    historyStep?: number;
}

/** IDB 保存用コマ (imgBlob付き) */
interface DrawingSaved extends Omit<Drawing, 'imgSrc' | 'cachedBlob' | 'history' | 'historyStep'> {
    imgBlob?: Blob;
    imgSrc?: string;
}

/** ページ */
interface Page {
    id: number;
    scripts: Script[];
    drawings: Drawing[];
}

// ============================================================
// Config Types
// ============================================================

/** ページ設定 */
interface PageConfig {
    canvasW: number;
    canvasH: number;
    finishW: number;
    finishH: number;
    bleed: number;
    safeTop: number;
    safeBottom: number;
    safeInside: number;
    safeOutside: number;
    scale: number;
    fontFamily: string;
    defaultFontSize: number;
}

/** エクスポート設定 */
interface ExportSettings {
    format: string;
    rangeType: 'all' | 'current' | 'custom';
    rangeStart: number;
    rangeEnd: number;
}

/** フォント選択肢 */
interface FontOption {
    label: string;
    value: string;
}

// ============================================================
// Computed / Helper Return Types
// ============================================================

/** ガイド線座標 (helpers.guideProps 戻り値) */
interface GuideProps {
    safeX: number;
    safeY: number;
    safeW: number;
    safeH: number;
    finishX: number;
    finishY: number;
    finishW: number;
    finishH: number;
    bleedX: number;
    bleedY: number;
    bleedW: number;
    bleedH: number;
    centerPath: string;
    tonboPath: string;
}

/** 安全領域座標 (layoutUtils.getSafeArea 戻り値) */
interface SafeArea {
    safeX: number;
    safeY: number;
    safeW: number;
    safeH: number;
    fx: number;
    fy: number;
    si: number;
    so: number;
}

/** コマ数警告 (drawingCountWarning computed) */
interface DrawingCountWarning {
    text: string;
    class: string;
}

/** 見開きページ (spreads computed) */
interface SpreadPage extends Page {
    pageIndex: number;
}

/** ドラッグ中アイテム (plot mode) */
interface DraggingItem {
    pIndex: number;
    idx: number;
}

/** ドロップターゲット (plot mode) */
interface DropTarget {
    pIndex: number;
    idx: number | null;
}

/** htmlToImage オプション */
interface HtmlToImageOptions {
    width: number;
    height: number;
    style: Record<string, string | number>;
    filter: (node: HTMLElement) => boolean;
}

/** IDB 保存データ */
interface AutoSaveData {
    pages: Page[];
    config: PageConfig;
}

// ============================================================
// Composable Interfaces
// ============================================================

interface CanvasUtils {
    saveDrawingBlob(canvasEl: HTMLCanvasElement, drawing: Drawing): Promise<void>;
    pushDrawingHistory(drawing: Drawing, blob: Blob): string;
    initDrawingHistory(drawing: Drawing): void;
}

interface DndUtils {
    arrayMove(array: any[], fromIndex: number, toIndex: number): void;
    addPointerListeners(moveHandler: (e: Event) => void, endHandler: (e: Event) => void): void;
    removePointerListeners(moveHandlers: ((e: Event) => void) | ((e: Event) => void)[], endHandler: (e: Event) => void): void;
}

interface LayoutUtils {
    isRightPage(pageIndex: number): boolean;
    getSafeArea(config: PageConfig, pageIndex: number, scale?: number): SafeArea;
    clampRect(x: number, y: number, w: number, h: number, pageW: number, pageH: number): { x: number; y: number; w: number; h: number };
}

interface ExportUtils {
    getTargetPageIndices(settings: ExportSettings, totalPages: number, activeIndex: number): number[];
    createHtmlToImageOptions(el: HTMLElement, canvasW: number, canvasH: number, transparent?: boolean): HtmlToImageOptions;
}

interface AutoSaveUtils {
    blobToBase64(blob: Blob): Promise<string>;
    deepClone<T>(obj: T): T;
    autoSaveToIDB(pageStore: PageStoreInstance, configStore: ConfigStoreInstance, uiStore: UiStoreInstance): Promise<void>;
    restoreFromIDB(pageStore: PageStoreInstance, configStore: ConfigStoreInstance, uiStore: UiStoreInstance, canvasUtils: CanvasUtils, helpers: HelpersInstance, nextTick: (fn?: () => void) => Promise<void>): Promise<boolean>;
}

// ============================================================
// Store Instances
// ============================================================

interface PageStoreInstance {
    pages: Page[];
    activePageIndex: number;
    currentMode: string;
    readonly drawingCountWarning: DrawingCountWarning | null;
    readonly spreads: SpreadPage[][];
    readonly uniqueCharacters: string[];
    setUiStore(store: UiStoreInstance): void;
}

interface ConfigStoreInstance {
    pageConfig: PageConfig;
    readonly fontOptions: FontOption[];
    exportSettings: ExportSettings;
    currentFileHandle: FileSystemFileHandle | null;
    readonly displayW: number;
    readonly displayH: number;
    readonly pageStyle: { width: string; height: string };
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UiStoreInstance {
    // Modals
    showSettings: boolean;
    showTextModal: boolean;
    showExportModal: boolean;
    showDrawingModal: boolean;
    currentEditingDrawing: Drawing | null;
    modalCanvasRef: HTMLCanvasElement | null;
    // Selection
    selectedItemId: number | null;
    copiedPageId: number | null;
    // Menu / responsive
    isMenuOpen: boolean;
    isSmallScreen: boolean;
    // Save / processing
    saveStatus: SaveStatus;
    readonly saveStatusText: string;
    isRestoring: boolean;
    isProcessing: boolean;
    isExporting: boolean;
    progress: number;
    progressMessage: string;
    autoSaveTimer: ReturnType<typeof setTimeout> | null;
    // Drag (plot)
    draggingItem: DraggingItem | null;
    dropTarget: DropTarget | null;
    // Drag (conte)
    draggingConteScript: Script | null;
    isConteDropTarget: number | null;
    draggingDrawingIndex: number | null;
    dropTargetDrawingIndex: number | null;
    isDrawingDragReady: boolean;
    // Drawing mode
    isImageEditMode: boolean;
    drawingTool: string;
    isDrawing: boolean;
    lastActiveDrawingId: number | null;
    lastPos: { x: number; y: number };
    // View flags
    isTextLayerMode: boolean;
    isHideGuideMode: boolean;
    isHideDrawingMode: boolean;
    isTransparentMode: boolean;
    // DOM refs
    canvasRefs: Record<number, HTMLCanvasElement>;
    scriptInputRefs: Record<string, HTMLElement>;
    nameModeContainer: HTMLElement | null;
    fileInput: HTMLInputElement | null;
    nameModeScrollTop: number;
    // Methods
    checkScreenSize(): void;
    setConfigStore(store: ConfigStoreInstance): void;
}

interface HistoryStoreInstance {
    nameHistory: string[];
    nameHistoryIndex: number;
    setStores(pageStore: PageStoreInstance, uiStore: UiStoreInstance): void;
    setCanvasUtils(canvasUtils: CanvasUtils): void;
    recordNameHistory(): void;
    undoName(): void;
    redoName(): void;
    resetNameHistory(): void;
    saveHistory(drawing: Drawing): void;
    drawToCanvas(drawing: Drawing, url: string, targetCanvas?: HTMLCanvasElement | null): void;
    undo(drawing: Drawing): void;
    redo(drawing: Drawing): void;
    canUndo(drawing: Drawing): boolean;
    canRedo(drawing: Drawing): boolean;
}

// ============================================================
// Factory Deps Interfaces
// ============================================================

interface VueGlobal {
    ref<T>(value: T): { value: T };
    computed<T>(getter: () => T): { readonly value: T };
    watch: Function;
    nextTick(fn?: () => void): Promise<void>;
    onMounted(fn: () => void): void;
    onBeforeUpdate(fn: () => void): void;
}

interface HelpersDeps {
    Vue: VueGlobal;
    pageStore: PageStoreInstance;
    configStore: ConfigStoreInstance;
    uiStore: UiStoreInstance;
    layoutUtils: LayoutUtils;
    addScript: ((pIdx: number) => void) | null;
}

interface CanvasModuleDeps {
    Vue: VueGlobal;
    pageStore: PageStoreInstance;
    uiStore: UiStoreInstance;
    historyStore: HistoryStoreInstance;
    helpers: HelpersInstance;
    canvasUtils: CanvasUtils;
}

interface PageOpsDeps {
    Vue: VueGlobal;
    pageStore: PageStoreInstance;
    configStore: ConfigStoreInstance;
    uiStore: UiStoreInstance;
    historyStore: HistoryStoreInstance;
    helpers: HelpersInstance;
    canvas: CanvasModuleInstance;
    canvasUtils: CanvasUtils;
    dndUtils: DndUtils;
}

interface DragPlotDeps {
    pageStore: PageStoreInstance;
    uiStore: UiStoreInstance;
}

interface DragConteDeps {
    pageStore: PageStoreInstance;
    uiStore: UiStoreInstance;
    canvas: CanvasModuleInstance;
    canvasUtils: CanvasUtils;
    dndUtils: DndUtils;
}

interface LayoutModuleDeps {
    pageStore: PageStoreInstance;
    configStore: ConfigStoreInstance;
    uiStore: UiStoreInstance;
    historyStore: HistoryStoreInstance;
    helpers: HelpersInstance;
    canvas: CanvasModuleInstance;
    layoutUtils: LayoutUtils;
    dndUtils: DndUtils;
}

interface KeyboardDeps {
    Vue: VueGlobal;
    pageStore: PageStoreInstance;
    uiStore: UiStoreInstance;
    helpers: HelpersInstance;
}

interface ProjectIODeps {
    Vue: VueGlobal;
    pageStore: PageStoreInstance;
    configStore: ConfigStoreInstance;
    uiStore: UiStoreInstance;
    helpers: HelpersInstance;
    canvas: CanvasModuleInstance;
    canvasUtils: CanvasUtils;
    autoSaveUtils: AutoSaveUtils;
}

interface ExportModuleDeps {
    Vue: VueGlobal;
    pageStore: PageStoreInstance;
    configStore: ConfigStoreInstance;
    uiStore: UiStoreInstance;
    layoutUtils: LayoutUtils;
    exportUtils: ExportUtils;
}

// ============================================================
// Factory Return Interfaces
// ============================================================

interface HelpersInstance {
    getClientPos(e: MouseEvent | TouchEvent): { x: number; y: number };
    guideProps(pageIndex: number): GuideProps;
    resizeTextareas(): void;
    adjustHeight(e: Event): void;
    setInputRef(el: HTMLElement | null, p: number, s: number, type: 'char' | 'text'): void;
    focusText(p: number, s: number): void;
    focusPrev(pIndex: number, sIndex: number, currentType: 'text' | 'char'): void;
    focusNext(pIndex: number, sIndex: number): void;
    setAddScript(fn: (pIdx: number) => void): void;
    getPageTextPreview(page: Page): string;
    copyPageText(page: Page): Promise<void>;
    copyAllPlots(): Promise<void>;
    getUnassignedScripts(pIdx: number): Script[];
    getScriptsForDrawing(pIdx: number, drawingId: number): Script[];
}

interface CanvasModuleInstance {
    saveAllCanvases(): Promise<void>;
    restoreAllCanvases(): Promise<void>;
    openDrawingModal(drawing: Drawing): Promise<void>;
    closeDrawingModal(): void;
    startDraw(e: MouseEvent | TouchEvent, drawing: Drawing): void;
    draw(e: MouseEvent | TouchEvent, drawing: Drawing): void;
    stopDraw(drawing?: Drawing): void;
    clearCurrentPageCanvas(): void;
    handleGlobalKeydown(e: KeyboardEvent): void;
}

interface PageOpsInstance {
    changeMode(mode: string): Promise<void>;
    addPage(): Promise<void>;
    deletePage(idx: number): void;
    addScript(pIdx: number): void;
    removeScript(pIndex: number, idx: number): void;
    toggleScriptType(pIndex: number, idx: number): void;
    addNoteToCurrentPage(): void;
    moveScript(pIndex: number, sIndex: number, dir: number): void;
    insertScriptAfter(pIndex: number, sIndex: number): void;
    moveSubsequentScriptsToNewPage(pIndex: number, sIndex: number): Promise<void>;
    nextPage(): Promise<void>;
    prevPage(): Promise<void>;
    selectItem(id: number | null): void;
    toggleImageEditMode(): void;
    addDrawing(pIdx?: number): void;
    removeDrawing(pIdx: number, idx: number): void;
    jumpToPlot(pIndex: number, script: Script): Promise<void>;
    jumpToConte(pIndex: number, script: Script): Promise<void>;
    jumpToName(pIndex: number, script: Script): Promise<void>;
    sortAllScriptsByConteOrder(): void;
    applyFontSizeToAll(): void;
}

interface DragPlotInstance {
    dragStart(pIndex: number, idx: number): void;
    dragOverScript(pIndex: number, idx: number): void;
    dragOverPage(pIndex: number): void;
    dropOnScript(pIndex: number, idx: number): void;
    dropOnPage(pIndex: number): void;
    dragEnd(): void;
    isDropTarget(pIndex: number, idx: number): boolean;
    isDragging(pIndex: number, idx: number): boolean;
}

interface DragConteInstance {
    onHandleDown(): void;
    onHandleUp(): void;
    dragStartDrawing(e: DragEvent, idx: number): void;
    dragEndDrawing(): void;
    dragOverDrawing(idx: number): void;
    dropOnDrawing(targetIdx: number): Promise<void>;
    dragStartConteScript(e: DragEvent, script: Script): void;
    dragEndConteScript(): void;
    dragOverConteScript(targetId: number): void;
    dropOnConteScript(targetScript: Script): void;
    dropOnConteDrawing(drawingId: number): void;
    dropOnConteUnassigned(): void;
}

interface LayoutModuleInstance {
    startLayoutDrag(e: MouseEvent | TouchEvent, item: Drawing | Script): void;
    startLayoutResize(e: MouseEvent | TouchEvent, item: Drawing, handleType: 'tl' | 'tr' | 'bl' | 'br'): void;
    onImageWheel(e: WheelEvent, item: Drawing): void;
    zoomImage(item: Drawing, amount: number): void;
    moveItemPage(pageIdx: number, type: 'scripts' | 'drawings', itemIdx: number, dir: number): void;
    moveDrawingPage(pageIdx: number, drawingIdx: number, dir: number): Promise<void>;
    autoLayoutCurrentPage(): void;
}

interface KeyboardInstance {
    handleScriptTextKeydown(e: KeyboardEvent, pIndex: number, sIndex: number): void;
    splitScriptFromButton(pIndex: number, sIndex: number): void;
}

interface ProjectIOInstance {
    saveProject(): Promise<void>;
    saveProjectAs(): Promise<void>;
    loadProjectFromFile(): Promise<void>;
    handleFileChange(e: Event): Promise<void>;
}

interface ExportModuleInstance {
    openExportModal(): void;
    executeExport(): void;
    exportData(format?: string, optSettings?: ExportSettings | null): Promise<void>;
}
