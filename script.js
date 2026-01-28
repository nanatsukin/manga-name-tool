
const { createApp, ref, computed, nextTick, watch, onMounted, onBeforeUpdate } = Vue;
const { get, set } = idbKeyval;

createApp({
    setup() {
        // --- ステート定義 ---
        const currentMode = ref('plot'); // plot, conte, name
        const activePageIndex = ref(0);
        const isMenuOpen = ref(false);

        // UI状態
        const showSettings = ref(false);
        const showTextModal = ref(false);
        const copiedPageId = ref(null);
        const showDrawingModal = ref(false);
        const currentEditingDrawing = ref(null);
        const modalCanvasRef = ref(null);

        // 保存・処理状態
        const saveStatus = ref('idle');
        const isRestoring = ref(true);
        const isProcessing = ref(false);
        const isExporting = ref(false);
        let autoSaveTimer = null;

        // データ・設定
        const pageConfig = ref({
            canvasW: 6071, canvasH: 8598,
            finishW: 5197, finishH: 7323,
            bleed: 118, safeTop: 472, safeBottom: 472, safeInside: 472, safeOutside: 472,
            scale: 0.12,
            fontFamily: '"HiraMinProN-W3", "Yu Mincho", "MS PMincho", "Hiragino Mincho ProN", serif' // デフォルトは明朝
        });
        const pages = ref([{ id: Date.now(), scripts: [], drawings: [] }]);

        const fileInput = ref(null);

        // フォントの選択肢リストを定義
        const fontOptions = [
            { label: '明朝体 (標準)', value: '"HiraMinProN-W3", "Yu Mincho", "MS PMincho", "Hiragino Mincho ProN", serif' },
            { label: 'ゴシック体', value: '"HiraKakuProN-W3", "Yu Gothic", "MS PGothic", "Hiragino Sans", sans-serif' },
            { label: '丸ゴシック', value: '"Kosugi Maru", "Arial Rounded MT Bold", "Rounded Mplus 1c", sans-serif' },
            { label: 'アンチック体風 (Gothic+Mincho)', value: '"HiraMinProN-W3", "Yu Mincho", "MS PMincho", serif' } // 擬似的な設定（ブラウザ標準のみでは限界があるため明朝に倒しています）
        ];

        // ドラッグ＆ドロップ用変数
        const draggingItem = ref(null);
        const dropTarget = ref(null);
        const draggingConteScript = ref(null);
        const isConteDropTarget = ref(null);
        const draggingDrawingIndex = ref(null);
        const dropTargetDrawingIndex = ref(null);
        const isDrawingDragReady = ref(false);

        // 編集モード変数
        const selectedItemId = ref(null);
        const isImageEditMode = ref(false);
        const drawingTool = ref('pen');
        const isDrawing = ref(false);
        const lastActiveDrawingId = ref(null);
        const lastPos = { x: 0, y: 0 };

        // エクスポート用フラグ
        const isTextLayerMode = ref(false);
        const isHideGuideMode = ref(false);
        const isHideDrawingMode = ref(false);
        const isTransparentMode = ref(false);

        // 参照用
        const canvasRefs = ref({});
        const currentFileHandle = ref(null);
        const scriptInputRefs = ref({});

        // --- Computed Properties ---
        const saveStatusText = computed(() => {
            switch (saveStatus.value) {
                case 'saving': return '保存中...';
                case 'saved': return '保存完了';
                case 'error': return '保存失敗';
                case 'idle': return '未保存';
                default: return '';
            }
        });

        const displayW = computed(() => pageConfig.value.canvasW * pageConfig.value.scale);
        const displayH = computed(() => pageConfig.value.canvasH * pageConfig.value.scale);
        const pageStyle = computed(() => ({ width: displayW.value + 'px', height: displayH.value + 'px' }));

        // 見開き表示用の配列生成
        const spreads = computed(() => {
            const result = [];
            if (pages.value.length > 0) result.push([{ ...pages.value[0], pageIndex: 0 }]);
            for (let i = 1; i < pages.value.length; i += 2) {
                const pair = [];
                pair.push({ ...pages.value[i], pageIndex: i });
                if (i + 1 < pages.value.length) pair.push({ ...pages.value[i + 1], pageIndex: i + 1 });
                result.push(pair);
            }
            return result;
        });
        // 編集モーダルを開く
        const openDrawingModal = async (drawing) => {
            // コンテモードで保存を実行してから開く（念のため）
            await saveAllCanvases();

            currentEditingDrawing.value = drawing;
            showDrawingModal.value = true;

            await nextTick();

            // モーダルのキャンバスに現在の画像を読み込む
            const canvas = modalCanvasRef.value;
            if (canvas && drawing.imgSrc) {
                const ctx = canvas.getContext('2d');
                const img = new Image();
                img.onload = () => {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);
                };
                img.src = drawing.imgSrc;
            } else if (canvas) {
                // 画像がない場合は白紙
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
        };

        // モーダルを閉じて保存
        const closeDrawingModal = () => {
            const drawing = currentEditingDrawing.value;
            const canvas = modalCanvasRef.value;

            if (drawing && canvas) {
                canvas.toBlob(blob => {
                    const url = URL.createObjectURL(blob);

                    // 履歴に追加
                    if (!drawing.history) drawing.history = [];
                    if (drawing.historyStep === undefined) drawing.historyStep = -1;

                    // 履歴分岐の処理
                    if (drawing.historyStep < drawing.history.length - 1) {
                        drawing.history = drawing.history.slice(0, drawing.historyStep + 1);
                    }

                    drawing.history.push(url);
                    drawing.historyStep++;
                    drawing.imgSrc = url;

                    // ステートクリア
                    showDrawingModal.value = false;
                    currentEditingDrawing.value = null;
                });
            } else {
                showDrawingModal.value = false;
            }
        };

        // --- ヘルパー関数 ---
        const getPageTextPreview = (page) => {
            if (!page.scripts) return '';
            return page.scripts.filter(s => s.char).map(s => s.text).join(' / ');
        };

        const copyPageText = async (page) => {
            const text = page.scripts.filter(s => s.char).map(s => s.text).join('\n\n');
            try {
                await navigator.clipboard.writeText(text);
                copiedPageId.value = page.id;
                setTimeout(() => copiedPageId.value = null, 1000);
            } catch (e) {
                alert('コピー失敗: ' + e);
            }
        };
        const copyAllPlots = async () => {
            let output = "### マンガプロット構成案\n\n";

            pages.value.forEach((page, index) => {
                output += `--- Page ${index + 1} ---\n`;

                if (page.scripts.length === 0) {
                    output += "(セリフ・ト書きなし)\n";
                } else {
                    page.scripts.forEach(script => {
                        const name = script.char ? script.char.trim() : "";
                        const text = script.text ? script.text.trim() : "";

                        if (name === "" || name === "-") {
                            // ト書き
                            output += `[ト書き] ${text}\n`;
                        } else {
                            // セリフ
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
        // タッチ・マウス両対応の座標取得関数
        const getClientPos = (e) => {
            if (e.touches && e.touches.length > 0) {
                return { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
            return { x: e.clientX, y: e.clientY };
        };

        // ガイド描画用の座標計算
        const guideProps = (pageIndex) => {
            const { canvasW, canvasH, finishW, finishH, bleed, safeTop, safeBottom, safeInside, safeOutside, scale } = pageConfig.value;
            const fx = (canvasW - finishW) / 2; const fy = (canvasH - finishH) / 2;
            const isRight = (pageIndex === 0) || (pageIndex % 2 !== 0);
            const si = isRight ? safeInside : safeOutside; const so = isRight ? safeOutside : safeInside;

            const safeX = (fx + si) * scale; const safeY = (fy + safeTop) * scale;
            const safeW = (finishW - si - so) * scale; const safeH = (finishH - safeTop - safeBottom) * scale;
            const finishX = fx * scale; const finishY = fy * scale;
            const finishW_s = finishW * scale; const finishH_s = finishH * scale;
            const bleedX = (fx - bleed) * scale; const bleedY = (fy - bleed) * scale;
            const bleedW = (finishW + bleed * 2) * scale; const bleedH = (finishH + bleed * 2) * scale;
            const cx = (canvasW / 2) * scale; const cy = (canvasH / 2) * scale;

            const tExt = 200 * scale;
            const finishX_r = finishX + finishW_s; const finishY_b = finishY + finishH_s;
            const bleedX_r = bleedX + bleedW; const bleedY_b = bleedY + bleedH;

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

            return { safeX, safeY, safeW, safeH, finishX, finishY, finishW: finishW_s, finishH: finishH_s, bleedX, bleedY, bleedW, bleedH, centerPath: dCenter, tonboPath: dTonbo };
        };

        // --- 入力フォーム制御 ---
        const resizeTextareas = () => {
            nextTick(() => {
                const textareas = document.querySelectorAll('textarea.panel-input');
                textareas.forEach(el => {
                    el.style.height = 'auto';
                    // scrollHeightを使用して内容に合わせる
                    el.style.height = el.scrollHeight + 'px';
                });
            });
        };

        const adjustHeight = (e) => {
            const el = e.target;
            el.style.height = 'auto';
            el.style.height = el.scrollHeight + 'px';
        };
        const setInputRef = (el, p, s, type) => { if (el) scriptInputRefs.value[`${p}-${s}-${type}`] = el; };
        const focusText = (p, s) => { nextTick(() => { const el = scriptInputRefs.value[`${p}-${s}-text`]; if (el) el.focus(); }); };

        const focusPrev = (pIndex, sIndex, currentType) => {
            if (currentType === 'text') { nextTick(() => { const el = scriptInputRefs.value[`${pIndex}-${sIndex}-char`]; if (el) el.focus(); }); }
            else if (currentType === 'char') {
                if (sIndex > 0) { nextTick(() => { const el = scriptInputRefs.value[`${pIndex}-${sIndex - 1}-text`]; if (el) el.focus(); }); }
                else if (pIndex > 0) { const prevPage = pages.value[pIndex - 1]; if (prevPage.scripts.length > 0) { nextTick(() => { const el = scriptInputRefs.value[`${pIndex - 1}-${prevPage.scripts.length - 1}-text`]; if (el) el.focus(); }); } }
            }
        };
        const focusNext = (pIndex, sIndex) => {
            if (pages.value[pIndex].scripts.length > sIndex + 1) { nextTick(() => { const el = scriptInputRefs.value[`${pIndex}-${sIndex + 1}-char`]; if (el) el.focus(); }); }
            else if (pages.value.length > pIndex + 1) { if (pages.value[pIndex + 1].scripts.length === 0) addScript(pIndex + 1); nextTick(() => { const el = scriptInputRefs.value[`${pIndex + 1}-0-char`]; if (el) el.focus(); }); }
            else { addScript(pIndex); nextTick(() => { const el = scriptInputRefs.value[`${pIndex}-${sIndex + 1}-char`]; if (el) el.focus(); }); }
        };

        // --- キャンバス保存・履歴管理 ---
        const saveHistory = (drawing) => {
            const canvas = showDrawingModal.value ? modalCanvasRef.value : canvasRefs.value[drawing.id];
            if (!canvas) return;

            canvas.toBlob(blob => {
                const url = URL.createObjectURL(blob);
                if (!drawing.history) drawing.history = [];
                if (drawing.historyStep === undefined) drawing.historyStep = -1;

                // 履歴の分岐処理
                if (drawing.historyStep < drawing.history.length - 1) {
                    drawing.history = drawing.history.slice(0, drawing.historyStep + 1);
                }

                drawing.history.push(url);
                drawing.historyStep++;
                drawing.imgSrc = url;

                // 【重要】Vueに配列の更新を検知させるための処理
                // 配列の中身を更新しただけではボタンの disabled が変わらない場合があるため
                // currentEditingDrawing を再セットするか、pages 全体を少し刺激します
                if (showDrawingModal.value && currentEditingDrawing.value?.id === drawing.id) {
                    currentEditingDrawing.value = { ...drawing };
                }
            });
        };

        const saveAllCanvases = async () => {
            const promises = [];
            pages.value.forEach(page => {
                page.drawings.forEach(d => {
                    const cvs = canvasRefs.value[d.id];
                    if (cvs) {
                        const p = new Promise(resolve => {
                            cvs.toBlob(blob => {
                                // 【修正箇所】
                                // d.imgSrc が履歴(history)の中に存在するか確認する
                                const isUsedInHistory = d.history && d.history.includes(d.imgSrc);

                                // 履歴に使われていない場合のみ、古いURLをメモリから開放(revoke)する
                                if (d.imgSrc && d.imgSrc.startsWith('blob:') && !isUsedInHistory) {
                                    URL.revokeObjectURL(d.imgSrc);
                                }

                                d.imgSrc = URL.createObjectURL(blob);
                                resolve();
                            });
                        });
                        promises.push(p);
                    }
                });
            });
            await Promise.all(promises);
        };

        // --- IDBへの自動保存 ---
        const autoSaveToIDB = async () => {
            if (isRestoring.value) return;
            saveStatus.value = 'saving';
            try {
                if (currentMode.value === 'conte') await saveAllCanvases();
                const dataToSave = { pages: JSON.parse(JSON.stringify(pages.value)), config: JSON.parse(JSON.stringify(pageConfig.value)) };
                await Promise.all(dataToSave.pages.map(async (page, pIdx) => {
                    await Promise.all(page.drawings.map(async (d, dIdx) => {
                        delete d.history; delete d.historyStep;
                        const originalImgSrc = pages.value[pIdx].drawings[dIdx].imgSrc;
                        if (originalImgSrc) { try { const res = await fetch(originalImgSrc); d.imgBlob = await res.blob(); delete d.imgSrc; } catch (e) { } }
                    }));
                }));
                await set('manga_project_autosave', dataToSave);
                saveStatus.value = 'saved';
            } catch (e) { console.error(e); saveStatus.value = 'error'; }
        };

        // --- ページ操作系メソッド ---
        const changeMode = async (mode) => { if (currentMode.value === 'conte') await saveAllCanvases(); currentMode.value = mode; selectedItemId.value = null; isImageEditMode.value = false; if (mode === 'plot') nextTick(() => resizeTextareas()); };
        const addPage = async () => { if (currentMode.value === 'conte') await saveAllCanvases(); pages.value.push({ id: Date.now(), scripts: [], drawings: [] }); };
        const deletePage = (idx) => {
            // 最初のページの場合は前のページがないため、単なる削除確認にするか、何もしない
            if (idx === 0) {
                if (pages.value.length > 1) {
                    if (confirm("最初のページを削除しますか？（セリフはすべて消去されます）")) {
                        pages.value.splice(idx, 1);
                    }
                }
                return;
            }

            // 削除するページにある全セリフを取得
            const scriptsToMove = pages.value[idx].scripts;

            // セリフがある場合は確認メッセージを出す（任意）
            if (scriptsToMove.length > 0) {
                if (!confirm(`ページ ${idx + 1} を削除して、セリフを前のページに結合しますか？`)) {
                    return;
                }
                // 前のページの末尾にセリフを結合
                pages.value[idx - 1].scripts.push(...scriptsToMove);
            } else {
                // セリフが空なら確認なしで削除
                pages.value.splice(idx, 1);
                return;
            }

            // ページを削除
            pages.value.splice(idx, 1);

            // テキストエリアの高さを再計算
            nextTick(() => resizeTextareas());
        };

        const addScript = (pIdx) => { pages.value[pIdx].scripts.push({ id: Date.now() + Math.random(), char: '', text: '', drawingId: null, layout: { x: 300, y: 200, fontSize: 14 } }); nextTick(() => resizeTextareas()); };

        // 削除処理
        const removeScript = (pIndex, idx) => {
            const script = pages.value[pIndex].scripts[idx];

            // テキストが入っている場合は確認を出す
            if (script.text && script.text.trim() !== '') {
                if (!confirm('このセリフを削除しますか？\n\n' + (script.text.substring(0, 20) + '...'))) {
                    return;
                }
            }

            // 配列から削除
            pages.value[pIndex].scripts.splice(idx, 1);

            // 削除後、テキストエリアの高さを再計算
            nextTick(() => resizeTextareas());
        };
        const nextPage = async () => { if (activePageIndex.value < pages.value.length - 1) { if (currentMode.value === 'conte') await saveAllCanvases(); activePageIndex.value++; } };
        const prevPage = async () => { if (activePageIndex.value > 0) { if (currentMode.value === 'conte') await saveAllCanvases(); activePageIndex.value--; } };
        const selectItem = (id) => { selectedItemId.value = id; if (id === null) isImageEditMode.value = false; };
        const toggleImageEditMode = () => { isImageEditMode.value = !isImageEditMode.value; };
        const getUnassignedScripts = (pIdx) => pages.value[pIdx].scripts.filter(s => !s.drawingId);
        const getScriptsForDrawing = (pIdx, drawingId) => pages.value[pIdx].scripts.filter(s => s.drawingId === drawingId);
        const addDrawing = (pIdx) => { const newDrawing = { id: Date.now() + Math.random(), imgSrc: null, layout: { x: 50, y: 50, w: 300, h: 200, z: 1 }, inner: { scale: 1, x: 0, y: 0 }, history: [], historyStep: -1 }; pages.value[pIdx].drawings.push(newDrawing); nextTick(() => saveHistory(newDrawing)); };
        const removeDrawing = (pIdx, idx) => { if (confirm('削除しますか？')) { const removedId = pages.value[pIdx].drawings[idx].id; if (pages.value[pIdx].drawings[idx].imgSrc) URL.revokeObjectURL(pages.value[pIdx].drawings[idx].imgSrc); pages.value[pIdx].scripts.forEach(s => { if (s.drawingId === removedId) s.drawingId = null; }); pages.value[pIdx].drawings.splice(idx, 1); } };

        // --- プロット操作（移動・挿入） ---
        const moveScript = (pIndex, sIndex, dir) => {
            const scripts = pages.value[pIndex].scripts;
            const targetIndex = sIndex + dir;
            if (targetIndex >= 0 && targetIndex < scripts.length) {
                const item = scripts.splice(sIndex, 1)[0];
                scripts.splice(targetIndex, 0, item);
                nextTick(() => resizeTextareas());
            }
        };

        const insertScriptAfter = (pIndex, sIndex) => {
            const scripts = pages.value[pIndex].scripts;
            // 名前も内容も空の新しい行を作成
            const newScript = {
                id: Date.now() + Math.random(),
                char: '',
                text: '',
                drawingId: null,
                layout: { x: 300, y: 200, fontSize: 14 }
            };
            scripts.splice(sIndex + 1, 0, newScript);

            // 追加された行の名前入力欄にフォーカス
            nextTick(() => {
                resizeTextareas();
                const nextCharInput = scriptInputRefs.value[`${pIndex}-${sIndex + 1}-char`];
                if (nextCharInput) nextCharInput.focus();
            });
        };

        // --- ドラッグ＆ドロップ（プロット） ---
        const dragStart = (pIndex, idx) => { draggingItem.value = { pIndex, idx }; };
        const dragOverScript = (pIndex, idx) => { if (draggingItem.value.pIndex === pIndex && draggingItem.value.idx === idx) { dropTarget.value = null; return; } dropTarget.value = { pIndex, idx }; };
        const dragOverPage = (pIndex) => { if (dropTarget.value && dropTarget.value.pIndex === pIndex && dropTarget.value.idx !== null) return; dropTarget.value = { pIndex, idx: null }; };
        const dropOnScript = (pIndex, idx) => executeScriptMove(pIndex, idx);
        const dropOnPage = (pIndex) => executeScriptMove(pIndex, null);
        const dragEnd = () => { draggingItem.value = null; dropTarget.value = null; };

        // FIX: プロット移動ロジックの簡略化
        const executeScriptMove = (targetPIndex, targetIdx) => {
            const dragInfo = draggingItem.value;
            if (!dragInfo) return;

            const { pIndex: srcP, idx: srcIdx } = dragInfo;
            const srcScripts = pages.value[srcP].scripts;
            const item = srcScripts[srcIdx];

            // ページ移動時は紐付け解除
            if (srcP !== targetPIndex) item.drawingId = null;

            srcScripts.splice(srcIdx, 1);

            // 挿入処理
            if (targetIdx === null) {
                pages.value[targetPIndex].scripts.push(item);
            } else {
                pages.value[targetPIndex].scripts.splice(targetIdx, 0, item);
            }

            draggingItem.value = null; dropTarget.value = null;
        };

        const isDropTarget = (pIndex, idx) => dropTarget.value && dropTarget.value.pIndex === pIndex && dropTarget.value.idx === idx;
        const isDragging = (pIndex, idx) => draggingItem.value && draggingItem.value.pIndex === pIndex && draggingItem.value.idx === idx;

        // --- ドラッグ＆ドロップ（コンテのコマ） ---
        const dragStartDrawing = (e, idx) => { if (!isDrawingDragReady.value) { e.preventDefault(); return; } draggingDrawingIndex.value = idx; };
        const dragEndDrawing = () => { draggingDrawingIndex.value = null; dropTargetDrawingIndex.value = null; isDrawingDragReady.value = false; };
        const dragOverDrawing = (idx) => { if (draggingDrawingIndex.value === null) return; if (draggingDrawingIndex.value === idx) return; dropTargetDrawingIndex.value = idx; };

        // コマ移動ロジック（async/await対応）
        const dropOnDrawing = async (targetIdx) => {
            const srcIdx = draggingDrawingIndex.value; // 退避
            if (srcIdx === null) return;

            await saveAllCanvases();

            const drawings = pages.value[activePageIndex.value].drawings;
            const item = drawings.splice(srcIdx, 1)[0];
            drawings.splice(targetIdx, 0, item); // 単純挿入

            dragEndDrawing();
            restoreAllCanvases();
        };

        const dragStartConteScript = (e, script) => { e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.dropEffect = 'move'; e.dataTransfer.setData('text/plain', script.id); draggingConteScript.value = script; };
        const dragEndConteScript = () => { draggingConteScript.value = null; isConteDropTarget.value = null; };
        const dragOverConteScript = (targetId) => { if (draggingDrawingIndex.value !== null) return; if (!draggingConteScript.value) return; isConteDropTarget.value = targetId; };
        // 特定のセリフの上にドロップした場合（挿入・並び替え）
        const dropOnConteScript = (targetScript) => {
            const sourceScriptRef = draggingConteScript.value;
            if (!sourceScriptRef || sourceScriptRef.id === targetScript.id) return;

            const scripts = pages.value[activePageIndex.value].scripts;
            const srcIdx = scripts.findIndex(s => s.id === sourceScriptRef.id);

            if (srcIdx > -1) {
                // 配列から取り出す
                const [item] = scripts.splice(srcIdx, 1);

                // 所属をターゲットに合わせる
                item.drawingId = targetScript.drawingId;

                // ターゲットの新しいインデックスを再取得（削除でずれている可能性があるため再検索推奨）
                let targetIdx = scripts.findIndex(s => s.id === targetScript.id);
                if (targetIdx === -1) targetIdx = scripts.length; // 見つからなければ末尾

                // 挿入
                scripts.splice(targetIdx, 0, item);
            }

            draggingConteScript.value = null;
            isConteDropTarget.value = null;
        };

        // コマ（コンテナ）にドロップした場合
        const dropOnConteDrawing = (drawingId) => {
            const sourceScriptRef = draggingConteScript.value;
            if (!sourceScriptRef) return;

            const pIdx = activePageIndex.value;
            const scripts = pages.value[pIdx].scripts;
            const srcIdx = scripts.findIndex(s => s.id === sourceScriptRef.id);

            if (srcIdx > -1) {
                // 配列から取り出す
                const [item] = scripts.splice(srcIdx, 1);

                // 所属を更新
                item.drawingId = drawingId;

                // 挿入位置を探すロジック（ロジック自体は前回と同じですが、変数は item を使います）
                let insertIndex = -1;

                // このコマに属するセリフの末尾を探す
                for (let i = scripts.length - 1; i >= 0; i--) {
                    if (scripts[i].drawingId === drawingId) {
                        insertIndex = i + 1;
                        break;
                    }
                }

                if (insertIndex === -1) {
                    const drawings = pages.value[pIdx].drawings;
                    const currentDrawingIdx = drawings.findIndex(d => d.id === drawingId);
                    for (let d = currentDrawingIdx - 1; d >= 0; d--) {
                        const prevDId = drawings[d].id;
                        for (let i = scripts.length - 1; i >= 0; i--) {
                            if (scripts[i].drawingId === prevDId) {
                                insertIndex = i + 1;
                                break;
                            }
                        }
                        if (insertIndex !== -1) break;
                    }
                }

                if (insertIndex === -1) insertIndex = 0;

                // 挿入
                scripts.splice(insertIndex, 0, item);
            }

            draggingConteScript.value = null;
            isConteDropTarget.value = null;
        };

        // 未割り当てエリアにドロップした場合
        const dropOnConteUnassigned = () => {
            const sourceScriptRef = draggingConteScript.value;
            if (!sourceScriptRef) return;

            const scripts = pages.value[activePageIndex.value].scripts;
            const srcIdx = scripts.findIndex(s => s.id === sourceScriptRef.id);

            if (srcIdx > -1) {
                // 【重要】配列から削除すると同時に、そのオブジェクト実体を取り出す
                const [item] = scripts.splice(srcIdx, 1);

                // 取り出したオブジェクトの情報を書き換える
                item.drawingId = null;

                // 取り出したオブジェクトを末尾に追加する
                scripts.push(item);
            }

            draggingConteScript.value = null;
            isConteDropTarget.value = null;
        };

        // --- キャンバス描画関連 ---
        const onHandleDown = () => { isDrawingDragReady.value = true; };
        const onHandleUp = () => { isDrawingDragReady.value = false; };
        const startDraw = (e, drawing) => {
            // タッチ操作時のスクロール防止
            if (e.type === 'touchstart') e.preventDefault();

            isDrawing.value = true;
            lastActiveDrawingId.value = drawing.id;
            const canvas = e.target;
            const rect = canvas.getBoundingClientRect();
            const pos = getClientPos(e); // ヘルパー使用
            lastPos.x = pos.x - rect.left;
            lastPos.y = pos.y - rect.top;
        };

        const draw = (e, drawing) => {
            if (!isDrawing.value) return;
            if (e.type === 'touchmove') e.preventDefault(); // スクロール防止

            const canvas = e.target;
            const ctx = canvas.getContext('2d');
            const rect = canvas.getBoundingClientRect();
            const pos = getClientPos(e); // ヘルパー使用
            const x = pos.x - rect.left;
            const y = pos.y - rect.top;

            ctx.beginPath();
            ctx.moveTo(lastPos.x, lastPos.y);
            ctx.lineTo(x, y);
            ctx.strokeStyle = drawingTool.value === 'eraser' ? '#ffffff' : '#000000';
            ctx.lineWidth = drawingTool.value === 'eraser' ? 20 : 3;
            ctx.lineCap = 'round';
            ctx.stroke();

            lastPos.x = x;
            lastPos.y = y;
        };
        const stopDraw = (drawing) => {
            if (isDrawing.value) {
                isDrawing.value = false;
                // 引数の drawing がない場合は、現在編集中の currentEditingDrawing を使う
                const target = drawing || currentEditingDrawing.value;
                if (target) {
                    saveHistory(target);
                }
            }
        };
        const clearCurrentPageCanvas = () => { if (!confirm('全消去しますか？')) return; pages.value[activePageIndex.value].drawings.forEach(d => { const cvs = canvasRefs.value[d.id]; if (cvs) cvs.getContext('2d').clearRect(0, 0, 360, 240); saveHistory(d); }); };

        // Undo/Redo
        // // キャンバスへの描画処理を強化
        const drawToCanvas = (drawing, url, targetCanvas = null) => {
            // 1. モーダルが開いている場合は最優先でモーダル用キャンバスを使用
            // 2. 引数になければ canvasRefs から取得
            const canvas = targetCanvas || (showDrawingModal.value ? modalCanvasRef.value : canvasRefs.value[drawing.id]);

            if (!canvas) {
                console.error("Canvas not found for drawing:", drawing.id);
                return;
            }

            const ctx = canvas.getContext('2d');
            const img = new Image();
            img.onload = () => {
                // 描画前にクリア
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                // 背景を白で塗る（透過防止）
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                // 画像を描画
                ctx.drawImage(img, 0, 0);
            };
            img.src = url;
        };

        // Undo (元に戻す)
        const undo = (drawing) => {
            if (!drawing || drawing.historyStep <= 0) return;

            drawing.historyStep--;
            const prevUrl = drawing.history[drawing.historyStep];
            drawing.imgSrc = prevUrl;

            // 強制的に再描画を実行
            drawToCanvas(drawing, prevUrl);
        };

        // Redo (やり直す)
        const redo = (drawing) => {
            if (!drawing || !drawing.history || drawing.historyStep >= drawing.history.length - 1) return;

            drawing.historyStep++;
            const nextUrl = drawing.history[drawing.historyStep];
            drawing.imgSrc = nextUrl;

            // 強制的に再描画を実行
            drawToCanvas(drawing, nextUrl);
        };

        const canUndo = (drawing) => {
            return drawing && drawing.history && drawing.history.length > 1 && drawing.historyStep > 0;
        };
        const canRedo = (drawing) => {
            return drawing && drawing.history && drawing.historyStep < drawing.history.length - 1;
        };
        const handleGlobalKeydown = (e) => { if (currentMode.value !== 'conte') return; if (!lastActiveDrawingId.value) return; let targetDrawing = null; for (const page of pages.value) { targetDrawing = page.drawings.find(d => d.id === lastActiveDrawingId.value); if (targetDrawing) break; } if (!targetDrawing) return; if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); e.shiftKey ? redo(targetDrawing) : undo(targetDrawing); } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(targetDrawing); } };

        // キャンバス復元（リトライロジック付き）
        const restoreAllCanvases = async () => {
            await nextTick();
            const tryRestore = (count = 0) => {
                const pageData = pages.value[activePageIndex.value];
                if (!pageData) return;

                let allDone = true;
                pageData.drawings.forEach(d => {
                    if (d.imgSrc && canvasRefs.value[d.id]) {
                        drawToCanvas(d, d.imgSrc);
                    } else if (d.imgSrc && !canvasRefs.value[d.id]) {
                        allDone = false;
                    }
                });

                if (!allDone && count < 10) {
                    setTimeout(() => tryRestore(count + 1), 50);
                }
            };
            tryRestore();
        };

        // --- レイアウト操作ロジック ---
        let interactTarget = null; let startX, startY, startValX, startValY, startW, startH, activeHandleType; let linkedItems = [];
        const startLayoutDrag = (e, item) => {
            if (e.target.classList.contains('resize-handle')) return;
            // タッチの場合はデフォルト動作（スクロールなど）を防ぐ
            if (e.type === 'touchstart') e.preventDefault();

            interactTarget = item;
            const pos = getClientPos(e);
            startX = pos.x;
            startY = pos.y;

            if (isImageEditMode.value && item.inner) {
                startValX = item.inner.x || 0;
                startValY = item.inner.y || 0;
                // タッチイベントもリッスン
                document.addEventListener('mousemove', onImageDrag);
                document.addEventListener('touchmove', onImageDrag, { passive: false });
            } else {
                startValX = item.layout.x;
                startValY = item.layout.y;
                linkedItems = [];
                const page = pages.value.find(p => p.drawings.some(d => d.id === item.id));
                if (page) {
                    const scripts = page.scripts.filter(s => s.drawingId === item.id);
                    linkedItems = scripts.map(s => ({ item: s, startX: s.layout.x, startY: s.layout.y }));
                }
                document.addEventListener('mousemove', onLayoutDrag);
                document.addEventListener('touchmove', onLayoutDrag, { passive: false });
            }
            document.addEventListener('mouseup', stopInteract);
            document.addEventListener('touchend', stopInteract);
        };

        const onLayoutDrag = (e) => {
            if (!interactTarget) return;
            if (e.type === 'touchmove') e.preventDefault(); // スクロール防止

            const pos = getClientPos(e);
            let newX = startValX + (pos.x - startX);
            let newY = startValY + (pos.y - startY);

            const w = interactTarget.layout.w || 50;
            const h = interactTarget.layout.h || 50;
            newX = Math.max(0, Math.min(displayW.value - w, newX));
            newY = Math.max(0, Math.min(displayH.value - h, newY));
            interactTarget.layout.x = newX;
            interactTarget.layout.y = newY;

            if (linkedItems.length > 0) {
                const dx = newX - startValX;
                const dy = newY - startValY;
                linkedItems.forEach(link => {
                    let lx = link.startX + dx;
                    let ly = link.startY + dy;
                    lx = Math.max(-50, Math.min(displayW.value + 50, lx));
                    ly = Math.max(-50, Math.min(displayH.value + 50, ly));
                    link.item.layout.x = lx;
                    link.item.layout.y = ly;
                });
            }
        };

        const onImageDrag = (e) => {
            if (!interactTarget) return;
            if (e.type === 'touchmove') e.preventDefault();
            const pos = getClientPos(e);
            if (!interactTarget.inner) interactTarget.inner = { scale: 1, x: 0, y: 0 };
            interactTarget.inner.x = startValX + (pos.x - startX);
            interactTarget.inner.y = startValY + (pos.y - startY);
        };

        const onImageWheel = (e, item) => { if (!isImageEditMode.value || !selectedItemId.value === item.id) return; if (!item.inner) item.inner = { scale: 1, x: 0, y: 0 }; const delta = e.deltaY > 0 ? -0.1 : 0.1; item.inner.scale = Math.max(0.1, (item.inner.scale || 1) + delta); };
        const zoomImage = (item, amount) => { if (!item.inner) item.inner = { scale: 1, x: 0, y: 0 }; item.inner.scale = Math.max(0.1, (item.inner.scale || 1) + amount); };

        const startLayoutResize = (e, item, handleType) => {
            if (e.type === 'touchstart') e.preventDefault();
            interactTarget = item;
            activeHandleType = handleType;
            const pos = getClientPos(e);
            startX = pos.x;
            startY = pos.y;
            startValX = item.layout.x;
            startValY = item.layout.y;
            startW = item.layout.w;
            startH = item.layout.h;
            e.stopPropagation();

            document.addEventListener('mousemove', onLayoutResize);
            document.addEventListener('touchmove', onLayoutResize, { passive: false });
            document.addEventListener('mouseup', stopInteract);
            document.addEventListener('touchend', stopInteract);
        };

        const onLayoutResize = (e) => {
            if (!interactTarget) return;
            if (e.type === 'touchmove') e.preventDefault();

            const pos = getClientPos(e);
            const dx = pos.x - startX;
            const dy = pos.y - startY;
            let newX = startValX, newY = startValY, newW = startW, newH = startH;
            if (activeHandleType === 'br') { newW = Math.max(20, startW + dx); newH = Math.max(20, startH + dy); }
            else if (activeHandleType === 'bl') { newW = Math.max(20, startW - dx); newX = startValX + (startW - newW); newH = Math.max(20, startH + dy); }
            else if (activeHandleType === 'tr') { newH = Math.max(20, startH - dy); newY = startValY + (startH - newH); newW = Math.max(20, startW + dx); }
            else if (activeHandleType === 'tl') { newW = Math.max(20, startW - dx); newH = Math.max(20, startH - dy); newX = startValX + (startW - newW); newY = startValY + (startH - newH); }
            if (newX < 0) { newW += newX; newX = 0; }
            if (newY < 0) { newH += newY; newY = 0; }
            if (newX + newW > displayW.value) newW = displayW.value - newX;
            if (newY + newH > displayH.value) newH = displayH.value - newY;
            interactTarget.layout.x = newX;
            interactTarget.layout.y = newY;
            interactTarget.layout.w = newW;
            interactTarget.layout.h = newH;
        };

        const stopInteract = () => {
            interactTarget = null;
            document.removeEventListener('mousemove', onLayoutDrag);
            document.removeEventListener('touchmove', onLayoutDrag); // 追加
            document.removeEventListener('mousemove', onImageDrag);
            document.removeEventListener('touchmove', onImageDrag); // 追加
            document.removeEventListener('mousemove', onLayoutResize);
            document.removeEventListener('touchmove', onLayoutResize); // 追加
            document.removeEventListener('mouseup', stopInteract);
            document.removeEventListener('touchend', stopInteract); // 追加
        };
        const moveItemPage = (pageIdx, type, itemIdx, dir) => { const targetPageIdx = pageIdx + dir; if (targetPageIdx >= 0 && targetPageIdx < pages.value.length) { const item = pages.value[pageIdx][type].splice(itemIdx, 1)[0]; pages.value[targetPageIdx][type].push(item); } };
        const moveDrawingPage = async (pageIdx, drawingIdx, dir) => { const targetPageIdx = pageIdx + dir; if (targetPageIdx >= 0 && targetPageIdx < pages.value.length) { await saveAllCanvases(); const drawing = pages.value[pageIdx].drawings.splice(drawingIdx, 1)[0]; if (dir === -1) pages.value[targetPageIdx].drawings.push(drawing); else pages.value[targetPageIdx].drawings.unshift(drawing); const relatedScripts = pages.value[pageIdx].scripts.filter(s => s.drawingId === drawing.id); for (let i = pages.value[pageIdx].scripts.length - 1; i >= 0; i--) { if (pages.value[pageIdx].scripts[i].drawingId === drawing.id) { pages.value[pageIdx].scripts.splice(i, 1); } } pages.value[targetPageIdx].scripts.push(...relatedScripts); } };

        // 指定したインデックス以降の全セリフを新しいページに移動する
        const moveSubsequentScriptsToNewPage = async (pIndex, sIndex) => {
            if (!confirm("このセリフ以降を新しいページに移動しますか？")) return;

            // 1. 現在のページから、指定位置以降のセリフを切り出す
            const scriptsToMove = pages.value[pIndex].scripts.splice(sIndex);

            // 2. 新しいページを作成し、切り出したセリフを入れる
            const newPage = {
                id: Date.now(),
                scripts: scriptsToMove,
                drawings: []
            };

            // 3. 現在のページの直後に挿入
            pages.value.splice(pIndex + 1, 0, newPage);

            // 4. 描画更新
            nextTick(() => resizeTextareas());
        };

        // --- ファイル保存・読込・エクスポート ---
        // BlobをBase64に変換する関数
        const blobToBase64 = (blob) => {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
        };

        // JSONデータを作成する共通関数
        const createExportData = async () => {
            if (currentMode.value === 'conte') await saveAllCanvases();
            const exportData = {
                pages: JSON.parse(JSON.stringify(pages.value)),
                config: pageConfig.value
            };
            // 画像データをBase64化
            for (const page of exportData.pages) {
                for (const drawing of page.drawings) {
                    delete drawing.history;
                    delete drawing.historyStep;
                    if (drawing.imgSrc) {
                        // 実行中のデータから最新のBlobを取得してBase64化
                        const livePage = pages.value.find(p => p.id === page.id);
                        const liveDrawing = livePage.drawings.find(d => d.id === drawing.id);
                        if (liveDrawing && liveDrawing.imgSrc) {
                            try {
                                const response = await fetch(liveDrawing.imgSrc);
                                const blob = await response.blob();
                                drawing.imgSrc = await blobToBase64(blob);
                            } catch (e) { console.error(e); }
                        }
                    }
                }
            }
            return JSON.stringify(exportData);
        };

        // 保存処理（上書き）
        const saveProject = async () => {
            // スマホやファイルハンドルがない場合は「別名保存」へ流す
            if (!currentFileHandle.value) {
                saveProjectAs();
                return;
            }
            try {
                isProcessing.value = true;
                const jsonString = await createExportData();
                const blob = new Blob([jsonString], { type: "application/json" });
                const writable = await currentFileHandle.value.createWritable();
                await writable.write(blob);
                await writable.close();
                alert("上書き保存しました");
            } catch (e) {
                console.error(e);
                alert("保存に失敗しました");
            } finally {
                isProcessing.value = false;
            }
        };

        // 別名保存（スマホの場合はダウンロード保存）
        const saveProjectAs = async () => {
            isProcessing.value = true;
            try {
                const jsonString = await createExportData();
                const blob = new Blob([jsonString], { type: "application/json" });

                // 【分岐】PCの最新APIが使えるか確認
                if ('showSaveFilePicker' in window) {
                    try {
                        const opts = {
                            types: [{
                                description: 'Manga Project File',
                                accept: { 'application/json': ['.json'] }
                            }],
                        };
                        const handle = await window.showSaveFilePicker(opts);
                        const writable = await handle.createWritable();
                        await writable.write(blob);
                        await writable.close();
                        currentFileHandle.value = handle; // ハンドルを記憶
                        alert("保存しました");
                    } catch (err) {
                        // キャンセルされた場合など
                        if (err.name !== 'AbortError') console.error(err);
                    }
                } else {
                    // 【スマホ・旧ブラウザ用】FileSaver.jsでダウンロード保存
                    saveAs(blob, "manga_project.json");
                    alert("ファイルをダウンロードしました。\nGoogleドライブ等に手動でアップロードしてください。");
                }
            } catch (e) {
                console.error(e);
                alert("エラーが発生しました");
            } finally {
                isProcessing.value = false;
            }
        };

        // 読込ボタンが押されたとき
        const loadProjectFromFile = async () => {
            // 【分岐】PCの最新APIが使えるか
            if ('showOpenFilePicker' in window) {
                try {
                    const [handle] = await window.showOpenFilePicker({
                        types: [{
                            description: 'Manga Project File',
                            accept: { 'application/json': ['.json'] }
                        }],
                        multiple: false
                    });
                    const file = await handle.getFile();
                    await loadFileContent(file); // 共通の読込処理へ
                    currentFileHandle.value = handle; // ハンドルを記憶（次回から上書き可能）
                } catch (err) {
                    if (err.name !== 'AbortError') console.error(err);
                }
            } else {
                // 【スマホ用】隠しinputをクリックしてファイル選択画面を出す
                fileInput.value.click();
            }
        };

        // スマホでファイルが選択されたときに呼ばれる関数
        const handleFileChange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            await loadFileContent(file);
            e.target.value = ''; // リセット
            currentFileHandle.value = null; // スマホではハンドル保持できないためリセット
        };

        // 実際のファイル読込・展開処理（共通）
        const loadFileContent = async (file) => {
            isProcessing.value = true;
            try {
                const text = await file.text();
                const importedData = JSON.parse(text);
                const importedPages = importedData.pages || importedData;

                // 画像データの復元（Base64 -> Blob URL）
                for (const page of importedPages) {
                    for (const drawing of page.drawings) {
                        if (drawing.imgSrc && drawing.imgSrc.startsWith('data:')) {
                            const res = await fetch(drawing.imgSrc);
                            const blob = await res.blob();
                            drawing.imgSrc = URL.createObjectURL(blob);
                        }
                        drawing.history = drawing.imgSrc ? [drawing.imgSrc] : [];
                        drawing.historyStep = drawing.imgSrc ? 0 : -1;
                    }
                }

                // メモリ解放
                pages.value.forEach(p => p.drawings.forEach(d => {
                    if (d.imgSrc) URL.revokeObjectURL(d.imgSrc);
                }));

                pages.value = importedPages;
                if (importedData.config) pageConfig.value = importedData.config;

                activePageIndex.value = 0;
                nextTick(() => {
                    if (currentMode.value === 'conte') restoreAllCanvases();
                    isProcessing.value = false;
                    resizeTextareas();
                });

            } catch (e) {
                console.error(e);
                alert("ファイルの読み込みに失敗しました");
                isProcessing.value = false;
            }
        };

        const exportData = async (format = 'png') => {
            if (currentMode.value !== 'name') { alert('ネームモードに切り替えてから実行します'); currentMode.value = 'name'; await nextTick(); }
            const useDirectory = 'showDirectoryPicker' in window; let dirHandle = null; if (useDirectory) { try { dirHandle = await window.showDirectoryPicker(); } catch (e) { return; } }
            isExporting.value = true; isProcessing.value = true;
            if (format === 'psd') { isTextLayerMode.value = true; isHideGuideMode.value = true; isHideDrawingMode.value = true; isTransparentMode.value = true; }
            else { isTextLayerMode.value = false; isHideGuideMode.value = true; isHideDrawingMode.value = false; isTransparentMode.value = false; }

            selectedItemId.value = null; isImageEditMode.value = false;
            await nextTick(); await new Promise(r => setTimeout(r, 1000));

            const pageElements = document.querySelectorAll('.manga-page');
            const zip = useDirectory ? null : new JSZip();

            for (let i = 0; i < pageElements.length; i++) {
                const el = pageElements[i]; if (el.classList.contains('opacity-0')) continue;
                try {
                    const canvasW = pageConfig.value.canvasW; const canvasH = pageConfig.value.canvasH;
                    const scale = pageConfig.value.scale; const domW = el.clientWidth; const ratio = canvasW / domW;
                    const pageNum = el.id.replace('render-page-', '');

                    if (format === 'png') {
                        const dataUrl = await htmlToImage.toPng(el, { width: canvasW, height: canvasH, style: { transform: `scale(${ratio})`, transformOrigin: 'top left', width: `${domW}px`, height: `${el.clientHeight}px`, margin: 0 }, filter: (node) => (node.id !== 'font-awesome') });
                        const blob = await (await fetch(dataUrl)).blob();
                        const fileName = `page_${String(Number(pageNum) + 1).padStart(3, '0')}.png`;
                        if (useDirectory && dirHandle) { const fileHandle = await dirHandle.getFileHandle(fileName, { create: true }); const writable = await fileHandle.createWritable(); await writable.write(blob); await writable.close(); } else if (zip) { zip.file(fileName, blob); }
                    } else if (format === 'psd') {
                        const textDataUrl = await htmlToImage.toPng(el, { width: canvasW, height: canvasH, style: { transform: `scale(${ratio})`, transformOrigin: 'top left', width: `${domW}px`, height: `${el.clientHeight}px`, margin: 0, backgroundColor: 'rgba(0,0,0,0)' }, filter: (node) => (node.id !== 'font-awesome') });
                        const textImg = new Image(); textImg.src = textDataUrl; await new Promise(r => textImg.onload = r);
                        const textCanvas = document.createElement('canvas'); textCanvas.width = canvasW; textCanvas.height = canvasH;
                        textCanvas.getContext('2d').drawImage(textImg, 0, 0);

                        const drawCanvas = document.createElement('canvas'); drawCanvas.width = canvasW; drawCanvas.height = canvasH;
                        const dCtx = drawCanvas.getContext('2d');
                        const pageIndex = parseInt(pageNum); const pageData = pages.value[pageIndex];
                        if (pageData) {
                            for (const d of pageData.drawings) {
                                if (d.imgSrc) {
                                    const img = new Image(); img.src = d.imgSrc; await new Promise(r => img.onload = r);
                                    const x = d.layout.x / scale; const y = d.layout.y / scale; const w = d.layout.w / scale; const h = d.layout.h / scale;
                                    dCtx.save(); dCtx.beginPath(); dCtx.rect(x, y, w, h); dCtx.clip();
                                    const ix = (d.inner?.x || 0) / scale; const iy = (d.inner?.y || 0) / scale; const is = d.inner?.scale || 1;
                                    const imgCenterX = x + w / 2 + ix; const imgCenterY = y + h / 2 + iy;
                                    const ratioImg = Math.min(w / img.width, h / img.height) * is;
                                    const dw = img.width * ratioImg; const dh = img.height * ratioImg;
                                    const dx = imgCenterX - dw / 2; const dy = imgCenterY - dh / 2;
                                    dCtx.drawImage(img, dx, dy, dw, dh);
                                    dCtx.restore();
                                    dCtx.strokeStyle = "black"; dCtx.lineWidth = 2 / scale; dCtx.strokeRect(x, y, w, h);
                                }
                            }
                        }

                        const guideCanvas = document.createElement('canvas'); guideCanvas.width = canvasW; guideCanvas.height = canvasH;
                        const gCtx = guideCanvas.getContext('2d');
                        const { finishW, finishH, bleed, safeTop, safeBottom, safeInside, safeOutside } = pageConfig.value;
                        const fx = (canvasW - finishW) / 2; const fy = (canvasH - finishH) / 2;
                        gCtx.strokeStyle = "rgba(136, 146, 230, 0.8)"; gCtx.lineWidth = 1;
                        gCtx.strokeRect(fx, fy, finishW, finishH);
                        const isRight = (pageIndex === 0) || (pageIndex % 2 !== 0); const si = isRight ? safeInside : safeOutside; const so = isRight ? safeOutside : safeInside;
                        gCtx.strokeRect(fx + si, fy + safeTop, finishW - si - so, finishH - safeTop - safeBottom);
                        const bx = fx - bleed; const by = fy - bleed; const bw = finishW + bleed * 2; const bh = finishH + bleed * 2;
                        gCtx.strokeRect(bx, by, bw, bh);

                        gCtx.beginPath(); const tExt = 200; const bxr = bx + bw; const byb = by + bh; const fxr = fx + finishW; const fyb = fy + finishH; const cx = canvasW / 2; const cy = canvasH / 2; const cLen = 200;
                        gCtx.moveTo(cx, by); gCtx.lineTo(cx, by - tExt); gCtx.moveTo(cx - cLen, by - tExt / 2); gCtx.lineTo(cx + cLen, by - tExt / 2);
                        gCtx.moveTo(cx, byb); gCtx.lineTo(cx, byb + tExt); gCtx.moveTo(cx - cLen, byb + tExt / 2); gCtx.lineTo(cx + cLen, byb + tExt / 2);
                        gCtx.moveTo(bx, cy); gCtx.lineTo(bx - tExt, cy); gCtx.moveTo(bx - tExt / 2, cy - cLen); gCtx.lineTo(bx - tExt / 2, cy + cLen);
                        gCtx.moveTo(bxr, cy); gCtx.lineTo(bxr + tExt, cy); gCtx.moveTo(bxr + tExt / 2, cy - cLen); gCtx.lineTo(bxr + tExt / 2, cy + cLen);
                        gCtx.moveTo(fx, by); gCtx.lineTo(fx, by - tExt); gCtx.moveTo(bx, by); gCtx.lineTo(bx, by - tExt); gCtx.moveTo(bx, fy); gCtx.lineTo(bx - tExt, fy); gCtx.moveTo(bx, by); gCtx.lineTo(bx - tExt, by);
                        gCtx.moveTo(fxr, by); gCtx.lineTo(fxr, by - tExt); gCtx.moveTo(bxr, by); gCtx.lineTo(bxr, by - tExt); gCtx.moveTo(bxr, fy); gCtx.lineTo(bxr + tExt, fy); gCtx.moveTo(bxr, by); gCtx.lineTo(bxr + tExt, by);
                        gCtx.moveTo(fx, byb); gCtx.lineTo(fx, byb + tExt); gCtx.moveTo(bx, byb); gCtx.lineTo(bx, byb + tExt); gCtx.moveTo(bx, fyb); gCtx.lineTo(bx - tExt, fyb); gCtx.moveTo(bx, byb); gCtx.lineTo(bx - tExt, byb);
                        gCtx.moveTo(fxr, byb); gCtx.lineTo(fxr, byb + tExt); gCtx.moveTo(bxr, byb); gCtx.lineTo(bxr, byb + tExt); gCtx.moveTo(bxr, fyb); gCtx.lineTo(bxr + tExt, fyb); gCtx.moveTo(bxr, byb); gCtx.lineTo(bxr + tExt, byb);
                        gCtx.stroke();
                        const bgCanvas = document.createElement('canvas'); bgCanvas.width = canvasW; bgCanvas.height = canvasH; bgCanvas.getContext('2d').fillStyle = "white"; bgCanvas.getContext('2d').fillRect(0, 0, canvasW, canvasH);
                        const psd = { width: canvasW, height: canvasH, children: [{ name: 'Paper', canvas: bgCanvas }, { name: 'Guide', canvas: guideCanvas }, { name: 'Drawings', canvas: drawCanvas }, { name: 'Text', canvas: textCanvas }] };
                        const buffer = agPsd.writePsd(psd); const blob = new Blob([buffer]); const fileName = `page_${String(Number(pageNum) + 1).padStart(3, '0')}.psd`;
                        if (useDirectory && dirHandle) { const fileHandle = await dirHandle.getFileHandle(fileName, { create: true }); const writable = await fileHandle.createWritable(); await writable.write(blob); await writable.close(); } else if (zip) { zip.file(fileName, blob); }
                    }
                } catch (e) { console.error(e); }
            }
            isTextLayerMode.value = false; isHideGuideMode.value = false; isHideDrawingMode.value = false; isTransparentMode.value = false; isExporting.value = false; isProcessing.value = false;
            if (zip) { zip.generateAsync({ type: "blob" }).then(c => saveAs(c, format === 'png' ? "manga_png.zip" : "manga_psd.zip")); } else { alert("保存完了"); }
        };

        // 全ページ・全セリフを走査して、既に入力されている名前を重複なしでリスト化します
        const uniqueCharacters = computed(() => {
            const chars = new Set();
            pages.value.forEach(p => {
                p.scripts.forEach(s => {
                    // 空白を除去して記録
                    const name = s.char ? s.char.trim() : '';
                    if (name) chars.add(name);
                });
            });
            return Array.from(chars).sort();
        });

        // --- キーボード操作ハンドラ ---
        const handleScriptTextKeydown = (e, pIndex, sIndex) => {
            // Tabキーの移動処理（変更なし）
            if (e.key === 'Tab') {
                e.preventDefault();
                if (e.shiftKey) focusPrev(pIndex, sIndex, 'text');
                else focusNext(pIndex, sIndex);
                return;
            }

            // PC用ショートカット: Ctrl + Enter で分割
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                performSplit(pIndex, sIndex, e.target); // 共通処理へ
                return;
            }

            // Backspace結合処理
            if (e.key === 'Backspace') {
                const cursor = e.target.selectionStart;
                if (cursor === 0 && e.target.selectionEnd === 0 && sIndex > 0) {
                    e.preventDefault();
                    mergeScriptWithPrev(pIndex, sIndex);
                }
                return;
            }

            // Enter単体は何もしない（改行させる）
        };

        // ボタンからの分割実行
        const splitScriptFromButton = (pIndex, sIndex) => {
            // 該当のtextarea要素を取得
            const el = scriptInputRefs.value[`${pIndex}-${sIndex}-text`];
            if (el) {
                performSplit(pIndex, sIndex, el);
            }
        };

        // 分割の実処理（共通ロジック）
        const performSplit = (pIndex, sIndex, textareaElement) => {
            const scripts = pages.value[pIndex].scripts;
            const currentScript = scripts[sIndex];

            // カーソル位置を取得（スマホでボタンを押した時も、直前のフォーカス位置が維持されていれば取得可能）
            const cursor = textareaElement.selectionStart || 0;
            const fullText = currentScript.text || '';

            // 前半・後半に分割
            const firstPart = fullText.substring(0, cursor);
            const secondPart = fullText.substring(cursor);

            // 現在の行を更新
            currentScript.text = firstPart;

            // 新しい行を作成
            const newScript = {
                id: Date.now() + Math.random(),
                char: currentScript.char, // 名前を引き継ぐ
                text: secondPart,
                drawingId: null,
                layout: { ...currentScript.layout, y: currentScript.layout.y + 20 }
            };

            // 配列に挿入
            scripts.splice(sIndex + 1, 0, newScript);

            // 次の行にフォーカス移動
            nextTick(() => {
                resizeTextareas();
                const nextInput = scriptInputRefs.value[`${pIndex}-${sIndex + 1}-text`];
                if (nextInput) {
                    nextInput.focus();
                    nextInput.setSelectionRange(0, 0);
                }
            });
        };

        // 結合処理
        const mergeScriptWithPrev = (pIndex, sIndex) => {
            const scripts = pages.value[pIndex].scripts;
            const currentScript = scripts[sIndex];
            const prevScript = scripts[sIndex - 1];
            const originalPrevLength = prevScript.text.length;

            prevScript.text += currentScript.text;
            scripts.splice(sIndex, 1);

            nextTick(() => {
                resizeTextareas();
                const prevInput = scriptInputRefs.value[`${pIndex}-${sIndex - 1}-text`];
                if (prevInput) {
                    prevInput.focus();
                    prevInput.setSelectionRange(originalPrevLength, originalPrevLength);
                }
            });
        };

        // --- 監視・初期化 ---
        watch([currentMode, activePageIndex], async () => {
            if (currentMode.value === 'conte') {
                restoreAllCanvases();
            }
        });

        watch([pages, pageConfig], () => {
            if (isRestoring.value) return;
            clearTimeout(autoSaveTimer);
            autoSaveTimer = setTimeout(autoSaveToIDB, 2000);
        }, { deep: true });

        onMounted(async () => {
            try {
                const savedData = await get('manga_project_autosave');
                if (savedData && confirm('前回の作業データを復元しますか？')) {
                    isProcessing.value = true;
                    if (savedData.pages) {
                        for (const page of savedData.pages) {
                            for (const drawing of page.drawings) {
                                if (drawing.imgBlob) {
                                    drawing.imgSrc = URL.createObjectURL(drawing.imgBlob);
                                    delete drawing.imgBlob;
                                }
                                drawing.history = [];
                                drawing.historyStep = -1;
                            }
                        }
                        pages.value = savedData.pages;
                    }
                    if (savedData.config) pageConfig.value = savedData.config;

                    await nextTick();

                    pages.value.forEach(p => p.drawings.forEach(d => {
                        if (d.imgSrc) { d.history = [d.imgSrc]; d.historyStep = 0; }
                    }));
                    resizeTextareas();

                } else {
                    if (pages.value[0].drawings[0]) saveHistory(pages.value[0].drawings[0]);
                    nextTick(() => resizeTextareas());
                }
            } catch (e) {
                console.error("Restore failed:", e);
                alert("データの復元に失敗しました。");
            } finally {
                isRestoring.value = false;
                isProcessing.value = false;
            }

            // ウィンドウサイズが変更されたときに全textareaの高さを再計算
            window.addEventListener('resize', resizeTextareas);

            // クリーンアップ
            window.addEventListener('keydown', handleGlobalKeydown);
        });

        onBeforeUpdate(() => { canvasRefs.value = {}; scriptInputRefs.value = {}; });

        return {
            currentMode, pages, activePageIndex, drawingTool, spreads, isExporting, canvasRefs, showSettings, pageConfig, saveStatus, saveStatusText,
            showTextModal, copiedPageId, copyPageText, getPageTextPreview,
            changeMode, addPage, deletePage, addScript, removeScript, dragStart, dragOverScript, dragOverPage, dropOnScript, dropOnPage, dragEnd, isDropTarget, isDragging,
            addDrawing, removeDrawing, startDraw, draw, stopDraw, clearCurrentPageCanvas, nextPage, prevPage,
            getUnassignedScripts, getScriptsForDrawing, dragStartConteScript, dragOverConteScript, dropOnConteScript, dropOnConteDrawing, dropOnConteUnassigned, isConteDropTarget,
            dragStartDrawing, dragEndDrawing, dragOverDrawing, dropOnDrawing, draggingDrawingIndex, dropTargetDrawingIndex, dragEndConteScript,
            isDrawingDragReady, onHandleDown, onHandleUp,
            selectedItemId, selectItem, isImageEditMode, toggleImageEditMode, onImageWheel, zoomImage,
            startLayoutDrag, startLayoutResize, moveItemPage, moveDrawingPage, exportData,
            currentFileHandle, saveProject, saveProjectAs, loadProjectFromFile,
            undo, redo, canUndo, canRedo,
            pageStyle, guideProps, isProcessing, isTextLayerMode, isHideGuideMode, isHideDrawingMode, isTransparentMode,
            adjustHeight, focusNext, focusText, focusPrev, setInputRef, uniqueCharacters, fontOptions, fileInput, handleFileChange,
            isMenuOpen, handleScriptTextKeydown, handleScriptTextKeydown,
            splitScriptFromButton, moveSubsequentScriptsToNewPage,
            moveScript, insertScriptAfter, copyAllPlots, getClientPos,
            showDrawingModal, currentEditingDrawing, modalCanvasRef,
            openDrawingModal, closeDrawingModal
        };
    }
}).mount('#app');