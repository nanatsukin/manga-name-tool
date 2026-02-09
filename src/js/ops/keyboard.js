// js/ops/keyboard.js - Keyboard handlers, text split/merge
window.MangaApp = window.MangaApp || {};

window.MangaApp.createKeyboard = function (deps) {
    const { nextTick } = deps.Vue;
    const pageStore = deps.pageStore;
    const uiStore = deps.uiStore;
    const helpers = deps.helpers;

    const handleScriptTextKeydown = (e, pIndex, sIndex) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            if (e.shiftKey) helpers.focusPrev(pIndex, sIndex, 'text');
            else helpers.focusNext(pIndex, sIndex);
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            performSplit(pIndex, sIndex, e.target);
            return;
        }

        if (e.key === 'Backspace') {
            const cursor = e.target.selectionStart;
            if (cursor === 0 && e.target.selectionEnd === 0 && sIndex > 0) {
                e.preventDefault();
                mergeScriptWithPrev(pIndex, sIndex);
            }
            return;
        }
    };

    const splitScriptFromButton = (pIndex, sIndex) => {
        const el = uiStore.scriptInputRefs[`${pIndex}-${sIndex}-text`];
        if (el) {
            performSplit(pIndex, sIndex, el);
        }
    };

    const performSplit = (pIndex, sIndex, textareaElement) => {
        const scripts = pageStore.pages[pIndex].scripts;
        const currentScript = scripts[sIndex];

        const cursor = textareaElement.selectionStart || 0;
        const fullText = currentScript.text || '';

        const firstPart = fullText.substring(0, cursor).replace(/\n+$/, '');
        const secondPart = fullText.substring(cursor).replace(/^\n+/, '');

        currentScript.text = firstPart;

        const newScript = {
            id: Date.now() + Math.random(),
            type: currentScript.type || (currentScript.char ? 'dialogue' : 'direction'),
            char: currentScript.char,
            text: secondPart,
            drawingId: null,
            layout: { ...currentScript.layout, y: currentScript.layout.y + 20 }
        };

        scripts.splice(sIndex + 1, 0, newScript);

        nextTick(() => {
            helpers.resizeTextareas();
            const nextInput = uiStore.scriptInputRefs[`${pIndex}-${sIndex + 1}-text`];
            if (nextInput) {
                nextInput.focus();
                nextInput.setSelectionRange(0, 0);
            }
        });
    };

    const mergeScriptWithPrev = (pIndex, sIndex) => {
        const scripts = pageStore.pages[pIndex].scripts;
        const currentScript = scripts[sIndex];
        const prevScript = scripts[sIndex - 1];
        const originalPrevLength = prevScript.text.length;

        prevScript.text += currentScript.text;
        scripts.splice(sIndex, 1);

        nextTick(() => {
            helpers.resizeTextareas();
            const prevInput = uiStore.scriptInputRefs[`${pIndex}-${sIndex - 1}-text`];
            if (prevInput) {
                prevInput.focus();
                prevInput.setSelectionRange(originalPrevLength, originalPrevLength);
            }
        });
    };

    return {
        handleScriptTextKeydown, splitScriptFromButton
    };
};
