# 開発ガイド

このドキュメントは、BOMSyncToolの開発を行う際のガイドラインとベストプラクティスを提供します。

## 🎯 開発哲学

1. **シンプルさ優先**: 複雑な抽象化より、わかりやすいコードを優先
2. **段階的な改善**: 完璧を目指すより、動くものを早く作る
3. **ドキュメント重視**: コードだけでなく、意図を記録する

## 🛠️ 開発環境のセットアップ

### 必要なツール

- Node.js 18 以上
- Bun 1.x （`tauri.conf.json` の `beforeBuildCommand` で利用）
- Rust 1.70 以上
- Tauri CLI (`cargo install tauri-cli`)
- 推奨: Rust Analyzer（VSCode拡張）

```bash
# Node.js
node --version

# Bun
bun --version
# 未インストールの場合 (PowerShell)
# irm https://bun.sh/install.ps1 | iex

# Rust
rustc --version

# Tauri CLI
cargo install tauri-cli

# VSCode Rust Analyzer 拡張 (任意)
code --install-extension rust-lang.rust-analyzer
```

### 初回セットアップ

```bash
# リポジトリをクローン
git clone <repository-url>
cd BOMSyncTool

# 依存関係のインストール
npm install

# Rustの依存関係をビルド（初回のみ時間がかかります）
cd src-tauri
cargo build
cd ..

# 開発サーバーを起動
npm run tauri dev
```

### Tauri 権限（Capabilities）

Tauri 2では Webview 側から利用するネイティブ API ごとに権限を宣言する必要があります。`src-tauri/capabilities/default.json` の `permissions` に `core:webview:allow-print` を追加済みで、main ウィンドウから `window.print()` を呼び出せるように設定しています。ウィンドウや機能を増やす際は、必要な権限が capability に含まれているか確認してください。

### Windows ビルドの自動化（GitHub Actions）

ローカルに Windows 環境が無い場合でも、GitHub Actions の Windows ランナーでインストーラを生成できます。`workflow_dispatch` で手動起動できるワークフローを `.github/workflows/windows-build.yml` に追加済みです。

実行手順:

1. GitHub 上で `Actions` タブを開く
2. `build-windows` ワークフローを選択
3. 「Run workflow」を押す（ブランチ指定が必要なら選択）
4. 実行完了後、Artifacts から `bomsynctool-windows` をダウンロード（MSI / NSIS などの成果物を含む）

継続的にリリースへ組み込みたい場合は、`on.push.tags` などのトリガーを追加して運用してください。証明書で署名する場合は、`secrets` に証明書情報を登録し、ワークフローへ署名ステップを追記すると便利です。npm の optional dependency バグを避けるため、CI では Bun で依存を解決した後に Rust 製の `cargo tauri` CLI を用いてビルドしています（`cargo install --locked tauri-cli` → `cargo tauri build --bundles windows`）。

> **補足**: npm には Tauri CLI のネイティブバイナリを optional dependency として解決できない既知の不具合（npm/cli#4828）があるため、CI では Node 製 CLI を介さず `cargo tauri` を実行しています。ローカルで npm 経由のビルドが失敗する場合は、`cargo install --locked tauri-cli` で Rust CLI を導入し `cargo tauri build` を使用するか、`npm install @tauri-apps/cli-win32-x64-msvc --no-save` を併用してください。

## 📁 プロジェクト構造の理解

### フロントエンド（`src/`）

```
src/
├── main.ts              # ⚠️ 3,543行 - 要分割
│   ├── 型定義 (lines 8-83)
│   ├── グローバル状態 (lines 85-126)
│   ├── ユーティリティ関数 (lines 145-303)
│   ├── UI更新関数 (lines 305-549)
│   ├── 差分表示 (lines 570-656)
│   ├── 編集モーダル (lines 657-851)
│   ├── ファイル読み込み (lines 856-1112)
│   ├── 前処理 (lines 1161-1434)
│   ├── プロジェクト管理 (lines 1435-1898)
│   ├── 設定・辞書 (lines 1984-2570)
│   ├── 差分比較・マージ (lines 2638-2832)
│   ├── エクスポート (lines 2870-3170)
│   ├── イベント登録 (lines 3089-3127)
│   └── 初期化 (lines 3511-3544)
├── styles.css           # 1,710行のスタイルシート
└── assets/              # 画像・アイコン等
```

### バックエンド（`src-tauri/src/`）

```
src-tauri/src/
├── main.rs              # Tauriアプリのエントリーポイント
├── lib.rs               # IPCコマンドの定義
├── models.rs            # データモデル（BomRow, ParseResult等）
├── parsers/             # ファイル解析
│   ├── mod.rs
│   ├── csv.rs          # CSV解析
│   ├── excel.rs        # Excel解析
│   ├── cad.rs          # CADネットリスト解析
│   └── builder.rs      # パーサービルダー
├── exporters/           # ファイル出力
│   ├── mod.rs
│   ├── csv.rs          # CSV出力
│   └── cad.rs          # CADネットリスト出力
├── diff/                # BOM比較
│   ├── mod.rs
│   ├── compare.rs      # 差分検出
│   └── merge.rs        # マージ処理
├── processors/          # データ処理
│   ├── mod.rs
│   ├── reference.rs    # Reference展開・分割
│   ├── cleaner.rs      # テキストクリーニング
│   ├── formatter.rs    # 書式整形
│   └── validator.rs    # バリデーション
├── utils/               # ユーティリティ
│   ├── mod.rs
│   ├── header.rs       # ヘッダー自動検出
│   └── text.rs         # テキスト処理
└── storage/             # データ永続化
    ├── mod.rs
    ├── session.rs      # セッション管理
    └── dictionary.rs   # 辞書管理
```

## 🔧 開発ワークフロー

### 1. 新機能の追加

```bash
# 1. ブランチを作成（Gitセットアップ後）
git checkout -b feature/new-feature

# 2. コードを編集

# 3. TypeScriptのビルドチェック
npm run build

# 4. Rustのコンパイルチェック
cargo check --manifest-path src-tauri/Cargo.toml

# 5. 動作確認
npm run tauri dev

# 6. コミット（Gitセットアップ後）
git add .
git commit -m "feat: 新機能の追加"
```

### 2. バグ修正

```bash
# 1. 問題の特定
# - ブラウザのDevToolsでエラーを確認
# - Rustのログを確認

# 2. 修正

# 3. テスト

# 4. コミット
git commit -m "fix: バグの修正"
```

## 📝 コーディング規約

### TypeScript

#### 命名規則

```typescript
// ✅ Good
const datasetState: DatasetState = { ... };
function updatePreviewCard(dataset: DatasetKey) { ... }
interface BomRow { ... }
type DatasetKey = 'a' | 'b';

// ❌ Bad
const ds = { ... };  // 不明瞭な略語
function upd(d) { ... }  // 型定義なし
```

#### 関数の書き方

```typescript
// ✅ Good: 明確な責務、適切な長さ
function renderRegistrationTable() {
  const tbody = document.getElementById('registration-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';
  // ... テーブル描画ロジック
}

// ✅ Good: 非同期処理は async/await
async function loadBomFile(dataset: DatasetKey, path: string, fileName: string) {
  try {
    setProcessing(true, 'ファイルを読み込み中...');
    const result = await invoke<ParseResult>('parse_bom_file', { path });
    // ... 処理
  } catch (error) {
    // エラーハンドリング
  } finally {
    setProcessing(false);
  }
}

// ❌ Bad: 長すぎる関数（100行以上）
function doEverything() {
  // ... 500行のコード
}
```

#### エラーハンドリング

```typescript
// ✅ Good
try {
  const result = await invoke<ParseResult>('parse_bom_file', { path });
  // 成功時の処理
} catch (error: unknown) {
  console.error('Failed to parse BOM', error);
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: string }).message)
      : JSON.stringify(error);
  alert(`BOMの読み込みに失敗しました: ${message}`);
}

// ❌ Bad: エラーを無視
try {
  await invoke('parse_bom_file', { path });
} catch {}
```

### Rust

#### 命名規則

```rust
// ✅ Good
pub struct BomRow {
    pub ref_: String,
    pub part_no: String,
}

pub fn parse_bom_file(path: &str) -> Result<ParseResult, AppError> {
    // ...
}

// ❌ Bad
pub struct bomrow { /* ... */ }
pub fn pbf(p: &str) -> Result<...> { /* ... */ }
```

#### エラーハンドリング

```rust
// ✅ Good: Result型を使用
pub fn parse_csv(path: &Path) -> Result<ParseResult, AppError> {
    let file = File::open(path)
        .map_err(|e| AppError::IoError(e.to_string()))?;

    // ... 処理

    Ok(ParseResult { ... })
}

// ✅ Good: Tauriコマンドでのエラー返却
#[tauri::command]
pub fn parse_bom_file(path: String) -> Result<ParseResult, String> {
    match do_parse(&path) {
        Ok(result) => Ok(result),
        Err(e) => Err(format!("解析エラー: {}", e))
    }
}
```

#### パフォーマンス

```rust
// ✅ Good: 不要なクローンを避ける
pub fn process_rows(rows: &[BomRow]) -> Vec<BomRow> {
    rows.iter()
        .filter(|row| !row.ref_.is_empty())
        .cloned()
        .collect()
}

// ❌ Bad: 過剰なクローン
pub fn process_rows(rows: Vec<BomRow>) -> Vec<BomRow> {
    let cloned = rows.clone();
    let cloned2 = cloned.clone();
    // ...
}
```

## 🧪 テスト（今後追加予定）

### TypeScript

```typescript
// 今後追加予定: Jest or Vitest
describe('groupByPartNo', () => {
  it('should group rows by part number', () => {
    const rows = [
      { ref: 'C1', part_no: '0603B104K', value: '100nF', comment: '' },
      { ref: 'C2', part_no: '0603B104K', value: '100nF', comment: '' },
    ];

    const grouped = groupByPartNo(rows);
    expect(grouped.get('0603B104K')).toEqual(['C1', 'C2']);
  });
});
```

### Rust

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_csv() {
        let result = parse_csv(Path::new("test.csv"));
        assert!(result.is_ok());
        let parse_result = result.unwrap();
        assert_eq!(parse_result.bom_data.len(), 10);
    }
}
```

## 🐛 デバッグ

### フロントエンド

```typescript
// コンソールログ
console.log('datasetState:', datasetState);

// ブレークポイント（Chrome DevTools）
debugger;

// エラートラップ
window.addEventListener('error', (e) => {
  console.error('Global error:', e);
});
```

### バックエンド

```rust
// Rustのログ
println!("Debug: rows.len() = {}", rows.len());

// デバッグビルドで実行
cargo run --manifest-path src-tauri/Cargo.toml

// ログレベルを設定
env RUST_LOG=debug npm run tauri dev
```

## 📦 ビルド

### 開発ビルド

```bash
# フロントエンドのみ
npm run build

# Rustのみ
cargo build --manifest-path src-tauri/Cargo.toml

# 全体（デバッグ）
npm run tauri build --debug
```

### リリースビルド

```bash
# プロダクションビルド
npm run tauri build

# 生成物の確認
ls -lh src-tauri/target/release/bundle/
```

## 🚀 リリース手順（GitHub使用時）

```bash
# 1. バージョンアップ
# package.json, src-tauri/Cargo.toml, src-tauri/tauri.conf.json のバージョンを更新

# 2. CHANGELOGを更新
# CHANGELOG.md に変更内容を記載

# 3. コミット
git add .
git commit -m "chore: release v0.4.2"
git tag v0.4.2

# 4. プッシュ
git push origin main --tags

# 5. GitHub Releasesでリリースノートを作成

# 6. ビルド済みバイナリをアップロード
npm run tauri build
# dist/ または src-tauri/target/release/bundle/ からバイナリをアップロード
```

## 🔍 よくある問題

### 問題: TypeScriptのビルドが遅い

```bash
# キャッシュをクリア
rm -rf node_modules/.vite
npm run build
```

### 問題: Rustのコンパイルエラー

```bash
# 依存関係を再ビルド
cd src-tauri
cargo clean
cargo build
```

### 問題: Tauriアプリが起動しない

```bash
# ログを確認
npm run tauri dev 2>&1 | tee tauri.log

# Rustのログレベルを上げる
RUST_LOG=trace npm run tauri dev
```

### 問題: localStorageがいっぱい

```javascript
// ブラウザのDevToolsで実行
localStorage.clear();
location.reload();
```

## 📚 学習リソース

### TypeScript
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [TypeScript Deep Dive](https://basarat.gitbook.io/typescript/)

### Rust
- [The Rust Book](https://doc.rust-lang.org/book/)
- [Rust by Example](https://doc.rust-lang.org/rust-by-example/)

### Tauri
- [Tauri Documentation](https://tauri.app/v1/guides/)
- [Tauri API Reference](https://tauri.app/v1/api/js/)

## 🤝 貢献の流れ（将来的に）

1. Issueを作成して問題を報告
2. ブランチを作成 (`feature/xxx`, `fix/xxx`)
3. コードを書く
4. Pull Requestを作成
5. レビュー・マージ

## 📞 質問・サポート

- **Issues**: GitHub Issues
- **ドキュメント**: `docs/` ディレクトリ
- **コード例**: 既存のコードを参照

---

**最終更新**: 2025年10月21日
