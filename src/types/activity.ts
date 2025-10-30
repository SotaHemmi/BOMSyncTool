/**
 * アクティビティログ関連の型定義
 */

export interface ActivityLogEntry {
  id: string;
  message: string;
  /**
   * ISO 8601形式のタイムスタンプ
   */
  timestamp: string;
}

