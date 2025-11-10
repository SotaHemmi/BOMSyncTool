# BOMSyncTool - 今後の課題

このドキュメントは、将来的な改善や修正が必要な項目をまとめています。

## 優先度：高

### 1. 処理中フラグの二重管理問題

**問題点**:
現在、処理中状態を管理するための2つの異なるメカニズムが併用されています：

1. **グローバルUIオーバーレイ** (`src/utils/dom.ts: setProcessing`)
   - DOM要素を直接操作して画面全体にオーバーレイを表示
   - カスタムメッセージを表示可能（例: "BOM Aをエクスポート中..."）
   - 使用箇所: エクスポート処理、辞書操作

2. **React状態管理** (`src/hooks/useComparison.ts: setIsProcessing`)
   - Reactのステート管理でコンポーネント間で処理状態を共有
   - UIボタンの`disabled`プロパティを制御
   - 使用箇所: 比較処理、置き換え処理、エクスポート処理

**現在の動作**:
- エクスポート処理では両方が同時に設定されるため、機能的には問題なく動作
- しかし、責任範囲が曖昧で、メンテナンス性に課題あり
- 新しいエクスポート形式を追加する際に両方を意識する必要がある

**影響箇所**:
- `src/core/export-handler.ts`: 全エクスポート関数でグローバル`setProcessing`を使用
- `src/hooks/useExportManager.ts`: `runExport`でReact`setIsProcessing`を使用
- `src/hooks/useDatasetHandlers.ts`: `applyDefaultPreprocess`のみ`setIsProcessing`を使用、`loadFile`では未使用
- `src/hooks/useComparison.ts`: `handleLoadFile`で`loadingDatasets`を使用

**提案される解決策**:

**Option A: 現状維持（推奨）**
- 両者を独立した機能として扱う
- グローバル`setProcessing`: 詳細な進捗メッセージ表示専用
- React`setIsProcessing`: UI要素の無効化専用
- ドキュメント化して開発者に周知

**Option B: 統一化**
- グローバル`setProcessing`を廃止
- Reactコンポーネントで処理状態とメッセージを管理
- より予測可能な状態管理
- ただし、大規模リファクタリングが必要

**関連ファイル**:
- `src/utils/dom.ts`: グローバル処理フラグの実装
- `src/hooks/useComparison.ts`: React状態管理の実装
- `src/hooks/useExportManager.ts`: エクスポート時の処理フラグ
- `src/hooks/useDatasetHandlers.ts`: データセット操作の処理フラグ
- `src/core/export-handler.ts`: 全エクスポート関数の実装

### 2. `useDatasetHandlers`の最適化

**問題点**:
- `exportSource`変数が毎レンダリングごとに再計算されている（メモ化されていない）

**提案される修正**:
```typescript
// 現在
const exportSource = dataset === 'a' ? 'bom_a' : 'bom_b';

// 修正後
const exportSource = useMemo(
  () => (dataset === 'a' ? 'bom_a' : 'bom_b') as ExportSource,
  [dataset]
);
```

**影響**:
- パフォーマンスへの影響は軽微だが、ベストプラクティスに従うべき

**関連ファイル**:
- `src/hooks/useDatasetHandlers.ts`

## 優先度：中

### 3. エクスポート処理の一貫性

**問題点**:
- `loadFile`では`setIsProcessing`を使用していないが、`loadingDatasets`で管理している
- この設計が意図的なものか、一貫性を保つべきか要検討

**提案**:
- `loadingDatasets`で十分に管理できているため、追加の`setIsProcessing`は不要の可能性が高い
- ただし、設計方針として明文化すべき

**関連ファイル**:
- `src/hooks/useComparison.ts`: `loadingDatasets`の管理
- `src/hooks/useDatasetHandlers.ts`: `loadFile`の実装

### 4. エラーハンドリングの統一

**問題点**:
- `useDatasetHandlers`で`handleError`関数を提供しているが、実際には各export関数が独自の`alert`を使用
- エラー表示の方法に一貫性が欠けている

**提案**:
- エラーハンドリング戦略を統一
- または、現在の実装でも問題ないため、ドキュメント化のみ

**関連ファイル**:
- `src/hooks/useDatasetHandlers.ts`: `handleError`の定義
- `src/core/export-handler.ts`: 各エクスポート関数のエラー処理

## 優先度：低

### 5. 自動保存のコメントアウト

**問題点**:
- `setColumnRole`と`applyDefaultPreprocess`で`onSave()`がコメントアウトされている
- 意図的な設計だが、理由がコード内に明記されていない

**現在の状態**:
```typescript
// 列の役割変更時は自動保存しない（ユーザーが明示的に保存するまで待つ）
// onSave();
```

**提案**:
- コメントで理由が説明されているため、現状維持で問題なし
- ただし、ユーザーエクスペリエンスの観点から、将来的に再検討の余地あり

**関連ファイル**:
- `src/hooks/useDatasetHandlers.ts`

### 6. TypeScript型の強化

**問題点**:
- 一部の箇所で型推論に頼っている部分がある
- より厳格な型定義を追加することで、バグを未然に防げる可能性

**提案**:
- `ExportSource`型を明示的に指定する箇所を増やす
- 型ガード関数を追加して、ランタイムでの型チェックを強化

## テスト

### 単体テスト

現在、単体テストが実装されていません。以下のモジュールを優先的にテストすべき：

1. `src/core/export-handler.ts`: エクスポート処理のロジック
2. `src/hooks/useComparison.ts`: 比較・置換ロジック
3. `src/hooks/useDictionary.ts`: 辞書適用ロジック
4. `src/utils/debounce.ts`: デバウンス処理

### E2Eテスト

ユーザーの主要なワークフローをカバーするE2Eテストの追加：

1. ファイル読み込み → 比較 → エクスポート
2. 辞書適用 → 前処理 → 比較
3. プロジェクト作成 → 保存 → 読み込み

## パフォーマンス

### 仮想スクロールの拡張

`EditableTable`に仮想スクロールが実装されているが、他のテーブルコンポーネントにも適用を検討：

- `CompareResults`コンポーネント
- `DictionaryTab`の登録名リスト・例外リスト

### 大規模データの処理

数万行のBOMファイルを扱う場合のパフォーマンス改善：

- Web Workerを使用した非同期処理
- 段階的なデータ読み込み（ページネーション）

## アクセシビリティ

### キーボード操作

マウスを使わずにキーボードだけで操作できるようにする：

- タブキーでのフォーカス移動
- ショートカットキーの実装（Ctrl+O: ファイルを開く、Ctrl+S: 保存など）

### スクリーンリーダー対応

視覚障害者向けの対応：

- ARIA属性の追加
- フォーカス管理の改善

## ドキュメント

### 開発者向けドキュメントの拡充

- コーディング規約の明文化
- アーキテクチャ決定記録（ADR）の作成
- 新機能追加時のガイドライン

### ユーザー向けドキュメント

- チュートリアルビデオの作成
- FAQセクションの拡充
- トラブルシューティングガイドの強化

## まとめ

上記の課題の多くは、現時点では機能的に問題を引き起こしていませんが、将来的な保守性や拡張性を考慮すると改善の余地があります。優先度の高い項目から順次対応していくことを推奨します。
