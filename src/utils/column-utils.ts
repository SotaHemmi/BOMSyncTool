import type { ColumnMeta, ParseResult } from '../types';
import { getColumnIndexById } from './bom';

/**
 * ColumnMeta配列から列IDとインデックスの対応表を構築
 */
export function buildColumnIndexMap(columns: ColumnMeta[], parseResult: ParseResult): Map<string, number> {
  const map = new Map<string, number>();

  columns.forEach((column, fallbackIndex) => {
    const resolvedIndex = getColumnIndexById(parseResult, column.id);
    map.set(column.id, resolvedIndex >= 0 ? resolvedIndex : fallbackIndex);
  });

  return map;
}
