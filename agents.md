# mangaNameTool - エージェント向けドキュメント

漫画ネーム（コマ割り・セリフ配置）制作ツール。ブラウザ上で動作するシングルページアプリケーション。

## 技術スタック

- **フレームワーク**: Vue 3 (CDN版、ビルドツールなし)
- **状態管理**: Pinia (CDN) — 4ストアに分割（pageStore, configStore, uiStore, historyStore）
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
├── src/                           アプリケーションコード
│   ├── index.html      (824行)   HTMLテンプレート + Vue バインディング
│   ├── style.css       (357行)   カスタムCSS
│   ├── script.js       (297行)   オーケストレーター（モジュール結合・Watcher・ライフサイクル）
│   └── js/
│       ├── stores/                Pinia ストア（状態管理）
│       │   ├── pageStore.js   (60行)   ページ・セリフ・コマのデータ + computed
│       │   ├── configStore.js (41行)   設定・キャンバスサイズ + displayW/H
│       │   ├── uiStore.js    (103行)   UI状態・モーダル・選択・描画ツール
│       │   └── historyStore.js(136行)   Undo/Redo（ネーム + 描画キャンバス）
│       ├── core/                  基盤モジュール（全モード共通）
│       │   └── helpers.js    (215行)   座標計算・ガイド・テキストエリア・フォーカス・クリップボード
│       ├── mode/                  モード固有のインタラクション
│       │   ├── plot/
│       │   │   └── drag.js    (69行)   プロットモード - セリフのドラッグ&ドロップ並替
│       │   ├── conte/
│       │   │   ├── canvas.js (218行)   コンテモード - キャンバス描画・保存復元・IDB自動保存
│       │   │   └── drag.js   (169行)   コンテモード - コマ並替・セリフ割当D&D
│       │   └── name/
│       │       └── layout.js (272行)   ネームモード - コマ・セリフ配置・リサイズ・自動整列
│       └── ops/                   横断的な操作・入出力
│           ├── page-ops.js   (288行)   ページ/セリフCRUD・モード切替・ナビゲーション
│           ├── keyboard.js    (95行)   Tab移動・Ctrl+Enter分割・Backspace結合
│           ├── project-io.js (180行)   プロジェクト保存/読込（JSON・File System Access API）
│           └── export.js     (311行)   PNG/PSD書出し・ZIP出力
├── tests/                         テストコード
│   ├── setup.js                   テスト環境セットアップ（window/document mock、loadModule）
│   ├── helpers/
│   │   ├── mock-vue.js            Vue 3 リアクティブプリミティブのモック
│   │   └── mock-stores.js         Piniaストアのモックファクトリ
│   ├── core/
│   │   ├── helpers.test.js        座標計算・ガイド・テキストプレビュー (11テスト)
│   │   └── computed.test.js       ストアの算出プロパティ (15テスト)
│   ├── mode/
│   │   └── plot-drag.test.js      プロットD&D (11テスト)
│   └── ops/
│       ├── page-ops.test.js       ページ/セリフ操作 (11テスト)
│       └── keyboard.test.js       テキスト分割・結合 (7テスト)
├── package.json
├── vitest.config.js
├── agents.md
└── README.md
```

## アーキテクチャ

### モジュールパターン

ビルドツールを使わないため、ES Modules (import/export) は不使用。
`window.MangaApp` 名前空間にファクトリ関数を登録し、依存性注入で結合する。

```javascript
// 各モジュールのパターン
window.MangaApp = window.MangaApp || {};
window.MangaApp.createXxx = function (deps) {
    const pageStore = deps.pageStore;
    const configStore = deps.configStore;
    // ... 内部実装 ...
    return { publicMethod1, publicMethod2 };
};

// script.js で結合（Piniaストアを生成→モジュールに注入）
const pinia = createPinia();
app.use(pinia);
const pageStore = window.MangaApp.stores.usePageStore();
const configStore = window.MangaApp.stores.useConfigStore();
const helpers = window.MangaApp.createHelpers({ Vue, pageStore, configStore, uiStore });
// ... 依存順に生成 ...
```

### Pinia ストア構成

状態管理を4ドメインに分割。Setup Store 形式 (`defineStore('id', () => { ... })`) を使用。

| ストア | 役割 | 主な内容 |
|--------|------|----------|
| `pageStore` | ページデータ | pages, activePageIndex, currentMode, spreads (computed) |
| `configStore` | 設定 | pageConfig, exportSettings, displayW/H (computed) |
| `uiStore` | UI状態 | モーダル, 選択, ドラッグ, 描画ツール, DOM参照 |
| `historyStore` | 履歴 | ネームUndoRedo, 描画キャンバスUndoRedo |

クロスストア依存は遅延注入で解決: `pageStore.setUiStore()`, `uiStore.setConfigStore()`, `historyStore.setStores()`.

### 依存関係グラフ

```
Pinia stores (pageStore, configStore, uiStore, historyStore)
  ├─→ helpers (Vue, pageStore, configStore, uiStore)
  │     └─→ canvas (Vue, pageStore, configStore, uiStore, historyStore, helpers)
  │           ├─→ page-ops (Vue, pageStore, configStore, uiStore, historyStore, helpers, canvas)
  │           ├─→ conte/drag (pageStore, uiStore, canvas)
  │           ├─→ project-io (Vue, pageStore, configStore, uiStore, helpers, canvas)
  │           └─→ export (Vue, pageStore, configStore, uiStore)
  ├─→ plot/drag (pageStore, uiStore)
  ├─→ name/layout (pageStore, configStore, uiStore, historyStore, helpers, canvas)
  └─→ keyboard (Vue, pageStore, uiStore, helpers)
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

1. `src/js/` 配下の適切なフォルダにファイルを作成
2. `window.MangaApp.createXxx = function(deps) { ... return { ... }; }` パターンで実装
3. `deps` には必要なストア（`pageStore`, `configStore`, `uiStore`, `historyStore`）と他モジュールを指定
4. `src/index.html` にスクリプトタグを依存順に追加
5. `src/script.js` でファクトリを呼び出し、返り値をVueの `return` ブロックに追加
6. `tests/` 配下に対応するテストファイルを作成（`mock-stores.js` でストアをモック、`npm test` で実行確認）

## テスト

### テスト実行

```bash
npm test          # 全テスト実行
npx vitest        # ウォッチモードで実行
```

### テストの仕組み

- **フレームワーク**: Vitest (Node環境、globals有効)
- **モジュール読込**: `loadModule()` でソースファイルを `new Function()` 経由で実行し、`window.MangaApp` にファクトリを登録
- **Vue モック**: `tests/helpers/mock-vue.js` で `ref`/`computed`/`nextTick` の軽量モックを提供
- **ストアモック**: `tests/helpers/mock-stores.js` で各Piniaストアのモックファクトリを提供（`createMockPageStore` 等）
- **DOM モック**: `tests/setup.js` で `document.querySelectorAll` 等の最小限モックを提供

### テスト追加手順

1. `tests/` 配下にソース構造と対応する `.test.js` ファイルを作成
2. `loadModule('src/js/...')` で対象モジュールを読み込み
3. `mock-stores.js` の `createMockPageStore`/`createMockConfigStore` 等でストアをモック
4. ファクトリ関数にモックストアを渡してインスタンスを生成しテスト

## 既知の課題

- `<datalist id="char-name-suggestions">` 要素がHTMLに存在しない（input の `list` 属性が参照）
- CSSクラス `hide-for-text-layer`, `force-transparent` がテンプレートで使用されているが `style.css` に未定義
