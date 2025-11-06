# BOMSyncTool

![Version](https://img.shields.io/badge/version-1.0.1-blue)
![License](https://img.shields.io/badge/license-未設定-lightgrey)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)

電子部品表（BOM）の差分比較とマージ、クリーニングをデスクトップで完結できる Tauri 製アプリです。React + TypeScript で構築した UI と Rust 実装のネイティブ機能を組み合わせ、多様な CAD / CSV フォーマットに対応します。

## できること

- BOM A/B を読み込み、追加・削除・変更・一致をハイライト表示
- 差分結果からマージ済み BOM を生成し CSV / XLSX / ECO / CCF / MSF で出力
- 辞書登録・例外設定を使って社内表記へ一括置換（CSV 入出力対応）
- Reference 展開や空欄補完など前処理ブロックをワークフローで適用
- 比較モードに合わせてフィルタや列表示を切り替え、必要な情報だけを確認
- プロジェクトタブとお気に入りで複数案件を並行管理、差分結果を印刷可能

## 対応環境

- Node.js 18+
- Rust 1.70+ / Tauri CLI 2.x
- macOS / Windows / Linux（ネイティブバイナリは `npm run tauri build` で生成）
- Bun 1.x はビルド高速化用にサポート（必須ではありません）

## セットアップ

```bash
npm install        # 依存関係を取得
npm run tauri dev  # 開発モード起動
npm run tauri build # 配布用バイナリを生成
```

印刷やファイルダイアログなどのネイティブ権限は `src-tauri/capabilities/` の設定で管理しています。新しいウィンドウや機能を追加したら対応する capability も更新してください。

## 使い方の流れ

1. BOM A/B をドロップし、列役割（Ref / Part_No / Manufacturer / Ignore）を確認
2. 必要に応じて前処理や辞書適用を実行し、比較ボタンで差分を確認
3. 結果をフィルタリングして印刷、または CSV / CAD ネットリストとしてエクスポート

## フォルダ構成

- `src/` ― React SPA。`components/`（UI）、`containers/`（画面）、`hooks/`（状態管理）、`ui/`（DOM 操作）、`state/`（グローバルストア）、`services/`（IPC 呼び出し）など
- `src-tauri/` ― Rust + Tauri。`src/` に IPC コマンド、`parsers/`・`exporters/`・`diff/` で BOM 処理を担当
- `docs/` ― ドキュメント群（アーキテクチャ、開発ガイド、ユーザーガイド）
- `templates/` ― エクスポートおよび帳票テンプレート
- `dist/` ― Vite ビルド成果物
- `CHANGELOG.md` ― Keep a Changelog 形式の履歴

## ドキュメント

- `docs/USER_GUIDE.md` ― 操作マニュアル
- `docs/ARCHITECTURE.md` ― 技術構成と設計方針
- `docs/DEVELOPMENT.md` ― 開発環境とコーディング規約
- `CHANGELOG.md` ― バージョン履歴

ライセンスは未設定です。公開前に適切なライセンスを選定してください。
