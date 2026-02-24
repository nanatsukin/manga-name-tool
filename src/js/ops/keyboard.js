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
     * セリフテキスト Textarea のキーダウンイベントを処理する。
     * - Tab / Shift+Tab: 次/前の入力欄へフォーカスを移動する
     * - Ctrl+Enter: カーソル位置でセリフを2つに分割する
     * - Backspace（カーソルが行頭にある場合）: 前のセリフと結合する
     * @param {KeyboardEvent} e
     * @param {number} pIndex
     * @param {number} sIndex
     */
    const handleScriptTextKeydown = (e, pIndex, sIndex) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            // Shift+Tab は前の入力欄、Tab は次の入力欄へフォーカスを移動する
            if (e.shiftKey) helpers.focusPrev(pIndex, sIndex, 'text');
            else helpers.focusNext(pIndex, sIndex);
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            // Ctrl+Enter でカーソル位置のセリフを分割する
            performSplit(pIndex, sIndex, /** @type {HTMLTextAreaElement} */ (e.target));
            return;
        }

        if (e.key === 'Backspace') {
            const /** @type {HTMLTextAreaElement} */ target = /** @type {HTMLTextAreaElement} */ (e.target);
            const cursor = target.selectionStart;
            // カーソルが行頭（先頭）かつ選択なしのときに前のセリフと結合する
            if (cursor === 0 && target.selectionEnd === 0 && sIndex > 0) {
                e.preventDefault();
                mergeScriptWithPrev(pIndex, sIndex);
            }
            return;
        }
    };

    /**
     * ボタン操作からセリフを分割する。
     * Textarea の現在のカーソル位置を基準に performSplit を呼び出す。
     * @param {number} pIndex @param {number} sIndex
     */
    const splitScriptFromButton = (pIndex, sIndex) => {
        const el = /** @type {HTMLTextAreaElement} */ (uiStore.scriptInputRefs[`${pIndex}-${sIndex}-text`]);
        if (el) {
            performSplit(pIndex, sIndex, el);
        }
    };

    /**
     * Textarea のカーソル位置でセリフを2つに分割する。
     * - カーソル前のテキストを元のセリフに残す（末尾の改行は除去）
     * - カーソル後のテキストを新しいセリフに移す（先頭の改行は除去）
     * - 分割後は新しいセリフの Textarea にフォーカスし、カーソルを先頭に置く
     * @param {number} pIndex
     * @param {number} sIndex
     * @param {HTMLTextAreaElement} textareaElement
     */
    const performSplit = (pIndex, sIndex, textareaElement) => {
        const scripts = pageStore.pages[pIndex].scripts;
        const currentScript = scripts[sIndex];

        const cursor = textareaElement.selectionStart || 0;
        const fullText = currentScript.text || '';

        // カーソル前後でテキストを分割し、境界の余分な改行を除去する
        const firstPart = fullText.substring(0, cursor).replace(/\n+$/, '');
        const secondPart = fullText.substring(cursor).replace(/^\n+/, '');

        currentScript.text = firstPart;

        /** @type {Script} */
        const newScript = {
            id: Date.now() + Math.random(),
            // 元のセリフの type と char を引き継ぐ（type 未設定は char の有無で判定）
            type: currentScript.type || (currentScript.char ? 'dialogue' : 'direction'),
            char: currentScript.char,
            text: secondPart,
            drawingId: null,
            // y 座標を 20px 下にずらして視覚的にずれを作る
            layout: { ...currentScript.layout, y: currentScript.layout.y + 20 }
        };

        scripts.splice(sIndex + 1, 0, newScript);

        nextTick(() => {
            helpers.resizeTextareas();
            // 新しいセリフの Textarea にフォーカスし、カーソルを先頭に置く
            const nextInput = /** @type {HTMLTextAreaElement} */ (uiStore.scriptInputRefs[`${pIndex}-${sIndex + 1}-text`]);
            if (nextInput) {
                nextInput.focus();
                nextInput.setSelectionRange(0, 0);
            }
        });
    };

    /**
     * 指定セリフを前のセリフに結合する（Backspace でのページ結合に相当する操作）。
     * - 現在のセリフのテキストを前のセリフの末尾に追記する
     * - 現在のセリフを配列から削除する
     * - 前のセリフの Textarea にフォーカスし、カーソルを元の文末位置に置く
     * @param {number} pIndex @param {number} sIndex
     */
    const mergeScriptWithPrev = (pIndex, sIndex) => {
        const scripts = pageStore.pages[pIndex].scripts;
        const currentScript = scripts[sIndex];
        const prevScript = scripts[sIndex - 1];
        // 結合後のカーソル位置を決めるために、結合前の前セリフのテキスト長を記録する
        const originalPrevLength = prevScript.text.length;

        prevScript.text += currentScript.text;
        scripts.splice(sIndex, 1);

        nextTick(() => {
            helpers.resizeTextareas();
            // 前のセリフの Textarea にフォーカスし、カーソルを結合位置（元の文末）に置く
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
