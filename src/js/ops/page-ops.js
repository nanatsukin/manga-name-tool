// js/ops/page-ops.js - Page/script CRUD, mode switching, navigation
window.MangaApp = window.MangaApp || {};

window.MangaApp.createPageOps = function (deps) {
    const { nextTick } = deps.Vue;
    const pageStore = deps.pageStore;
    const configStore = deps.configStore;
    const uiStore = deps.uiStore;
    const historyStore = deps.historyStore;
    const helpers = deps.helpers;
    const canvas = deps.canvas;

    // Mode switching
    const changeMode = async (mode) => {
        if (pageStore.currentMode === 'name' && uiStore.nameModeContainer) {
            uiStore.nameModeScrollTop = uiStore.nameModeContainer.scrollTop;
        }
        if (pageStore.currentMode === 'conte') await canvas.saveAllCanvases();
        pageStore.currentMode = mode;
        uiStore.selectedItemId = null;
        uiStore.isImageEditMode = false;

        if (mode === 'plot') {
            nextTick(() => helpers.resizeTextareas());
        } else if (mode === 'name') {
            nextTick(() => {
                if (uiStore.nameModeContainer) {
                    uiStore.nameModeContainer.scrollTop = uiStore.nameModeScrollTop;
                }
                historyStore.resetNameHistory();
                historyStore.recordNameHistory();
            });
        }
    };

    // Page CRUD
    const addPage = async () => {
        if (pageStore.currentMode === 'conte') await canvas.saveAllCanvases();
        pageStore.pages.push({ id: Date.now(), scripts: [], drawings: [] });
    };

    const deletePage = (idx) => {
        if (idx === 0) {
            if (pageStore.pages.length > 1) {
                if (confirm("最初のページを削除しますか？（セリフはすべて消去されます）")) {
                    pageStore.pages.splice(idx, 1);
                }
            }
            return;
        }
        const scriptsToMove = pageStore.pages[idx].scripts;
        if (scriptsToMove.length > 0) {
            if (!confirm(`ページ ${idx + 1} を削除して、セリフを前のページに結合しますか？`)) return;
            pageStore.pages[idx - 1].scripts.push(...scriptsToMove);
        } else {
            pageStore.pages.splice(idx, 1);
            return;
        }
        pageStore.pages.splice(idx, 1);
        nextTick(() => helpers.resizeTextareas());
    };

    // Script CRUD
    const addScript = (pIdx) => {
        pageStore.pages[pIdx].scripts.push({
            id: Date.now() + Math.random(),
            type: 'dialogue',
            char: '', text: '',
            drawingId: null,
            layout: { x: 300, y: 200, fontSize: configStore.pageConfig.defaultFontSize }
        });
        nextTick(() => helpers.resizeTextareas());
    };

    const removeScript = (pIndex, idx) => {
        const script = pageStore.pages[pIndex].scripts[idx];
        if (script.text && script.text.trim() !== '') {
            if (!confirm('このセリフを削除しますか？\n\n' + (script.text.substring(0, 20) + '...'))) return;
        }
        pageStore.pages[pIndex].scripts.splice(idx, 1);
        nextTick(() => helpers.resizeTextareas());
    };

    const toggleScriptType = (pIndex, idx) => {
        const script = pageStore.pages[pIndex].scripts[idx];
        if (!script.type) {
            script.type = script.char ? 'dialogue' : 'direction';
        }
        if (script.type === 'dialogue') {
            script.type = 'direction';
            script.char = '';
        } else if (script.type === 'direction') {
            script.type = 'note';
            script.char = '';
        } else {
            script.type = 'dialogue';
        }
    };

    const addNoteToCurrentPage = () => {
        const pIdx = pageStore.activePageIndex;
        const page = pageStore.pages[pIdx];
        const viewportCenterY = (uiStore.nameModeContainer?.scrollTop || 0) + (window.innerHeight / 2) - 100;
        const y = Math.max(50, Math.min(configStore.pageConfig.canvasH * configStore.pageConfig.scale - 100, viewportCenterY));
        page.scripts.push({
            id: Date.now(), type: 'note', char: '', text: '注意書き',
            drawingId: null,
            layout: { x: 100, y: y, fontSize: configStore.pageConfig.defaultFontSize }
        });
        historyStore.recordNameHistory();
    };

    // Script operations
    const moveScript = (pIndex, sIndex, dir) => {
        const scripts = pageStore.pages[pIndex].scripts;
        const targetIndex = sIndex + dir;
        if (targetIndex >= 0 && targetIndex < scripts.length) {
            const item = scripts.splice(sIndex, 1)[0];
            scripts.splice(targetIndex, 0, item);
            nextTick(() => helpers.resizeTextareas());
        }
    };

    const insertScriptAfter = (pIndex, sIndex) => {
        const scripts = pageStore.pages[pIndex].scripts;
        const newScript = {
            id: Date.now() + Math.random(),
            type: 'dialogue', char: '', text: '',
            drawingId: null,
            layout: { x: 300, y: 200, fontSize: 14 }
        };
        scripts.splice(sIndex + 1, 0, newScript);
        nextTick(() => {
            helpers.resizeTextareas();
            const nextCharInput = uiStore.scriptInputRefs[`${pIndex}-${sIndex + 1}-char`];
            if (nextCharInput) nextCharInput.focus();
        });
    };

    const moveSubsequentScriptsToNewPage = async (pIndex, sIndex) => {
        if (!confirm("このセリフ以降を新しいページに移動しますか？")) return;
        const scriptsToMove = pageStore.pages[pIndex].scripts.splice(sIndex);
        const newPage = { id: Date.now(), scripts: scriptsToMove, drawings: [] };
        pageStore.pages.splice(pIndex + 1, 0, newPage);
        nextTick(() => helpers.resizeTextareas());
    };

    // Navigation
    const nextPage = async () => {
        if (pageStore.activePageIndex < pageStore.pages.length - 1) {
            if (pageStore.currentMode === 'conte') await canvas.saveAllCanvases();
            pageStore.activePageIndex++;
        }
    };

    const prevPage = async () => {
        if (pageStore.activePageIndex > 0) {
            if (pageStore.currentMode === 'conte') await canvas.saveAllCanvases();
            pageStore.activePageIndex--;
        }
    };

    // Selection
    const selectItem = (id) => {
        uiStore.selectedItemId = id;
        if (id === null) {
            uiStore.isImageEditMode = false;
            return;
        }
        pageStore.pages.forEach((page, pIdx) => {
            const hasDrawing = page.drawings.some(d => d.id === id);
            const hasScript = page.scripts.some(s => s.id === id);
            if (hasDrawing || hasScript) {
                pageStore.activePageIndex = pIdx;
            }
        });
    };

    const toggleImageEditMode = () => {
        uiStore.isImageEditMode = !uiStore.isImageEditMode;
    };

    // Drawing CRUD
    const addDrawing = (pIdx) => {
        const targetIdx = (typeof pIdx === 'number') ? pIdx : pageStore.activePageIndex;
        const newDrawing = {
            id: Date.now() + Math.random(),
            imgSrc: null,
            layout: { x: 50, y: 50, w: 300, h: 200, z: 1 },
            inner: { scale: 1, x: 0, y: 0 },
            history: [],
            historyStep: -1
        };
        pageStore.pages[targetIdx].drawings.push(newDrawing);
        nextTick(() => historyStore.saveHistory(newDrawing));
    };

    const removeDrawing = (pIdx, idx) => {
        if (confirm('削除しますか？')) {
            const removedId = pageStore.pages[pIdx].drawings[idx].id;
            if (pageStore.pages[pIdx].drawings[idx].imgSrc) {
                URL.revokeObjectURL(pageStore.pages[pIdx].drawings[idx].imgSrc);
            }
            pageStore.pages[pIdx].scripts.forEach(s => {
                if (s.drawingId === removedId) s.drawingId = null;
            });
            pageStore.pages[pIdx].drawings.splice(idx, 1);
        }
    };

    // Jump navigation
    const jumpToPlot = async (pIndex, script) => {
        const sIndex = pageStore.pages[pIndex].scripts.findIndex(s => s.id === script.id);
        if (sIndex === -1) return;
        await changeMode('plot');
        setTimeout(() => {
            const refKey = `${pIndex}-${sIndex}-text`;
            const el = uiStore.scriptInputRefs[refKey];
            if (el) {
                el.scrollIntoView({ behavior: 'auto', block: 'center' });
                el.focus();
            }
        }, 100);
    };

    const jumpToConte = async (pIndex, script) => {
        await changeMode('conte');
        pageStore.activePageIndex = pIndex;
        if (script.drawingId) {
            setTimeout(() => {
                const el = document.getElementById('conte-drawing-' + script.drawingId);
                if (el) el.scrollIntoView({ behavior: 'auto', block: 'center' });
            }, 100);
        }
    };

    const jumpToName = async (pIndex, script) => {
        await changeMode('name');
        setTimeout(() => {
            const el = document.getElementById('name-script-' + script.id);
            if (el) {
                el.scrollIntoView({ behavior: 'auto', block: 'center' });
                selectItem(script.id);
            }
        }, 100);
    };

    // Conte order sorting
    const sortScriptsByConteOrder = (pageIndex) => {
        const page = pageStore.pages[pageIndex];
        if (!page) return;
        let newScripts = [];
        for (const drawing of page.drawings) {
            const scripts = helpers.getScriptsForDrawing(pageIndex, drawing.id);
            newScripts.push(...scripts);
        }
        const unassigned = helpers.getUnassignedScripts(pageIndex);
        newScripts.push(...unassigned);
        page.scripts = newScripts;
    };

    const sortAllScriptsByConteOrder = () => {
        if (!confirm('全ページのプロットをコンテのコマ順に合わせて並び替えますか？')) return;
        pageStore.pages.forEach((_, index) => {
            sortScriptsByConteOrder(index);
        });
        nextTick(() => helpers.resizeTextareas());
    };

    // Font size
    const applyFontSizeToAll = () => {
        if (!confirm(`すべてのページのセリフのフォントサイズを、現在の設定値(${configStore.pageConfig.defaultFontSize}px)に統一しますか？`)) return;
        pageStore.pages.forEach(p => {
            p.scripts.forEach(s => {
                s.layout.fontSize = configStore.pageConfig.defaultFontSize;
            });
        });
        if (pageStore.currentMode === 'name') historyStore.recordNameHistory();
    };

    return {
        changeMode, addPage, deletePage,
        addScript, removeScript, toggleScriptType, addNoteToCurrentPage,
        moveScript, insertScriptAfter, moveSubsequentScriptsToNewPage,
        nextPage, prevPage, selectItem, toggleImageEditMode,
        addDrawing, removeDrawing,
        jumpToPlot, jumpToConte, jumpToName,
        sortAllScriptsByConteOrder, applyFontSizeToAll
    };
};
