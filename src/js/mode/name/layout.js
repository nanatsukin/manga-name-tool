// js/mode/name/layout.js - Layout operations + auto layout
window.MangaApp = window.MangaApp || {};

/** @param {LayoutModuleDeps} deps @returns {LayoutModuleInstance} */
window.MangaApp.createLayout = function (deps) {
    /** @type {PageStoreInstance} */
    const pageStore = deps.pageStore;
    /** @type {ConfigStoreInstance} */
    const configStore = deps.configStore;
    /** @type {UiStoreInstance} */
    const uiStore = deps.uiStore;
    /** @type {HistoryStoreInstance} */
    const historyStore = deps.historyStore;
    /** @type {HelpersInstance} */
    const helpers = deps.helpers;
    /** @type {CanvasModuleInstance} */
    const canvas = deps.canvas;
    /** @type {LayoutUtils} */
    const layoutUtils = deps.layoutUtils;
    /** @type {DndUtils} */
    const dndUtils = deps.dndUtils;

    // Layout interaction state
    /** @type {Drawing | Script | null} */
    let interactTarget = null;
    /** @type {number} */
    let startX = 0, startY = 0, startValX = 0, startValY = 0, startW = 0, startH = 0;
    /** @type {string} */
    let activeHandleType = '';
    /** @type {{ item: Script, startX: number, startY: number }[]} */
    let linkedItems = [];

    /**
     * @param {MouseEvent | TouchEvent} e
     * @param {Drawing | Script} item
     */
    const startLayoutDrag = (e, item) => {
        if (/** @type {HTMLElement} */ (e.target).classList.contains('resize-handle')) return;
        if (e.type === 'touchstart') e.preventDefault();
        e.stopPropagation();

        interactTarget = item;
        const pos = helpers.getClientPos(e);
        startX = pos.x;
        startY = pos.y;

        if (uiStore.isImageEditMode && /** @type {Drawing} */ (item).inner) {
            startValX = /** @type {Drawing} */ (item).inner.x || 0;
            startValY = /** @type {Drawing} */ (item).inner.y || 0;
            dndUtils.addPointerListeners(onImageDrag, stopInteract);
        } else {
            startValX = item.layout.x;
            startValY = item.layout.y;
            linkedItems = [];
            const page = pageStore.pages.find(p => p.drawings.some(d => d.id === item.id));
            if (page) {
                const scripts = page.scripts.filter(s => s.drawingId === item.id);
                linkedItems = scripts.map(s => ({ item: s, startX: s.layout.x, startY: s.layout.y }));
            }
            dndUtils.addPointerListeners(onLayoutDrag, stopInteract);
        }
    };

    /** @param {any} e */
    const onLayoutDrag = (e) => {
        if (!interactTarget) return;
        e.preventDefault();

        const pos = helpers.getClientPos(e);
        let newX = startValX + (pos.x - startX);
        let newY = startValY + (pos.y - startY);

        const w = /** @type {Drawing} */ (interactTarget).layout.w || 50;
        const h = /** @type {Drawing} */ (interactTarget).layout.h || 50;
        newX = Math.max(0, Math.min(configStore.displayW - w, newX));
        newY = Math.max(0, Math.min(configStore.displayH - h, newY));
        interactTarget.layout.x = newX;
        interactTarget.layout.y = newY;

        if (linkedItems.length > 0) {
            const dx = newX - startValX;
            const dy = newY - startValY;
            linkedItems.forEach(link => {
                let lx = link.startX + dx;
                let ly = link.startY + dy;
                lx = Math.max(-50, Math.min(configStore.displayW + 50, lx));
                ly = Math.max(-50, Math.min(configStore.displayH + 50, ly));
                link.item.layout.x = lx;
                link.item.layout.y = ly;
            });
        }
    };

    /** @param {any} e */
    const onImageDrag = (e) => {
        if (!interactTarget) return;
        if (e.type === 'touchmove') e.preventDefault();
        const pos = helpers.getClientPos(e);
        const imgTarget = /** @type {Drawing} */ (interactTarget);
        if (!imgTarget.inner) imgTarget.inner = { scale: 1, x: 0, y: 0 };
        imgTarget.inner.x = startValX + (pos.x - startX);
        imgTarget.inner.y = startValY + (pos.y - startY);
    };

    /** @param {WheelEvent} e @param {Drawing} item */
    const onImageWheel = (e, item) => {
        // @ts-ignore - intentional loose comparison
        if (!uiStore.isImageEditMode || !uiStore.selectedItemId === item.id) return;
        if (!item.inner) item.inner = { scale: 1, x: 0, y: 0 };
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        item.inner.scale = Math.max(0.1, (item.inner.scale || 1) + delta);
    };

    /** @param {Drawing} item @param {number} amount */
    const zoomImage = (item, amount) => {
        if (!item.inner) item.inner = { scale: 1, x: 0, y: 0 };
        item.inner.scale = Math.max(0.1, (item.inner.scale || 1) + amount);
    };

    /**
     * @param {MouseEvent | TouchEvent} e
     * @param {Drawing} item
     * @param {'tl' | 'tr' | 'bl' | 'br'} handleType
     */
    const startLayoutResize = (e, item, handleType) => {
        if (e.type === 'touchstart') e.preventDefault();
        interactTarget = item;
        activeHandleType = handleType;
        const pos = helpers.getClientPos(e);
        startX = pos.x;
        startY = pos.y;
        startValX = item.layout.x;
        startValY = item.layout.y;
        startW = item.layout.w;
        startH = item.layout.h;
        e.stopPropagation();

        dndUtils.addPointerListeners(onLayoutResize, stopInteract);
    };

    /** @param {any} e */
    const onLayoutResize = (e) => {
        if (!interactTarget) return;
        if (e.type === 'touchmove') e.preventDefault();

        const pos = helpers.getClientPos(e);
        const dx = pos.x - startX;
        const dy = pos.y - startY;
        let newX = startValX, newY = startValY, newW = startW, newH = startH;
        if (activeHandleType === 'br') { newW = Math.max(20, startW + dx); newH = Math.max(20, startH + dy); }
        else if (activeHandleType === 'bl') { newW = Math.max(20, startW - dx); newX = startValX + (startW - newW); newH = Math.max(20, startH + dy); }
        else if (activeHandleType === 'tr') { newH = Math.max(20, startH - dy); newY = startValY + (startH - newH); newW = Math.max(20, startW + dx); }
        else if (activeHandleType === 'tl') { newW = Math.max(20, startW - dx); newH = Math.max(20, startH - dy); newX = startValX + (startW - newW); newY = startValY + (startH - newH); }
        if (newX < 0) { newW += newX; newX = 0; }
        if (newY < 0) { newH += newY; newY = 0; }
        if (newX + newW > configStore.displayW) newW = configStore.displayW - newX;
        if (newY + newH > configStore.displayH) newH = configStore.displayH - newY;
        interactTarget.layout.x = newX;
        interactTarget.layout.y = newY;
        const resizeTarget = /** @type {Drawing} */ (interactTarget);
        resizeTarget.layout.w = newW;
        resizeTarget.layout.h = newH;
    };

    const stopInteract = () => {
        const wasInteracting = !!interactTarget;
        interactTarget = null;
        dndUtils.removePointerListeners([onLayoutDrag, onImageDrag, onLayoutResize], stopInteract);

        if (pageStore.currentMode === 'name' && wasInteracting) {
            historyStore.recordNameHistory();
        }
    };

    /**
     * @param {number} pageIdx
     * @param {'scripts' | 'drawings'} type
     * @param {number} itemIdx
     * @param {number} dir
     */
    const moveItemPage = (pageIdx, type, itemIdx, dir) => {
        const targetPageIdx = pageIdx + dir;
        if (targetPageIdx >= 0 && targetPageIdx < pageStore.pages.length) {
            const item = pageStore.pages[pageIdx][type].splice(itemIdx, 1)[0];
            pageStore.pages[targetPageIdx][type].push(/** @type {any} */ (item));
            historyStore.recordNameHistory();
        }
    };

    /** @param {number} pageIdx @param {number} drawingIdx @param {number} dir @returns {Promise<void>} */
    const moveDrawingPage = async (pageIdx, drawingIdx, dir) => {
        const targetPageIdx = pageIdx + dir;
        if (targetPageIdx >= 0 && targetPageIdx < pageStore.pages.length) {
            await canvas.saveAllCanvases();
            const drawing = pageStore.pages[pageIdx].drawings.splice(drawingIdx, 1)[0];
            if (dir === -1) pageStore.pages[targetPageIdx].drawings.push(drawing);
            else pageStore.pages[targetPageIdx].drawings.unshift(drawing);
            const relatedScripts = pageStore.pages[pageIdx].scripts.filter(s => s.drawingId === drawing.id);
            for (let i = pageStore.pages[pageIdx].scripts.length - 1; i >= 0; i--) {
                if (pageStore.pages[pageIdx].scripts[i].drawingId === drawing.id) {
                    pageStore.pages[pageIdx].scripts.splice(i, 1);
                }
            }
            pageStore.pages[targetPageIdx].scripts.push(...relatedScripts);
            if (pageStore.currentMode === 'name') historyStore.recordNameHistory();
        }
    };

    // Auto layout
    const autoLayoutCurrentPage = () => {
        const pIdx = pageStore.activePageIndex;
        const page = pageStore.pages[pIdx];
        const config = configStore.pageConfig;
        const scale = config.scale;

        if (!page) return;

        const { safeX, safeY, safeW, safeH } = layoutUtils.getSafeArea(config, pIdx, scale);

        const panelMargin = 20;
        let currentY = safeY;

        page.drawings.forEach((drawing, dIdx) => {
            const col = dIdx % 2;
            const colW = (safeW - panelMargin) / 2;
            const ratio = drawing.layout.h / drawing.layout.w;
            drawing.layout.w = colW;
            drawing.layout.h = colW * ratio;

            if (col === 0) {
                drawing.layout.x = safeX + safeW - drawing.layout.w;
            } else {
                drawing.layout.x = safeX;
                const prev = page.drawings[dIdx - 1];
                const rowH = Math.max(drawing.layout.h, prev ? prev.layout.h : 0);
                currentY += rowH + panelMargin;
            }

            drawing.layout.y = (col === 1 && page.drawings[dIdx - 1]) ? page.drawings[dIdx - 1].layout.y : currentY;

            if (drawing.layout.y + drawing.layout.h > safeY + safeH) {
                drawing.layout.y = safeY + safeH - drawing.layout.h;
            }
        });

        page.drawings.forEach((drawing) => {
            const scripts = helpers.getScriptsForDrawing(pIdx, drawing.id);
            if (scripts.length > 0) {
                const dX = drawing.layout.x;
                const dY = drawing.layout.y;
                const dW = drawing.layout.w;

                const innerMarginTop = 20;
                const innerMarginSide = 10;
                const usableW = dW - (innerMarginSide * 2);
                const stepX = scripts.length > 1 ? (usableW / scripts.length) : 0;

                scripts.forEach((script, sIdx) => {
                    const fontSize = script.layout.fontSize || config.defaultFontSize || 18;
                    const lineCount = script.text ? script.text.split('\n').length : 1;
                    const lineHeight = 1.5;
                    const scriptWidth = lineCount * fontSize * lineHeight;
                    const targetRightEdge = (dX + dW) - innerMarginSide - (stepX * sIdx);
                    script.layout.x = targetRightEdge - scriptWidth;
                    script.layout.y = dY + innerMarginTop;
                    if (script.layout.fontSize === undefined) {
                        script.layout.fontSize = config.defaultFontSize || 18;
                    }
                });
            }
        });

        const unassigned = helpers.getUnassignedScripts(pIdx);
        unassigned.forEach((script, uIdx) => {
            script.layout.x = safeX + safeW + 20;
            script.layout.y = safeY + (uIdx * 120);
            if (script.layout.fontSize === undefined) {
                script.layout.fontSize = config.defaultFontSize || 18;
            }
        });
        historyStore.recordNameHistory();
    };

    return {
        startLayoutDrag, startLayoutResize,
        onImageWheel, zoomImage,
        moveItemPage, moveDrawingPage,
        autoLayoutCurrentPage
    };
};
