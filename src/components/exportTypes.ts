import type { ExportSource } from '../core/export-handler';

export interface ExportFormatHandlers {
  csv?: () => void;
  eco?: () => void;
  ccf?: () => void;
  msf?: () => void;
}

/**
 * エクスポートグループ設定
 *
 * @example
 * ```tsx
 * const exportGroups: ExportGroupConfig[] = [
 *   // 常に表示（BOM A, BOM B）
 *   {
 *     source: 'bom_a',
 *     label: 'BOM A をエクスポート',
 *     handlers: { csv: handleCsvExportA, eco: handleEcoExportA },
 *     visible: true
 *   },
 *   {
 *     source: 'bom_b',
 *     label: 'BOM B をエクスポート',
 *     handlers: { csv: handleCsvExportB, eco: handleEcoExportB },
 *     visible: true
 *   },
 *   // 比較実行後のみ表示
 *   {
 *     source: 'comparison',
 *     label: '比較結果をエクスポート',
 *     handlers: { csv: handleCsvComparison },
 *     visible: hasComparisonResult
 *   },
 *   // 置き換え実行後のみ表示
 *   {
 *     source: 'replacement',
 *     label: '置き換え結果をエクスポート',
 *     handlers: { csv: handleCsvReplacement },
 *     visible: hasReplacementResult
 *   }
 * ];
 * ```
 */
export interface ExportGroupConfig {
  source: ExportSource;
  label: string;
  handlers: ExportFormatHandlers;
  /**
   * 表示条件: true の場合のみ表示
   * 未定義の場合は常に表示（後方互換性）
   */
  visible?: boolean;
}
