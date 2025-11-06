import type { ColumnMeta, ParseResult } from '../types';

export function deriveColumns(parseResult: ParseResult): ColumnMeta[] {
  if (parseResult.columns && parseResult.columns.length > 0) {
    return parseResult.columns;
  }

  const headerCount = parseResult.headers?.length ?? parseResult.rows[0]?.length ?? 0;
  const columnOrder = parseResult.column_order ?? [];

  if (columnOrder.length === headerCount && headerCount > 0) {
    return columnOrder.map((id, index) => ({
      id,
      name: parseResult.headers?.[index] ?? id
    }));
  }

  return Array.from({ length: headerCount }, (_, index) => ({
    id: columnOrder[index] ?? `col-${index}`,
    name: parseResult.headers?.[index] ?? columnOrder[index] ?? `Column ${index + 1}`
  }));
}
