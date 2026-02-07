# mangaNameTool - エージェント向けドキュメント

漫画ネーム（コマ割り・セリフ配置）制作ツール。ブラウザ上で動作するシングルページアプリケーション。

## 技術スタック

- **フレームワーク**: Vue 3 (CDN版、ビルドツールなし)
- **CSS**: Tailwind CSS (CDN) + style.css
- **外部ライブラリ** (すべてCDN):
  - html-to-image - DOM→PNG変換
  - ag-psd - PSDファイル生成
  - JSZip - ZIP圧縮
  - FileSaver.js - ファイルダウンロード
  - idb-keyval - IndexedDBラッパー（自動保存）
  - Font Awesome - アイコン

## ファイル構造

```
mangaNameTool/
├── index.html          (824行)   HTMLテンプレート + Vue バインディング
├── style.css           (357行)   カスタムCSS
├── script.js           (266行)   オーケストレーター（モジュール結合・Watcher・ライフサイクル）
└── js/
    ├── core/                      基盤モジュール（全モード共通）
    │   ├── state.js      (103行)   リアクティブ状態定義（ref）
    │   ├── helpers.js    (213行)   座標計算・ガイド・テキストエリア・フォーカス・クリップボード
    │   ├── computed.js    (69行)   算出プロパティ（表示サイズ・見開き・画面判定）
    │   └── history.js    (127行)   Undo/Redo（ネームモード + 描画キャンバス）
    ├── mode/                      モード固有のインタラクション
    │   ├── plot/
    │   │   └── drag.js    (69行)   プロットモード - セリフのドラッグ&ドロップ並替
    │   ├── conte/
    │   │   ├── canvas.js (218行)   コンテモード - キャンバス描画・保存復元・IDB自動保存
    │   │   └── drag.js   (169行)   コンテモード - コマ並替・セリフ割当D&D
    │   └── name/
    │       └── layout.js (272行)   ネームモード - コマ・セリフ配置・リサイズ・自動整列
    └── ops/                       横断的な操作・入出力
        ├── page-ops.js   (288行)   ページ/セリフCRUD・モード切替・ナビゲーション
        ├── keyboard.js    (95行)   Tab移動・Ctrl+Enter分割・Backspace結合
        ├── project-io.js (180行)   プロジェクト保存/読込（JSON・File System Access API）
        └── export.js     (311行)   PNG/PSD書出し・ZIP出力
```

## アーキテクチャ

### モジュールパターン

ビルドツールを使わないため、ES Modules (import/export) は不使用。
`window.MangaApp` 名前空間にファクトリ関数を登録し、依存性注入で結合する。

```javascript
// 各モジュールのパターン
window.MangaApp = window.MangaApp || {};
window.MangaApp.createXxx = function (deps) {
    const state = deps.state;
    // ... 内部実装 ...
    return { publicMethod1, publicMethod2 };
};

// script.js で結合
const state = window.MangaApp.createState(VueDeps);
const helpers = window.MangaApp.createHelpers({ Vue: VueDeps.Vue, state });
// ... 依存順に生成 ...
```

### 依存関係グラフ

```
state (standalone)
  ├─→ helpers (Vue, state)
  │     └─→ computed (Vue, state)
  ├─→ history (Vue, state)
  │     └─→ canvas (Vue, state, history, helpers)
  │           ├─→ page-ops (Vue, state, helpers, history, canvas)
  │           ├─→ conte/drag (state, canvas)
  │           ├─→ project-io (Vue, state, helpers, canvas)
  │           └─→ export (Vue, state)
  ├─→ plot/drag (state)
  ├─→ name/layout (state, helpers, history, canvas, computed)
  └─→ keyboard (Vue, state, helpers)
```

**遅延バインディング**: `helpers.focusNext` が `pageOps.addScript` を必要とするが、helpers は page-ops より先に生成される。`helpers.setAddScript(pageOps.addScript)` で後からワイヤリングしている。

### 3つのモード

| モード | 目的 | 主要モジュール |
|--------|------|----------------|
| **plot** (プロット) | セリフ一覧の作成・並替 | `mode/plot/drag.js` |
| **conte** (コンテ) | コマ割り描画・セリフ割当 | `mode/conte/canvas.js`, `mode/conte/drag.js` |
| **name** (ネーム) | ページ上のコマ・セリフ配置 | `mode/name/layout.js` |

モード切替は `page-ops.js` の `changeMode()` が担当。切替時にキャンバスの保存/復元が行われる。

## データモデル

### Page
```javascript
{
    id: Number,          // タイムスタンプベースのユニークID
    scripts: Script[],
    drawings: Drawing[]
}
```

### Script（セリフ/ト書き/メモ）
```javascript
{
    id: Number,
    type: 'dialogue' | 'direction' | 'note',
    char: String,            // キャラクター名
    text: String,            // セリフ本文
    drawingId: Number|null,  // 割当先コマのID
    layout: { x, y, fontSize }  // ネームモードでの配置
}
```

### Drawing（コマ）
```javascript
{
    id: Number,
    imgSrc: String|null,     // Blob URL or Base64
    cachedBlob: Blob,
    layout: { x, y, w, h, z },          // ネームモードでの配置・サイズ
    inner: { scale, x, y },             // コマ内画像の変形
    history: String[],                   // 描画履歴（Blob URL配列）
    historyStep: Number                  // 現在の履歴位置
}
```

## 永続化

| 方法 | トリガー | 保存先 |
|------|----------|--------|
| **自動保存** | `pages`/`pageConfig` の変更後2秒 | IndexedDB (`idb-keyval`) |
| **手動保存** | ユーザー操作 | JSONファイル (File System Access API / ダウンロード) |
| **書出し** | ユーザー操作 | PNG/PSD (フォルダ保存 or ZIP) |

## 新しいモジュールを追加する場合

1. `js/` 配下の適切なフォルダにファイルを作成
2. `window.MangaApp.createXxx = function(deps) { ... return { ... }; }` パターンで実装
3. `index.html` にスクリプトタグを依存順に追加
4. `script.js` でファクトリを呼び出し、返り値をVueの `return` ブロックに追加

## 既知の課題

- `<datalist id="char-name-suggestions">` 要素がHTMLに存在しない（input の `list` 属性が参照）
- CSSクラス `hide-for-text-layer`, `force-transparent` がテンプレートで使用されているが `style.css` に未定義
