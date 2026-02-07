// js/page-ops.js - Page/script CRUD, mode switching, navigation
window.MangaApp = window.MangaApp || {};

window.MangaApp.createPageOps = function (deps) {
    const { nextTick } = deps.Vue;
    const state = deps.state;
    const helpers = deps.helpers;
    const history = deps.history;
    const canvas = deps.canvas;

    // Mode switching
    const changeMode = async (mode) => {
        if (state.currentMode.value === 'name' && state.nameModeContainer.value) {
            state.nameModeScrollTop = state.nameModeContainer.value.scrollTop;
        }
        if (state.currentMode.value === 'conte') await canvas.saveAllCanvases();
        state.currentMode.value = mode;
        state.selectedItemId.value = null;
        state.isImageEditMode.value = false;

        if (mode === 'plot') {
            nextTick(() => helpers.resizeTextareas());
        } else if (mode === 'name') {
            nextTick(() => {
                if (state.nameModeContainer.value) {
                    state.nameModeContainer.value.scrollTop = state.nameModeScrollTop;
                }
                history.resetNameHistory();
                history.recordNameHistory();
            });
        }
    };

    // Page CRUD
    const addPage = async () => {
        if (state.currentMode.value === 'conte') await canvas.saveAllCanvases();
        state.pages.value.push({ id: Date.now(), scripts: [], drawings: [] });
    };

    const deletePage = (idx) => {
        if (idx === 0) {
            if (state.pages.value.length > 1) {
                if (confirm("最初のページを削除しますか？（セリフはすべて消去されます）")) {
                    state.pages.value.splice(idx, 1);
                }
            }
            return;
        }
        const scriptsToMove = state.pages.value[idx].scripts;
        if (scriptsToMove.length > 0) {
            if (!confirm(`ページ ${idx + 1} を削除して、セリフを前のページに結合しますか？`)) return;
            state.pages.value[idx - 1].scripts.push(...scriptsToMove);
        } else {
            state.pages.value.splice(idx, 1);
            return;
        }
        state.pages.value.splice(idx, 1);
        nextTick(() => helpers.resizeTextareas());
    };

    // Script CRUD
    const addScript = (pIdx) => {
        state.pages.value[pIdx].scripts.push({
            id: Date.now() + Math.random(),
            type: 'dialogue',
            char: '', text: '',
            drawingId: null,
            layout: { x: 300, y: 200, fontSize: state.pageConfig.value.defaultFontSize }
        });
        nextTick(() => helpers.resizeTextareas());
    };

    const removeScript = (pIndex, idx) => {
        const script = state.pages.value[pIndex].scripts[idx];
        if (script.text && script.text.trim() !== '') {
            if (!confirm('このセリフを削除しますか？\n\n' + (script.text.substring(0, 20) + '...'))) return;
        }
        state.pages.value[pIndex].scripts.splice(idx, 1);
        nextTick(() => helpers.resizeTextareas());
    };

    const toggleScriptType = (pIndex, idx) => {
        const script = state.pages.value[pIndex].scripts[idx];
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
        const pIdx = state.activePageIndex.value;
        const page = state.pages.value[pIdx];
        const viewportCenterY = (state.nameModeContainer.value?.scrollTop || 0) + (window.innerHeight / 2) - 100;
        const y = Math.max(50, Math.min(state.pageConfig.value.canvasH * state.pageConfig.value.scale - 100, viewportCenterY));
        page.scripts.push({
            id: Date.now(), type: 'note', char: '', text: '注意書き',
            drawingId: null,
            layout: { x: 100, y: y, fontSize: state.pageConfig.value.defaultFontSize }
        });
        history.recordNameHistory();
    };

    // Script operations
    const moveScript = (pIndex, sIndex, dir) => {
        const scripts = state.pages.value[pIndex].scripts;
        const targetIndex = sIndex + dir;
        if (targetIndex >= 0 && targetIndex < scripts.length) {
            const item = scripts.splice(sIndex, 1)[0];
            scripts.splice(targetIndex, 0, item);
            nextTick(() => helpers.resizeTextareas());
        }
    };

    const insertScriptAfter = (pIndex, sIndex) => {
        const scripts = state.pages.value[pIndex].scripts;
        const newScript = {
            id: Date.now() + Math.random(),
            type: 'dialogue', char: '', text: '',
            drawingId: null,
            layout: { x: 300, y: 200, fontSize: 14 }
        };
        scripts.splice(sIndex + 1, 0, newScript);
        nextTick(() => {
            helpers.resizeTextareas();
            const nextCharInput = state.scriptInputRefs.value[`${pIndex}-${sIndex + 1}-char`];
            if (nextCharInput) nextCharInput.focus();
        });
    };

    const moveSubsequentScriptsToNewPage = async (pIndex, sIndex) => {
        if (!confirm("このセリフ以降を新しいページに移動しますか？")) return;
        const scriptsToMove = state.pages.value[pIndex].scripts.splice(sIndex);
        const newPage = { id: Date.now(), scripts: scriptsToMove, drawings: [] };
        state.pages.value.splice(pIndex + 1, 0, newPage);
        nextTick(() => helpers.resizeTextareas());
    };

    // Navigation
    const nextPage = async () => {
        if (state.activePageIndex.value < state.pages.value.length - 1) {
            if (state.currentMode.value === 'conte') await canvas.saveAllCanvases();
            state.activePageIndex.value++;
        }
    };

    const prevPage = async () => {
        if (state.activePageIndex.value > 0) {
            if (state.currentMode.value === 'conte') await canvas.saveAllCanvases();
            state.activePageIndex.value--;
        }
    };

    // Selection
    const selectItem = (id) => {
        state.selectedItemId.value = id;
        if (id === null) {
            state.isImageEditMode.value = false;
            return;
        }
        state.pages.value.forEach((page, pIdx) => {
            const hasDrawing = page.drawings.some(d => d.id === id);
            const hasScript = page.scripts.some(s => s.id === id);
            if (hasDrawing || hasScript) {
                state.activePageIndex.value = pIdx;
            }
        });
    };

    const toggleImageEditMode = () => {
        state.isImageEditMode.value = !state.isImageEditMode.value;
    };

    // Drawing CRUD
    const addDrawing = (pIdx) => {
        const targetIdx = (typeof pIdx === 'number') ? pIdx : state.activePageIndex.value;
        const newDrawing = {
            id: Date.now() + Math.random(),
            imgSrc: null,
            layout: { x: 50, y: 50, w: 300, h: 200, z: 1 },
            inner: { scale: 1, x: 0, y: 0 },
            history: [],
            historyStep: -1
        };
        state.pages.value[targetIdx].drawings.push(newDrawing);
        nextTick(() => history.saveHistory(newDrawing));
    };

    const removeDrawing = (pIdx, idx) => {
        if (confirm('削除しますか？')) {
            const removedId = state.pages.value[pIdx].drawings[idx].id;
            if (state.pages.value[pIdx].drawings[idx].imgSrc) {
                URL.revokeObjectURL(state.pages.value[pIdx].drawings[idx].imgSrc);
            }
            state.pages.value[pIdx].scripts.forEach(s => {
                if (s.drawingId === removedId) s.drawingId = null;
            });
            state.pages.value[pIdx].drawings.splice(idx, 1);
        }
    };

    // Jump navigation
    const jumpToPlot = async (pIndex, script) => {
        const sIndex = state.pages.value[pIndex].scripts.findIndex(s => s.id === script.id);
        if (sIndex === -1) return;
        await changeMode('plot');
        setTimeout(() => {
            const refKey = `${pIndex}-${sIndex}-text`;
            const el = state.scriptInputRefs.value[refKey];
            if (el) {
                el.scrollIntoView({ behavior: 'auto', block: 'center' });
                el.focus();
            }
        }, 100);
    };

    const jumpToConte = async (pIndex, script) => {
        await changeMode('conte');
        state.activePageIndex.value = pIndex;
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
        const page = state.pages.value[pageIndex];
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
        state.pages.value.forEach((_, index) => {
            sortScriptsByConteOrder(index);
        });
        nextTick(() => helpers.resizeTextareas());
    };

    // Font size
    const applyFontSizeToAll = () => {
        if (!confirm(`すべてのページのセリフのフォントサイズを、現在の設定値(${state.pageConfig.value.defaultFontSize}px)に統一しますか？`)) return;
        state.pages.value.forEach(p => {
            p.scripts.forEach(s => {
                s.layout.fontSize = state.pageConfig.value.defaultFontSize;
            });
        });
        if (state.currentMode.value === 'name') history.recordNameHistory();
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
