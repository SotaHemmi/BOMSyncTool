# ディレクトリ別コメント

プロジェクト内のディレクトリ構成と役割をまとめたリファレンスです。トップレベルから主要なサブディレクトリまでを網羅し、棚卸しやリファクタリング計画時の手掛かりとして利用できます。

| パス | 概要 | 備考 |
| --- | --- | --- |
| `/` | プロジェクトのルート。npm/Bun/Tauri 関連の設定ファイルが集約されています。 | `package.json`、`tsconfig.json`、`vite.config.ts` などの設定ファイルもここに配置。 |
| `.vscode/` | VS Code 用ワークスペース設定。推奨拡張やフォーマッタ設定を保持。 | 開発体験の統一を目的としたエディタプリセット。 |
| `dist/` | `vite build` で生成されるフロントエンドのビルド成果物。 | 本番ビルド済み HTML/JS/CSS を格納。 |
| `dist/assets/` | ビルド後にハッシュ付きで出力されたアセット。 | 自動生成。不要時は削除可。 |
| `docs/` | アーキテクチャ、開発ガイドなどメタドキュメント。 | `ARCHITECTURE.md`、`DEVELOPMENT.md`、`DIRECTORY_COMMENTS.md` を含む。 |
| `node_modules/` | npm/Bun 依存パッケージ。 | 自動生成。直接編集は非推奨。 |
| `src/` | フロントエンド (TypeScript + CSS) の実装。 | Vite がエントリとして参照。 |
| `src/assets/` | フロントエンドで利用するロゴ・アイコン。 | `vite.svg` などビルド時にコピーされる静的ファイル。 |
| `src/features/` | 検討中のモジュール分割先。現時点では空ディレクトリ群。 | 将来的に `main.ts` から機能を切り出す予定。 |
| `src/features/dictionary/` | 辞書 UI ロジックのモジュール化予定地。 | 未実装プレースホルダー。 |
| `src/features/diff/` | 差分表示機能のモジュール化予定地。 | 未実装プレースホルダー。 |
| `src/features/edit/` | 編集モーダル関連のモジュール化予定地。 | 未実装プレースホルダー。 |
| `src/features/preprocess/` | 前処理パイプライン関連のモジュール化予定地。 | 未実装プレースホルダー。 |
| `src/features/preview/` | プレビュー生成ロジックのモジュール化予定地。 | 未実装プレースホルダー。 |
| `src/features/project/` | プロジェクト/タブ管理のモジュール化予定地。 | 未実装プレースホルダー。 |
| `src/main.ts` | フロントエンドのエントリポイント。全機能のイベント配線と状態管理を担当。 | 3500 行超の大規模ファイル。分割が課題。 |
| `src/services/` | フロントエンドのサービス層。バックエンド IPC 呼び出しをカプセル化。 | `bom.ts`、`diff.ts` など機能別に実装。 |
| `src/types/` | TypeScript の型定義。BOM 行、差分行、辞書エントリなどを定義。 | `index.ts` から再エクスポート。 |
| `src/utils/` | 共通ユーティリティ関数。DOM 操作、フォーマット、ストレージ操作など。 | `dom.ts` や `storage.ts` など。 |
| `src-tauri/` | Rust + Tauri で実装したバックエンド層。 | Tauri 設定とネイティブロジック一式。 |
| `src-tauri/capabilities/` | Webview Capabilities。ネイティブ API の権限を宣言。 | `default.json` に `core:webview:allow-print` を追加済み。 |
| `src-tauri/gen/` | Tauri CLI が生成したスキーマや補助ファイル。 | 通常は自動生成のため手動編集不要。 |
| `src-tauri/gen/schemas/` | 各プラットフォーム向け設定スキーマ。 | `desktop-schema.json` など。 |
| `src-tauri/icons/` | アプリケーションアイコン。 | macOS / Windows 用に複数サイズを保持。 |
| `src-tauri/target/` | Rust のビルド成果物。 | `debug/` と `release/` が生成される。クリーン時には削除対象。 |
| `src-tauri/target/debug/` | デバッグビルド出力。 | `cargo tauri dev` 実行時に更新。 |
| `src-tauri/target/release/` | リリースビルド出力。 | `npm run tauri build` 実行時に更新。 |
| `src-tauri/src/` | Rust バックエンド実装のソース。 | モジュールごとにディレクトリ分割。 |
| `src-tauri/src/diff/` | BOM 差分検出・マージロジック。 | `compare.rs` と `merge.rs` を含む。 |
| `src-tauri/src/exporters/` | ファイル書き出しロジック。 | CSV や CAD ネットリストのエクスポート。 |
| `src-tauri/src/lib.rs` | IPC エンドポイントの登録。 | フロントエンドからのコマンドをハンドリング。 |
| `src-tauri/src/main.rs` | Tauri アプリのエントリー。ウィンドウ生成・プラグインロード。 | `async` main で起動。 |
| `src-tauri/src/matchers/` | IPC やデータマッチングの補助モジュール。 | `helpers.rs`、`ipc.rs` など。 |
| `src-tauri/src/models.rs` | データモデル定義。BOM 行や差分行など。 | Serde によるシリアライズ対応。 |
| `src-tauri/src/parsers/` | 入力ファイル解析ロジック。 | CSV / Excel / CAD フォーマットを網羅。 |
| `src-tauri/src/processors/` | 前処理ステップの実装。 | Reference 展開、テキストクリーニング等。 |
| `src-tauri/src/storage/` | セッション・辞書などの永続化処理。 | ファイル IO をラップ。 |
| `src-tauri/src/utils/` | 補助ユーティリティ。 | 列推定ロジックなど。 |
| `dist/index.html` | ビルド後のエントリ HTML。 | `vite` により最適化済み。 |
| `src-tauri/tauri.conf.json` | Tauri 全体設定。ウィンドウ構成やビルドコマンドを定義。 | バージョンやバンドル設定もここで管理。 |

> **メモ**: `node_modules/` 配下や `src-tauri/target/` 配下はビルドやパッケージマネージャーが生成するため、必要に応じてクリーンアップして再生成できます。

