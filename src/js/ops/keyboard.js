// js/ops/keyboard.js - Keyboard handlers, text split/merge
window.MangaApp = window.MangaApp || {};

/** @param {KeyboardDeps} deps @returns {KeyboardInstance} */
window.MangaApp.createKeyboard = function (deps) {
    const { nextTick } = deps.Vue;
    /** @type {PageStoreInstance} */
    const pageStore = deps.pageStore;
    /** @type {UiStoreInstance} */
    const uiStore = deps.uiStore;
    /** @type {HelpersInstance} */
    const helpers = deps.helpers;

    /**
     * @param {KeyboardEvent} e
     * @param {number} pIndex
     * @param {number} sIndex
     */
    const handleScriptTextKeydown = (e, pIndex, sIndex) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            if (e.shiftKey) helpers.focusPrev(pIndex, sIndex, 'text');
            else helpers.focusNext(pIndex, sIndex);
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            performSplit(pIndex, sIndex, /** @type {HTMLTextAreaElement} */ (e.target));
            return;
        }

        if (e.key === 'Backspace') {
            const /** @type {HTMLTextAreaElement} */ target = /** @type {HTMLTextAreaElement} */ (e.target);
            const cursor = target.selectionStart;
            if (cursor === 0 && target.selectionEnd === 0 && sIndex > 0) {
                e.preventDefault();
                mergeScriptWithPrev(pIndex, sIndex);
            }
            return;
        }
    };

    /** @param {number} pIndex @param {number} sIndex */
    const splitScriptFromButton = (pIndex, sIndex) => {
        const el = /** @type {HTMLTextAreaElement} */ (uiStore.scriptInputRefs[`${pIndex}-${sIndex}-text`]);
        if (el) {
            performSplit(pIndex, sIndex, el);
        }
    };

    /**
     * @param {number} pIndex
     * @param {number} sIndex
     * @param {HTMLTextAreaElement} textareaElement
     */
    const performSplit = (pIndex, sIndex, textareaElement) => {
        const scripts = pageStore.pages[pIndex].scripts;
        const currentScript = scripts[sIndex];

        const cursor = textareaElement.selectionStart || 0;
        const fullText = currentScript.text || '';

        const firstPart = fullText.substring(0, cursor).replace(/\n+$/, '');
        const secondPart = fullText.substring(cursor).replace(/^\n+/, '');

        currentScript.text = firstPart;

        /** @type {Script} */
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
            const nextInput = /** @type {HTMLTextAreaElement} */ (uiStore.scriptInputRefs[`${pIndex}-${sIndex + 1}-text`]);
            if (nextInput) {
                nextInput.focus();
                nextInput.setSelectionRange(0, 0);
            }
        });
    };

    /** @param {number} pIndex @param {number} sIndex */
    const mergeScriptWithPrev = (pIndex, sIndex) => {
        const scripts = pageStore.pages[pIndex].scripts;
        const currentScript = scripts[sIndex];
        const prevScript = scripts[sIndex - 1];
        const originalPrevLength = prevScript.text.length;

        prevScript.text += currentScript.text;
        scripts.splice(sIndex, 1);

        nextTick(() => {
            helpers.resizeTextareas();
            const prevInput = /** @type {HTMLTextAreaElement} */ (uiStore.scriptInputRefs[`${pIndex}-${sIndex - 1}-text`]);
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
