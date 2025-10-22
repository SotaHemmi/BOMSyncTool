/**
 * BOM（部品表）関連の型定義
 */

export interface BomRow {
  ref: string;
  part_no: string;
  attributes?: Record<string, string>;
}

export interface ColumnMeta {
  id: string;
  name: string;
}

export interface ParseError {
  message: string;
  row?: number;
  column?: number;
  severity: 'error' | 'warning' | 'info';
}

export interface ParseResult {
  bom_data: BomRow[];
  rows?: string[][];
  guessed_columns?: Record<string, number>;
  guessed_roles?: Record<string, ColumnRole>;
  errors: string[];
  headers?: string[];
  columns?: ColumnMeta[];
  row_numbers?: number[];
  structured_errors?: ParseError[];
}

export type ColumnRole = 'ref' | 'part_no' | 'manufacturer' | 'ignore';
