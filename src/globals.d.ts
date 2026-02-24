// globals.d.ts - CDN global type declarations

// ============================================================
// Vue 3 CDN Globals
// ============================================================

interface VueRef<T> {
    value: T;
}

interface VueComputedRef<T> {
    readonly value: T;
}

declare const Vue: {
    ref<T>(value: T): VueRef<T>;
    computed<T>(getter: () => T): VueComputedRef<T>;
    watch(source: any, cb: Function, options?: { deep?: boolean }): Function;
    nextTick(fn?: () => void): Promise<void>;
    onMounted(fn: () => void): void;
    onUnmounted(fn: () => void): void;
    onBeforeUpdate(fn: () => void): void;
    createApp(options: any): any;
};

// ============================================================
// Pinia CDN Globals
// ============================================================

declare const Pinia: {
    defineStore(id: string, setup: () => any): () => any;
    createPinia(): any;
    storeToRefs(store: any): any;
};

// ============================================================
// idb-keyval CDN
// ============================================================

declare const idbKeyval: {
    get<T = any>(key: string): Promise<T | undefined>;
    set(key: string, value: any): Promise<void>;
    del(key: string): Promise<void>;
};

// ============================================================
// html-to-image CDN
// ============================================================

declare const htmlToImage: {
    toPng(node: HTMLElement, options?: any): Promise<string>;
    toJpeg(node: HTMLElement, options?: any): Promise<string>;
    toSvg(node: HTMLElement, options?: any): Promise<string>;
};

// ============================================================
// ag-psd CDN
// ============================================================

declare const agPsd: {
    writePsd(psd: any): ArrayBuffer;
    readPsd(buffer: ArrayBuffer): any;
};

// ============================================================
// JSZip CDN
// ============================================================

declare class JSZip {
    file(name: string, data: Blob | string | ArrayBuffer): this;
    generateAsync(options: { type: string }): Promise<Blob>;
}

// ============================================================
// FileSaver CDN
// ============================================================

declare function saveAs(data: Blob, filename: string): void;

// ============================================================
// File System Access API (partial)
// ============================================================

interface FileSystemFileHandle {
    getFile(): Promise<File>;
    createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemWritableFileStream extends WritableStream {
    write(data: Blob | string | ArrayBuffer): Promise<void>;
    close(): Promise<void>;
}

interface FileSystemDirectoryHandle {
    getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
}

interface Window {
    showSaveFilePicker?(options?: any): Promise<FileSystemFileHandle>;
    showOpenFilePicker?(options?: any): Promise<FileSystemFileHandle[]>;
    showDirectoryPicker?(options?: any): Promise<FileSystemDirectoryHandle>;
    MangaApp: MangaAppNamespace;
}

// ============================================================
// window.MangaApp Namespace
// ============================================================

interface MangaAppNamespace {
    stores: {
        usePageStore: () => PageStoreInstance;
        useConfigStore: () => ConfigStoreInstance;
        useUiStore: () => UiStoreInstance;
        useHistoryStore: () => HistoryStoreInstance;
    };
    canvasUtils: CanvasUtils;
    dndUtils: DndUtils;
    layoutUtils: LayoutUtils;
    exportUtils: ExportUtils;
    autoSaveUtils: AutoSaveUtils;
    createHelpers(deps: HelpersDeps): HelpersInstance;
    createCanvas(deps: CanvasModuleDeps): CanvasModuleInstance;
    createPageOps(deps: PageOpsDeps): PageOpsInstance;
    createDragPlot(deps: DragPlotDeps): DragPlotInstance;
    createDragConte(deps: DragConteDeps): DragConteInstance;
    createLayout(deps: LayoutModuleDeps): LayoutModuleInstance;
    createKeyboard(deps: KeyboardDeps): KeyboardInstance;
    createProjectIO(deps: ProjectIODeps): ProjectIOInstance;
    createExport(deps: ExportModuleDeps): ExportModuleInstance;
}
