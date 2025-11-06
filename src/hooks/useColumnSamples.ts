import { useMemo } from 'react';
import type { ColumnMeta, ParseResult } from '../types';
import { buildColumnIndexMap } from '../utils';

/**
 * 指定した列からサンプル値（最初の3件の非空文字）を抽出して返す
 */
export function useColumnSamples(
  columns: ColumnMeta[],
  parseResult: ParseResult | null
): Map<string, string> {
  return useMemo(() => {
    if (!parseResult || columns.length === 0 || parseResult.rows.length === 0) {
      return new Map<string, string>();
    }

    const samples = new Map<string, string>();
    const columnIndexMap = buildColumnIndexMap(columns, parseResult);

    columns.forEach(column => {
      const columnIndex = columnIndexMap.get(column.id);
      if (columnIndex === undefined) {
        return;
      }

      const values: string[] = [];
      for (const row of parseResult.rows) {
        const rawValue = row[columnIndex];
        if (rawValue == null) {
          continue;
        }

        const trimmed = String(rawValue).trim();
        if (!trimmed) {
          continue;
        }

        values.push(trimmed);
        if (values.length >= 3) {
          break;
        }
      }

      if (values.length > 0) {
        samples.set(column.id, values.join(', '));
      }
    });

    return samples;
  }, [columns, parseResult]);
}
