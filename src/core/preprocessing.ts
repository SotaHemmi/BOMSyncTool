/**
 * 前処理パイプライン
 *
 * BOMデータの前処理（Reference展開、空欄補完等）を実行
 */

import type { ParseResult, FormatOptions } from '../types';
import {
  expandReference,
  splitReferenceRows,
  fillBlankCells,
  cleanseTextData,
  applyFormatRules
} from '../services';

/**
 * 前処理オプション
 */
export interface PreprocessOptions {
  /** Reference展開（C1-C5 → C1, C2, C3, C4, C5） */
  expandRef?: boolean;
  /** Reference分割（"C1,C2,C3" → 3行） */
  splitRef?: boolean;
  /** 空欄補完 */
  fillBlank?: boolean;
  /** テキストクレンジング */
  cleanse?: boolean;
  /** フォーマットルール適用 */
  formatRules?: boolean;
  /** フォーマットオプション */
  formatOptions?: FormatOptions;
}

/**
 * 前処理パイプラインを実行
 *
 * @param parseResult - 元のBOMデータ
 * @param options - 前処理オプション
 * @returns 前処理後のBOMデータ
 */
export async function applyPreprocessing(
  parseResult: ParseResult,
  options: PreprocessOptions
): Promise<ParseResult> {
  let result = parseResult;

  // Reference展開
  if (options.expandRef) {
    result = await expandReference(result);
  }

  // Reference分割
  if (options.splitRef) {
    result = await splitReferenceRows(result);
  }

  // 空欄補完
  if (options.fillBlank) {
    result = await fillBlankCells(result);
  }

  // テキストクレンジング
  if (options.cleanse) {
    result = await cleanseTextData(result);
  }

  // フォーマットルール適用
  if (options.formatRules) {
    const formatOpts: FormatOptions = options.formatOptions || {
      use_strikethrough: false,
      use_cell_color: true
    };
    result = await applyFormatRules(result, formatOpts);
  }

  return result;
}

/**
 * デフォルトの前処理オプション
 */
export const DEFAULT_PREPROCESS_OPTIONS: PreprocessOptions = {
  expandRef: false,
  splitRef: false,
  fillBlank: false,
  cleanse: false,
  formatRules: false,
  formatOptions: {
    use_strikethrough: false,
    use_cell_color: true
  }
};
