// js/core/helpers.js - 座標変換・ガイド計算・Textarea リサイズ等のヘルパー群
window.MangaApp = window.MangaApp || {};

/** @param {HelpersDeps} deps @returns {HelpersInstance} */
window.MangaApp.createHelpers = function (deps) {
    const { nextTick } = deps.Vue;
    /** @type {PageStoreInstance} */
    const pageStore = deps.pageStore;
    /** @type {ConfigStoreInstance} */
    const configStore = deps.configStore;
    /** @type {UiStoreInstance} */
    const uiStore = deps.uiStore;
    /** @type {LayoutUtils} */
    const layoutUtils = deps.layoutUtils;

    /**
     * マウスイベントまたはタッチイベントからクライアント座標を取得する。
     * タッチの場合は最初のタッチポイント（touches[0]）を使用する。
     * @param {any} e @returns {{ x: number, y: number }}
     */
    const getClientPos = (e) => {
        if (e.touches && e.touches.length > 0) {
            return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
        return { x: e.clientX, y: e.clientY };
    };

    /**
     * 指定ページのガイド線（安全マージン・仕上がり線・断ち落とし・トンボ・センターマーク）の
     * 座標と SVG パス文字列を計算して返す。
     * @param {number} pageIndex @returns {GuideProps}
     */
    const guideProps = (pageIndex) => {
        const { canvasW, canvasH, finishW, finishH, bleed, scale } = configStore.pageConfig;

        // 安全マージン領域を計算（ページの左右によってノド・小口が入れ替わる）
        const { safeX, safeY, safeW, safeH, fx, fy } = layoutUtils.getSafeArea(configStore.pageConfig, pageIndex, scale);

        // 仕上がり線の座標（scale 適用済み）
        const finishX = fx * scale;
        const finishY = fy * scale;
        const finishW_s = finishW * scale;
        const finishH_s = finishH * scale;

        // 断ち落とし線の座標（仕上がり線から bleed 分外側）
        const bleedX = (fx - bleed) * scale;
        const bleedY = (fy - bleed) * scale;
        const bleedW = (finishW + bleed * 2) * scale;
        const bleedH = (finishH + bleed * 2) * scale;

        // Canvas の中心座標（センターマーク描画用）
        const cx = (canvasW / 2) * scale;
        const cy = (canvasH / 2) * scale;

        // トンボ・センターマークの腕の長さ
        const tExt = 200 * scale;
        const finishX_r = finishX + finishW_s;
        const finishY_b = finishY + finishH_s;
        const bleedX_r = bleedX + bleedW;
        const bleedY_b = bleedY + bleedH;

        // センターマーク：断ち落とし線の上下左右の中央に十字を描く SVG パス
        const cLen = 200 * scale;
        let dCenter = `M${cx},${bleedY} V${bleedY - tExt} M${cx - cLen},${bleedY - tExt / 2} H${cx + cLen} `;
        dCenter += `M${cx},${bleedY_b} V${bleedY_b + tExt} M${cx - cLen},${bleedY_b + tExt / 2} H${cx + cLen} `;
        dCenter += `M${bleedX},${cy} H${bleedX - tExt} M${bleedX - tExt / 2},${cy - cLen} V${cy + cLen} `;
        dCenter += `M${bleedX_r},${cy} H${bleedX_r + tExt} M${bleedX_r + tExt / 2},${cy - cLen} V${cy + cLen} `;

        // トンボ：4隅それぞれに仕上がり線と断ち落とし線の位置を示す L 字マーク
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

    /**
     * ページ内の全 Textarea（クラス .panel-input）の高さをコンテンツに合わせてリサイズする。
     * nextTick 後に実行することで DOM 更新後のサイズを正確に計算できる。
     */
    const resizeTextareas = () => {
        nextTick(() => {
            const textareas = /** @type {NodeListOf<HTMLTextAreaElement>} */ (document.querySelectorAll('textarea.panel-input'));
            textareas.forEach(el => {
                el.style.height = 'auto';
                el.style.height = el.scrollHeight + 'px';
            });
        });
    };

    /**
     * Textarea の input イベントハンドラ。
     * イベントターゲットの高さをコンテンツに合わせてリサイズする。
     * @param {Event} e
     */
    const adjustHeight = (e) => {
        const el = /** @type {HTMLTextAreaElement} */ (e.target);
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
    };

    /**
     * セリフ入力欄（char または text）の DOM 要素を uiStore.scriptInputRefs に登録する。
     * Vue の v-bind:ref コールバックから呼ばれる。
     * @param {HTMLElement | null} el
     * @param {number} p ページインデックス
     * @param {number} s セリフインデックス
     * @param {'char' | 'text'} type 入力欄の種別
     */
    const setInputRef = (el, p, s, type) => {
        if (el) uiStore.scriptInputRefs[`${p}-${s}-${type}`] = el;
    };

    /**
     * 指定のセリフの text 入力欄にフォーカスを当てる（nextTick 後）。
     * @param {number} p ページインデックス
     * @param {number} s セリフインデックス
     */
    const focusText = (p, s) => {
        nextTick(() => {
            const el = uiStore.scriptInputRefs[`${p}-${s}-text`];
            if (el) el.focus();
        });
    };

    /**
     * 現在のフォーカスを前のセリフ入力欄に移動する（キーボード操作用）。
     * text → 同セリフの char → 前のセリフの text → 前ページの最後のセリフの text の順に遡る。
     * @param {number} pIndex
     * @param {number} sIndex
     * @param {'text' | 'char'} currentType 現在フォーカスしている入力欄の種別
     */
    const focusPrev = (pIndex, sIndex, currentType) => {
        if (currentType === 'text') {
            // text → 同セリフの char へ
            nextTick(() => {
                const el = uiStore.scriptInputRefs[`${pIndex}-${sIndex}-char`];
                if (el) el.focus();
            });
        } else if (currentType === 'char') {
            if (sIndex > 0) {
                // char → 前のセリフの text へ
                nextTick(() => {
                    const el = uiStore.scriptInputRefs[`${pIndex}-${sIndex - 1}-text`];
                    if (el) el.focus();
                });
            } else if (pIndex > 0) {
                // ページ先頭 → 前ページの最後のセリフの text へ
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

    /**
     * addScript 関数への参照。循環依存のため page-ops 初期化後に setAddScript で注入する。
     * @type {((pIdx: number) => void) | null}
     */
    let _addScript = deps.addScript;
    /**
     * addScript 関数を後から注入するための setter（循環依存解決用）。
     * @param {(pIdx: number) => void} fn
     */
    const setAddScript = (fn) => { _addScript = fn; };

    /**
     * 現在のフォーカスを次のセリフ入力欄に移動する（キーボード操作用）。
     * 次のセリフがなければ次ページへ移動し、必要に応じてセリフを自動追加する。
     * @param {number} pIndex
     * @param {number} sIndex
     */
    const focusNext = (pIndex, sIndex) => {
        const addScript = _addScript;
        if (pageStore.pages[pIndex].scripts.length > sIndex + 1) {
            // 同ページの次のセリフの char へ
            nextTick(() => {
                const el = uiStore.scriptInputRefs[`${pIndex}-${sIndex + 1}-char`];
                if (el) el.focus();
            });
        } else if (pageStore.pages.length > pIndex + 1) {
            // 次ページへ移動（セリフがなければ1件追加する）
            if (pageStore.pages[pIndex + 1].scripts.length === 0 && addScript) addScript(pIndex + 1);
            nextTick(() => {
                const el = uiStore.scriptInputRefs[`${pIndex + 1}-0-char`];
                if (el) el.focus();
            });
        } else {
            // 最終ページの最終セリフ → 同ページに新しいセリフを追加してフォーカス
            if (addScript) addScript(pIndex);
            nextTick(() => {
                const el = uiStore.scriptInputRefs[`${pIndex}-${sIndex + 1}-char`];
                if (el) el.focus();
            });
        }
    };

    /**
     * ページのセリフ内容を1行のプレビュー文字列で返す。
     * セリフ（キャラクターありのもの）のテキストを " / " で結合する。
     * @param {Page} page @returns {string}
     */
    const getPageTextPreview = (page) => {
        if (!page.scripts) return '';
        return page.scripts.filter(s => s.char).map(s => s.text).join(' / ');
    };

    /**
     * ページのセリフテキストをクリップボードにコピーする。
     * 成功したら copiedPageId を設定し、1秒後にリセットする（コピー完了フィードバック用）。
     * @param {Page} page @returns {Promise<void>}
     */
    const copyPageText = async (page) => {
        const text = page.scripts.filter(s => s.char).map(s => s.text).join('\n\n');
        try {
            await navigator.clipboard.writeText(text);
            uiStore.copiedPageId = page.id;
            setTimeout(() => { uiStore.copiedPageId = null; }, 1000);
        } catch (e) {
            alert('コピー失敗: ' + e);
        }
    };

    /**
     * 全ページのプロット内容をマークダウン形式でクリップボードにコピーする。
     * キャラクター名が空または "-" のセリフはト書きとして出力する。
     * @returns {Promise<void>}
     */
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
            alert("全ページのプロットをクリップボードにコピーしました。");
        } catch (e) {
            alert('コピー失敗: ' + e);
        }
    };

    /**
     * 指定ページのセリフのうち、どの Drawing にも紐付いていないセリフを返す。
     * 存在しない Drawing ID が設定されているセリフも未割り当て扱いにする。
     * @param {number} pIdx @returns {Script[]}
     */
    const getUnassignedScripts = (pIdx) => {
        const page = pageStore.pages[pIdx];
        const validDrawingIds = new Set(page.drawings.map(d => d.id));
        return page.scripts.filter(s => !s.drawingId || !validDrawingIds.has(s.drawingId));
    };

    /**
     * 指定ページの指定 Drawing に紐付いているセリフ一覧を返す。
     * @param {number} pIdx @param {number} drawingId @returns {Script[]}
     */
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
