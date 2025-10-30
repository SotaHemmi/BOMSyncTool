/**
 * BOM差分比較関連の型定義
 */

/**
 * 差分行情報
 *
 * 重要な変更点：
 * - BomRowオブジェクトではなく、行インデックスを保持
 * - メモリ使用量を削減（データの重複を避ける）
 * - 実際のデータはParseResultから行インデックスで取得
 */
export interface DiffRow {
  /** 差分ステータス: "added", "deleted", "changed", "unchanged" */
  status: string;

  /** BOM Aの行インデックス（削除または変更の場合に設定） */
  a_index: number | null;

  /** BOM Bの行インデックス（追加または変更の場合に設定） */
  b_index: number | null;

  /** Reference値（比較キー） */
  ref_value: string;

  /** 変更された列のリスト */
  changed_columns: string[];
}
