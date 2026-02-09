// js/core/helpers.js - Coordinate helpers, guide calculation, textarea resize, etc.
window.MangaApp = window.MangaApp || {};

window.MangaApp.createHelpers = function (deps) {
    const { nextTick } = deps.Vue;
    const pageStore = deps.pageStore;
    const configStore = deps.configStore;
    const uiStore = deps.uiStore;

    // Touch / mouse coordinate helper
    const getClientPos = (e) => {
        if (e.touches && e.touches.length > 0) {
            return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
        return { x: e.clientX, y: e.clientY };
    };

    // Guide drawing coordinate calculation
    const guideProps = (pageIndex) => {
        const { canvasW, canvasH, finishW, finishH, bleed, safeTop, safeBottom, safeInside, safeOutside, scale } = configStore.pageConfig;

        const fx = (canvasW - finishW) / 2;
        const fy = (canvasH - finishH) / 2;
        const isRight = (pageIndex === 0) || (pageIndex % 2 !== 0);
        const si = isRight ? safeInside : safeOutside;
        const so = isRight ? safeOutside : safeInside;

        const safeX = (fx + si) * scale;
        const safeY = (fy + safeTop) * scale;
        const safeW = (finishW - si - so) * scale;
        const safeH = (finishH - safeTop - safeBottom) * scale;

        const finishX = fx * scale;
        const finishY = fy * scale;
        const finishW_s = finishW * scale;
        const finishH_s = finishH * scale;

        const bleedX = (fx - bleed) * scale;
        const bleedY = (fy - bleed) * scale;
        const bleedW = (finishW + bleed * 2) * scale;
        const bleedH = (finishH + bleed * 2) * scale;

        const cx = (canvasW / 2) * scale;
        const cy = (canvasH / 2) * scale;

        const tExt = 200 * scale;
        const finishX_r = finishX + finishW_s;
        const finishY_b = finishY + finishH_s;
        const bleedX_r = bleedX + bleedW;
        const bleedY_b = bleedY + bleedH;

        const cLen = 200 * scale;
        let dCenter = `M${cx},${bleedY} V${bleedY - tExt} M${cx - cLen},${bleedY - tExt / 2} H${cx + cLen} `;
        dCenter += `M${cx},${bleedY_b} V${bleedY_b + tExt} M${cx - cLen},${bleedY_b + tExt / 2} H${cx + cLen} `;
        dCenter += `M${bleedX},${cy} H${bleedX - tExt} M${bleedX - tExt / 2},${cy - cLen} V${cy + cLen} `;
        dCenter += `M${bleedX_r},${cy} H${bleedX_r + tExt} M${bleedX_r + tExt / 2},${cy - cLen} V${cy + cLen} `;

        const cornerLen = tExt;
        let dTonbo = `M${finishX},${bleedY} V${bleedY - cornerLen} M${bleedX},${bleedY} V${bleedY - cornerLen} `;
        dTonbo += `M${bleedX},${finishY} H${bleedX - cornerLen} M${bleedX},${bleedY} H${bleedX - cornerLen} `;
        dTonbo += `M${finishX_r},${bleedY} V${bleedY - cornerLen} M${bleedX_r},${bleedY} V${bleedY - cornerLen} `;
        dTonbo += `M${bleedX_r},${finishY} H${bleedX_r + cornerLen} M${bleedX_r},${bleedY} H${bleedX_r + cornerLen} `;
        dTonbo += `M${finishX},${bleedY_b} V${bleedY_b + cornerLen} M${bleedX},${bleedY_b} V${bleedY_b + cornerLen} `;
        dTonbo += `M${bleedX},${finishY_b} H${bleedX - cornerLen} M${bleedX},${bleedY_b} H${bleedX - cornerLen} `;
        dTonbo += `M${finishX_r},${bleedY_b} V${bleedY_b + cornerLen} M${bleedX_r},${bleedY_b} V${bleedY_b + cornerLen} `;
        dTonbo += `M${bleedX_r},${finishY_b} H${bleedX_r + cornerLen} M${bleedX_r},${bleedY_b} H${bleedX_r + cornerLen} `;

        return {
            safeX, safeY, safeW, safeH,
            finishX, finishY, finishW: finishW_s, finishH: finishH_s,
            bleedX, bleedY, bleedW, bleedH,
            centerPath: dCenter, tonboPath: dTonbo
        };
    };

    // Textarea resize
    const resizeTextareas = () => {
        nextTick(() => {
            const textareas = document.querySelectorAll('textarea.panel-input');
            textareas.forEach(el => {
                el.style.height = 'auto';
                el.style.height = el.scrollHeight + 'px';
            });
        });
    };

    const adjustHeight = (e) => {
        const el = e.target;
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
    };

    // Input ref management
    const setInputRef = (el, p, s, type) => {
        if (el) uiStore.scriptInputRefs[`${p}-${s}-${type}`] = el;
    };

    const focusText = (p, s) => {
        nextTick(() => {
            const el = uiStore.scriptInputRefs[`${p}-${s}-text`];
            if (el) el.focus();
        });
    };

    const focusPrev = (pIndex, sIndex, currentType) => {
        if (currentType === 'text') {
            nextTick(() => {
                const el = uiStore.scriptInputRefs[`${pIndex}-${sIndex}-char`];
                if (el) el.focus();
            });
        } else if (currentType === 'char') {
            if (sIndex > 0) {
                nextTick(() => {
                    const el = uiStore.scriptInputRefs[`${pIndex}-${sIndex - 1}-text`];
                    if (el) el.focus();
                });
            } else if (pIndex > 0) {
                const prevPage = pageStore.pages[pIndex - 1];
                if (prevPage.scripts.length > 0) {
                    nextTick(() => {
                        const el = uiStore.scriptInputRefs[`${pIndex - 1}-${prevPage.scripts.length - 1}-text`];
                        if (el) el.focus();
                    });
                }
            }
        }
    };

    let _addScript = deps.addScript;
    const setAddScript = (fn) => { _addScript = fn; };

    const focusNext = (pIndex, sIndex) => {
        const addScript = _addScript;
        if (pageStore.pages[pIndex].scripts.length > sIndex + 1) {
            nextTick(() => {
                const el = uiStore.scriptInputRefs[`${pIndex}-${sIndex + 1}-char`];
                if (el) el.focus();
            });
        } else if (pageStore.pages.length > pIndex + 1) {
            if (pageStore.pages[pIndex + 1].scripts.length === 0 && addScript) addScript(pIndex + 1);
            nextTick(() => {
                const el = uiStore.scriptInputRefs[`${pIndex + 1}-0-char`];
                if (el) el.focus();
            });
        } else {
            if (addScript) addScript(pIndex);
            nextTick(() => {
                const el = uiStore.scriptInputRefs[`${pIndex}-${sIndex + 1}-char`];
                if (el) el.focus();
            });
        }
    };

    // Page text preview / copy
    const getPageTextPreview = (page) => {
        if (!page.scripts) return '';
        return page.scripts.filter(s => s.char).map(s => s.text).join(' / ');
    };

    const copyPageText = async (page) => {
        const text = page.scripts.filter(s => s.char).map(s => s.text).join('\n\n');
        try {
            await navigator.clipboard.writeText(text);
            uiStore.copiedPageId = page.id;
            setTimeout(() => uiStore.copiedPageId = null, 1000);
        } catch (e) {
            alert('コピー失敗: ' + e);
        }
    };

    const copyAllPlots = async () => {
        let output = "### マンガプロット構成案\n\n";
        pageStore.pages.forEach((page, index) => {
            output += `--- Page ${index + 1} ---\n`;
            if (page.scripts.length === 0) {
                output += "(セリフ・ト書きなし)\n";
            } else {
                page.scripts.forEach(script => {
                    const name = script.char ? script.char.trim() : "";
                    const text = script.text ? script.text.trim() : "";
                    if (name === "" || name === "-") {
                        output += `[ト書き] ${text}\n`;
                    } else {
                        output += `${name}：「${text}」\n`;
                    }
                });
            }
            output += "\n";
        });
        try {
            await navigator.clipboard.writeText(output);
            alert("全ページのプロットをクリップボードにコピーしました。\nGeminiなどのAIにそのまま貼り付けて相談できます。");
        } catch (e) {
            alert('コピー失敗: ' + e);
        }
    };

    // Script query helpers
    const getUnassignedScripts = (pIdx) => {
        const page = pageStore.pages[pIdx];
        const validDrawingIds = new Set(page.drawings.map(d => d.id));
        return page.scripts.filter(s => !s.drawingId || !validDrawingIds.has(s.drawingId));
    };

    const getScriptsForDrawing = (pIdx, drawingId) => {
        return pageStore.pages[pIdx].scripts.filter(s => s.drawingId === drawingId);
    };

    return {
        getClientPos, guideProps, resizeTextareas, adjustHeight,
        setInputRef, focusText, focusPrev, focusNext, setAddScript,
        getPageTextPreview, copyPageText, copyAllPlots,
        getUnassignedScripts, getScriptsForDrawing
    };
};
