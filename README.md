# BOMSyncTool

![Version](https://img.shields.io/badge/version-0.4.1-blue)
![License](https://img.shields.io/badge/license-未設定-lightgrey)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)

電子部品表（BOM: Bill of Materials）の比較・マージ・前処理を高速化するためのデスクトップアプリケーションです。TypeScript + Vite で構築したフロントエンドと、Rust + Tauri 2 で構成したネイティブレイヤーを組み合わせ、CAD ネットリストを含む多様なフォーマットに対応します。

---

## 🧾 概要

- 2 つの BOM ファイルを解析し、追加・削除・変更・一致をハイライト表示。
- 差分結果からマージ BOM を生成し、CSV / CAD ネットリスト形式でエクスポート可能。
- 辞書機能やビジュアル前処理パイプラインで、社内表記への統一やデータクリーニングを支援。
- マルチタブ＆マルチウィンドウ対応で複数プロジェクトを同時に管理。

---

## ✨ 主な機能

- **差分比較**: Ref/Part_No をベースに BOM 差分を検出し、カテゴリ別に可視化。
- **フォーマット変換**: CSV / XLSX / PADS-ECO / CCF / MSF 形式を双方向に取り扱い。
- **辞書管理**: 登録名リストと特定部品例外で統一名称を一括適用。
- **ビジュアル前処理**: ブロック UI で Reference 展開・空欄補完・書式整形などを組み合わせ。
- **セッション管理**: タブ、お気に入り、別ウィンドウ、オートセーブを備えたプロジェクト切り替え。
- **印刷機能**: 差分結果画面から `window.print()` による帳票出力（Tauri Capabilities 設定済み）。

---

## 🚀 セットアップ

### 必要環境

- Node.js 18 以上（npm / bun いずれも可）
- Bun 1.x（`tauri.conf.json` の `beforeBuildCommand` で使用）
- Rust 1.70 以上
- Tauri CLI 2.x (`cargo install tauri-cli`)
- 推奨: VS Code + Rust Analyzer / TypeScript ESLint

> **Windows の場合**  
> Bun は公式インストーラを PowerShell から `irm https://bun.sh/install.ps1 | iex` で導入できます。CI（GitHub Actions）でも同コマンドでセットアップしています。

### 初期化

```bash
# 依存関係のインストール
npm install
# または
bun install

# フロントエンド + Tauri 開発モード
npm run tauri dev

# 本番ビルド
npm run tauri build
```

> **印刷権限について**  
> `src-tauri/capabilities/default.json` に `core:webview:allow-print` を付与済みです。新しいウィンドウを追加するときは、対応する capability に同じ権限を忘れず追加してください。

---

## 📂 ディレクトリ別コメント

### ルート

- `CHANGELOG.md` — Keep a Changelog 形式の変更履歴。最新版の doc 更新も記録します。
- `README.md` — 本ドキュメント。プロジェクト全体のガイド。
- `bun.lock` / `package-lock.json` — 依存パッケージのロックファイル（Bun と npm で共存管理）。
- `package.json` — npm スクリプト・依存関係の定義。
- `tsconfig.json` / `vite.config.ts` — ビルドと型チェックの設定。
- `index.html` — Vite のエントリ HTML（アプリシェル）。
- `.vscode/` — VS Code 推奨設定（拡張機能やフォーマッタのプリセット）。
- `dist/` — `vite build` の成果物。`dist/assets/` 内にハッシュ付きバンドルが出力されます。
- `docs/` — アーキテクチャや開発ガイドなどのメタドキュメント。
- `node_modules/` — npm / Bun が管理する外部依存パッケージ。基本的に自動生成。
- `src/` — フロントエンド（TypeScript + CSS）資産。
- `src-tauri/` — Rust + Tauri で実装したネイティブ層。

### フロントエンド (`src/`)

- `main.ts` — 現状のメインエントリ。差分表示・辞書・セッション管理など UI ロジックが集約。
- `styles.css` — Tailwind などに依存せず自前で整えたグローバルスタイル。
- `assets/` — ロゴやアイコン（vite.svg / tauri.svg など）。
- `features/` — 将来のモジュール分割を見据えたプレースホルダー階層。`dictionary/` や `diff/` など用途ごとの空ディレクトリが用意されています。
- `services/` — `parseBomFile` や `compareBoms` など、IPC を介して Rust 側と連携するサービス関数。
- `types/` — BOM 行、差分結果、辞書エントリなど TypeScript で共有する型定義。
- `utils/` — DOM ユーティリティ、フォーマット処理、ローカルストレージ操作などの共通関数群。

### バックエンド (`src-tauri/`)

- `Cargo.toml` / `Cargo.lock` — Rust 側の依存設定。
- `tauri.conf.json` — アプリ全体のメタ設定（バージョン 0.4.1、ビルドコマンドなど）。
- `capabilities/` — Webview ごとの権限宣言。`default.json` に印刷権限を追加済み。
- `gen/schemas/` — Tauri CLI が生成した各プラットフォーム向けスキーマ定義。
- `icons/` — macOS / Windows で使用するアイコンセット。
- `target/` — Rust コンパイルのビルド成果物（`debug/` `release/`）。自動生成されるため掃除可能。
- `src/` — Rust 実装の中核。
  - `main.rs` — Tauri エントリポイント。ウィンドウ生成やプラグイン初期化。
  - `lib.rs` — フロントエンドから呼び出す IPC コマンドの登録。
  - `models.rs` — BOM 行や差分構造体などデータモデル。
  - `parsers/` — CSV / Excel / CAD ネットリスト（ECO, MSF, CCF）を Rust で解析するモジュール。
  - `exporters/` — 差分結果やマージ結果を各フォーマットへ書き出すロジック。
  - `diff/` — 差分抽出（`compare.rs`）とマージ（`merge.rs`）。
  - `processors/` — 前処理ブロック（Reference 展開、テキストクリーニング等）。
  - `storage/` — セッション・辞書の永続化ハンドラ。
  - `utils/` — 列名検出などの補助ロジック。
  - `matchers/` — フロントエンドへのイベント連携（IPC ルーティングなど）。

### ドキュメント (`docs/`)

- `README.md` — ドキュメント群のインデックス。
- `ARCHITECTURE.md` — アーキテクチャと設計意図。
- `DEVELOPMENT.md` — セットアップ・コード規約・デバッグ手順。

※ より詳細なディレクトリコメントは `docs/DIRECTORY_COMMENTS.md` を参照してください。

---

## 📘 関連ドキュメント

- 開発ワークフロー: `docs/DEVELOPMENT.md`
- 設計背景・技術詳細: `docs/ARCHITECTURE.md`
- 変更履歴: `CHANGELOG.md`
- Capabilities 設定例: `src-tauri/capabilities/default.json`

---

## 🧪 テスト・検証

現在自動テストは未整備です。機能追加やバグ修正時は以下を目安に手動検証してください。

1. `npm run tauri dev` で UI の操作性をチェック（BOM 取り込み、差分計算、印刷）。
2. `cargo check --manifest-path src-tauri/Cargo.toml` でバックエンドの型検査。
3. 主要フォーマット（CSV / XLSX / ECO / CCF / MSF）の入出力をサンプルデータで確認。

テスト計画は `CHANGELOG.md` の「予定されている機能」に記載しています。

---

## 🧭 ナレッジベース

- Tauri: <https://tauri.app/>
- TypeScript: <https://www.typescriptlang.org/docs/>
- Rust: <https://doc.rust-lang.org/book/>
- Vite: <https://vitejs.dev/guide/>

---

## 🔮 今後の計画

- `apply_ipc_names` コマンドをフロント側に統合し、辞書で管理する IPC 登録名を BOM 編集・比較フローに自動適用できるようにする（検討中）

---

## 🤝 貢献について

Pull Request を作成する際は、以下を確認してください。

1. 変更内容を `CHANGELOG.md` の Unreleased セクションに追記。
2. Capabilities や設定ファイルを変更した場合は README / docs を更新。
3. 新規モジュールは `src/features/` など既存の階層ポリシーに沿って配置。

ライセンスは未設定のため、公開前に適切なライセンス選定を検討してください。

---

## 📤 リリースとデプロイ

1. バージョン番号を `package.json` / `tauri.conf.json` / アプリ UI で同期。
2. `bun run build` または `npm run build` でフロントエンドをビルド。
3. `npm run tauri build` でプラットフォーム別のバイナリを生成。
4. 生成物は `src-tauri/target/release/` 以下に配置されます。
5. Windows 版は GitHub Actions の `build-windows` ワークフロー（`.github/workflows/windows-build.yml`）を手動実行しても生成可能。Artifacts から MSI/EXE を取得できます。

リリースノートは `CHANGELOG.md` へ記録し、必要に応じて README の機能一覧を更新してください。

---

## 📝 参考: ディレクトリコメントの詳細

`docs/DIRECTORY_COMMENTS.md` に、全ディレクトリの役割と備考を網羅的に掲載しています。初めてコードベースを触る場合や、リファクタリング前の棚卸しに活用してください。
