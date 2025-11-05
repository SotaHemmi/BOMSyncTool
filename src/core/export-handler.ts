/**
 * エクスポート処理
 *
 * CSVおよびCAD形式へのエクスポートを、データソースごとに明示して実行する。
 */

import { save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import type { ColumnMeta, DiffRow, ParseResult } from '../types';
import { datasetState } from '../state/app-state';
import { saveSessionToFile } from '../services';
import { setProcessing, logActivity } from '../utils';

export type ExportSource = 'comparison' | 'replacement' | 'bom_a' | 'bom_b';

/**
 * エクスポートコンテキスト（比較/置き換え結果データ）
 */
export interface ExportContext {
  currentDiffs: DiffRow[];
  mergedBom: ParseResult | null;
}

const SOURCE_LABEL: Record<ExportSource, string> = {
  comparison: '比較結果',
  replacement: '置き換え結果',
  bom_a: 'BOM A',
  bom_b: 'BOM B'
};

interface ParseStructure {
  columnOrder: string[];
  headers: string[];
  columns: ColumnMeta[];
}

function cloneColumnRoles(source: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(source ?? {}).map(([role, ids]) => [role, [...ids]]));
}

function ensureStructure(parse: ParseResult): ParseStructure {
  const columnOrder =
    parse.column_order && parse.column_order.length > 0
      ? [...parse.column_order]
      : parse.columns && parse.columns.length > 0
        ? parse.columns.map(column => column.id)
        : parse.headers && parse.headers.length > 0
          ? parse.headers.map((_, index) => parse.column_order?.[index] ?? `col-${index}`)
          : parse.rows[0]?.map((_, index) => `col-${index}`) ?? [];

  const columns = columnOrder.map((id, index) => {
    const existing =
      parse.columns && parse.columns.length > 0
        ? parse.columns.find(column => column.id === id)
        : undefined;
    if (existing) {
      return { ...existing };
    }
    const headerName =
      parse.headers && parse.headers[index] !== undefined
        ? parse.headers[index]!
        : `Column ${index + 1}`;
    return { id, name: headerName };
  });

  const headers =
    parse.headers && parse.headers.length === columnOrder.length
      ? [...parse.headers]
      : columns.map(column => column.name);

  return { columnOrder, headers, columns };
}

function cloneParseResult(parse: ParseResult): ParseResult {
  const structure = ensureStructure(parse);
  const rowNumbers =
    parse.row_numbers && parse.row_numbers.length === parse.rows.length
      ? [...parse.row_numbers]
      : structure.columnOrder.length === 0
        ? []
        : parse.rows.map((_, index) => index + 1);

  return {
    rows: parse.rows.map(row =>
      structure.columnOrder.map((_, index) => row[index] ?? '')
    ),
    column_roles: cloneColumnRoles(parse.column_roles ?? {}),
    column_order: [...structure.columnOrder],
    guessed_columns: parse.guessed_columns ? { ...parse.guessed_columns } : undefined,
    guessed_roles: parse.guessed_roles ? { ...parse.guessed_roles } : undefined,
    errors: [...(parse.errors ?? [])],
    headers: [...structure.headers],
    columns: structure.columns.map(column => ({ ...column })),
    row_numbers: rowNumbers.length > 0 ? rowNumbers : parse.rows.map((_, index) => index + 1),
    structured_errors: parse.structured_errors
      ? parse.structured_errors.map(error => ({ ...error }))
      : []
  };
}

function mapRowToOrder(
  sourceStructure: ParseStructure,
  row: string[],
  targetOrder: string[]
): string[] {
  const valueMap = new Map<string, string>();
  sourceStructure.columnOrder.forEach((columnId, index) => {
    valueMap.set(columnId, row[index] ?? '');
  });
  return targetOrder.map(columnId => valueMap.get(columnId) ?? '');
}

function labelDiffStatus(status: string | null | undefined): string {
  if (!status) return '不明';
  if (status === '追加' || status === '削除' || status === '変更') {
    return status;
  }
  const normalized = status.toLowerCase();
  if (normalized === 'added') return '追加';
  if (normalized === 'removed' || normalized === 'delete' || normalized === 'deleted') return '削除';
  if (normalized === 'modified' || normalized === 'change' || normalized === 'changed') return '変更';
  return status;
}

function buildComparisonParseResult(diffs: DiffRow[]): ParseResult | null {
  if (!diffs || diffs.length === 0) {
    return null;
  }

  const parseA = datasetState.a.parseResult ? cloneParseResult(datasetState.a.parseResult) : null;
  const parseB = datasetState.b.parseResult ? cloneParseResult(datasetState.b.parseResult) : null;

  if (!parseA && !parseB) {
    return null;
  }

  const base = parseB ?? parseA!;
  const baseStructure = ensureStructure(base);
  const structureA = parseA ? ensureStructure(parseA) : null;
  const structureB = parseB ? ensureStructure(parseB) : null;

  const rows: string[][] = [];
  const rowNumbers: number[] = [];
  const statusColumnId = 'status';
  const changedColumnId = 'changed_columns';

  diffs.forEach((diff: DiffRow, index: number) => {
    let sourceRow: string[] | null = null;
    let sourceStructure: ParseStructure | null = null;

    if (diff.b_index !== null && parseB && structureB) {
      sourceRow = parseB.rows[diff.b_index] ?? null;
      sourceStructure = structureB;
    } else if (diff.a_index !== null && parseA && structureA) {
      sourceRow = parseA.rows[diff.a_index] ?? null;
      sourceStructure = structureA;
    }

    if (!sourceRow || !sourceStructure) {
      return;
    }

    const mapped = mapRowToOrder(sourceStructure, sourceRow, baseStructure.columnOrder);
    const statusLabel = labelDiffStatus(diff.status);
    const changedLabel = diff.changed_columns
      .map(columnId => {
        const match = baseStructure.columns.find(column => column.id === columnId);
        return match ? match.name : columnId;
      })
      .join(', ');

    rows.push([statusLabel, changedLabel, ...mapped]);
    rowNumbers.push(index + 1);
  });

  if (rows.length === 0) {
    return null;
  }

  return {
    rows,
    column_roles: cloneColumnRoles(base.column_roles ?? {}),
    column_order: [statusColumnId, changedColumnId, ...baseStructure.columnOrder],
    guessed_columns: base.guessed_columns ? { ...base.guessed_columns } : undefined,
    guessed_roles: base.guessed_roles ? { ...base.guessed_roles } : undefined,
    errors: [],
    headers: ['ステータス', '変更列', ...baseStructure.headers],
    columns: [
      { id: statusColumnId, name: 'ステータス' },
      { id: changedColumnId, name: '変更列' },
      ...baseStructure.columns.map(column => ({ ...column }))
    ],
    row_numbers: rowNumbers,
    structured_errors: []
  };
}

function getParseResultForSource(
  source: ExportSource,
  context: ExportContext,
  format?: 'csv' | 'netlist'
): ParseResult | null {
  switch (source) {
    case 'comparison':
      // CSV形式の場合はステータス列を含む比較結果を返す
      // ネットリスト形式の場合は元のBOM Bを返す（差分情報は不要）
      if (format === 'csv') {
        return buildComparisonParseResult(context.currentDiffs);
      } else {
        return datasetState.b.parseResult ? cloneParseResult(datasetState.b.parseResult) :
               datasetState.a.parseResult ? cloneParseResult(datasetState.a.parseResult) : null;
      }
    case 'replacement':
      return context.mergedBom ? cloneParseResult(context.mergedBom) : null;
    case 'bom_a':
      return datasetState.a.parseResult ? cloneParseResult(datasetState.a.parseResult) : null;
    case 'bom_b':
      return datasetState.b.parseResult ? cloneParseResult(datasetState.b.parseResult) : null;
    default:
      return null;
  }
}

function getExportFilename(source: ExportSource): string {
  switch (source) {
    case 'comparison':
      return 'comparison_result';
    case 'replacement':
      return 'merged_bom';
    case 'bom_a':
      return datasetState.a.fileName ? datasetState.a.fileName.replace(/\.[^.]+$/, '') : 'bom_a';
    case 'bom_b':
      return datasetState.b.fileName ? datasetState.b.fileName.replace(/\.[^.]+$/, '') : 'bom_b';
    default:
      return 'export';
  }
}

/**
 * CSV形式でエクスポート
 */
export async function exportToCSV(source: ExportSource, context: ExportContext): Promise<void> {
  const data = getParseResultForSource(source, context, 'csv');
  if (!data || data.rows.length === 0) {
    alert(`${SOURCE_LABEL[source]}からエクスポートできるデータがありません。`);
    return;
  }

  const filename = getExportFilename(source);
  const filePath = await save({
    filters: [{ name: 'CSV Files', extensions: ['csv'] }],
    defaultPath: `${filename}.csv`
  });

  if (!filePath) return;

  try {
    setProcessing(true, `${SOURCE_LABEL[source]}をCSV出力中...`);

    // Rustコマンドでエクスポート処理を実行
    const content = await invoke<string>('export_bom_file', {
      parse: data,
      format: 'CSV',
      diffs: null,
      includeComments: false
    });

    await saveSessionToFile(filePath, content);

    logActivity(`${SOURCE_LABEL[source]}をCSVに出力しました。`);
    alert(`CSV出力が完了しました。\n${data.rows.length}行のデータを出力しました。`);
  } catch (error: unknown) {
    console.error('CSV export failed', error);
    alert(`CSV出力に失敗しました: ${error}`);
  } finally {
    setProcessing(false);
  }
}

/**
 * PADS-ECO形式でエクスポート
 */
export async function exportToECO(source: ExportSource, context: ExportContext): Promise<void> {
  const data = getParseResultForSource(source, context, 'netlist');
  if (!data || data.rows.length === 0) {
    alert(`${SOURCE_LABEL[source]}からエクスポートできるデータがありません。`);
    return;
  }

  const filePath = await save({
    filters: [{ name: 'PADS-ECO Netlist', extensions: ['eco'] }],
    defaultPath: `${getExportFilename(source)}.eco`
  });

  if (!filePath) return;

  try {
    setProcessing(true, `${SOURCE_LABEL[source]}をPADS-ECO出力中...`);

    // Rustコマンドでエクスポート処理を実行
    const content = await invoke<string>('export_bom_file', {
      parse: data,
      format: 'ECO',
      diffs: null,
      includeComments: false
    });

    await saveSessionToFile(filePath, content);

    logActivity(`${SOURCE_LABEL[source]}をPADS-ECOに出力しました。`);
    alert(`PADS-ECO出力が完了しました。\n${data.rows.length}個の部品を出力しました。`);
  } catch (error: unknown) {
    console.error('PADS-ECO export failed', error);
    alert(`PADS-ECO出力に失敗しました: ${error}`);
  } finally {
    setProcessing(false);
  }
}

/**
 * CCF形式でエクスポート
 */
export async function exportToCCF(source: ExportSource, context: ExportContext): Promise<void> {
  const data = getParseResultForSource(source, context, 'netlist');
  if (!data || data.rows.length === 0) {
    alert(`${SOURCE_LABEL[source]}からエクスポートできるデータがありません。`);
    return;
  }

  const filePath = await save({
    filters: [{ name: 'CCF Netlist', extensions: ['ccf'] }],
    defaultPath: `${getExportFilename(source)}.ccf`
  });

  if (!filePath) return;

  try {
    setProcessing(true, `${SOURCE_LABEL[source]}をCCF出力中...`);

    // Rustコマンドでエクスポート処理を実行
    const content = await invoke<string>('export_bom_file', {
      parse: data,
      format: 'CCF',
      diffs: null,
      includeComments: false
    });

    await saveSessionToFile(filePath, content);

    logActivity(`${SOURCE_LABEL[source]}をCCFに出力しました。`);
    alert(`CCF出力が完了しました。\n${data.rows.length}個の部品を出力しました。`);
  } catch (error: unknown) {
    console.error('CCF export failed', error);
    alert(`CCF出力に失敗しました: ${error}`);
  } finally {
    setProcessing(false);
  }
}

/**
 * MSF形式でエクスポート
 */
export async function exportToMSF(source: ExportSource, context: ExportContext): Promise<void> {
  const data = getParseResultForSource(source, context, 'netlist');
  if (!data || data.rows.length === 0) {
    alert(`${SOURCE_LABEL[source]}からエクスポートできるデータがありません。`);
    return;
  }

  const filePath = await save({
    filters: [{ name: 'MSF Netlist', extensions: ['msf'] }],
    defaultPath: `${getExportFilename(source)}.msf`
  });

  if (!filePath) return;

  try {
    setProcessing(true, `${SOURCE_LABEL[source]}をMSF出力中...`);

    // Rustコマンドでエクスポート処理を実行
    const content = await invoke<string>('export_bom_file', {
      parse: data,
      format: 'MSF',
      diffs: null,
      includeComments: false
    });

    await saveSessionToFile(filePath, content);

    logActivity(`${SOURCE_LABEL[source]}をMSFに出力しました。`);
    alert(`MSF出力が完了しました。\n${data.rows.length}個の部品を出力しました。`);
  } catch (error: unknown) {
    console.error('MSF export failed', error);
    alert(`MSF出力に失敗しました: ${error}`);
  } finally {
    setProcessing(false);
  }
}

