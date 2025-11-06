import { memo, useCallback, useMemo } from 'react';
import type { ChangeEvent } from 'react';
import type { ColumnMeta, ColumnRole, DatasetKey, ParseError, ParseResult } from '../types';
import { datasetLabel, formatDateLabel, buildColumnIndexMap } from '../utils';
import { useColumnSamples } from '../hooks/useColumnSamples';
import { deriveColumns } from '../core/bom-columns';

export const MULTIPLE_COLUMN_TOKEN = '__MULTIPLE__';

interface CellErrorInfo {
  className: string;
  messages: string[];
}

const ROLE_LABELS: Record<ColumnRole, string> = {
  ref: 'Ref (部品番号)',
  part_no: 'Part No (部品型番)',
  manufacturer: 'Manufacturer (メーカー)',
  ignore: 'Ignore (指定しない)'
};

const VISIBLE_ROLE_ORDER: ColumnRole[] = [
  'ref',
  'part_no',
  'manufacturer',
  'ignore'
];

const SEVERITY_CLASS: Record<'error' | 'warning' | 'info', string> = {
  error: 'cell-error',
  warning: 'cell-warning',
  info: 'cell-info'
};

const SEVERITY_PRIORITY: Record<'error' | 'warning' | 'info', number> = {
  error: 3,
  warning: 2,
  info: 1
};

const COLUMN_ROLE_SET = new Set<ColumnRole>(VISIBLE_ROLE_ORDER);

function isColumnRole(value: string): value is ColumnRole {
  return COLUMN_ROLE_SET.has(value as ColumnRole);
}

function pickHigherSeverity(current: 'error' | 'warning' | 'info', next: 'error' | 'warning' | 'info') {
  return SEVERITY_PRIORITY[next] > SEVERITY_PRIORITY[current] ? next : current;
}

export function buildCellErrorMap(parseResult: ParseResult | null): Map<string, CellErrorInfo> {
  const map = new Map<string, CellErrorInfo>();
  if (!parseResult?.structured_errors?.length) {
    return map;
  }

  parseResult.structured_errors.forEach((error: ParseError) => {
    if (typeof error.row !== 'number' || typeof error.column !== 'number') {
      return;
    }

    const severity = error.severity ?? 'warning';
    const key = `${error.row}:${error.column}`;
    const className = SEVERITY_CLASS[severity];
    const existing = map.get(key);

    if (existing) {
      existing.messages.push(error.message);
      const currentSeverity = existing.className.includes('error')
        ? 'error'
        : existing.className.includes('warning')
          ? 'warning'
          : 'info';
      const nextSeverity = pickHigherSeverity(currentSeverity, severity);
      existing.className = SEVERITY_CLASS[nextSeverity];
    } else {
      map.set(key, {
        className,
        messages: [error.message]
      });
    }
  });

  return map;
}

export interface PreviewTableProps {
  parseResult: ParseResult;
  maxRows?: number;
}

export function PreviewTable({ parseResult, maxRows = 15 }: PreviewTableProps) {
  const columns = useMemo(() => deriveColumns(parseResult), [parseResult]);
  const cellErrors = useMemo(() => buildCellErrorMap(parseResult), [parseResult]);
  const columnIndexMap = useMemo(() => buildColumnIndexMap(columns, parseResult), [columns, parseResult]);

  const displayRows = parseResult.rows.slice(0, maxRows);
  const hasMoreRows = parseResult.rows.length > maxRows;
  const rowNumbers = parseResult.row_numbers ?? [];

  return (
    <table>
      <thead>
        <tr>
          {columns.map(column => (
            <th key={column.id}>{column.name}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {displayRows.map((row, rowIndex) => {
          const actualRowNumber = rowNumbers[rowIndex] ?? rowIndex + 1;
          return (
            <tr key={`${actualRowNumber}-${rowIndex}`}>
              {columns.map(column => {
                const columnIndex = columnIndexMap.get(column.id) ?? columns.indexOf(column);
                const cellKey = `${actualRowNumber}:${columnIndex}`;
                const errorInfo = cellErrors.get(cellKey);
                const className = errorInfo ? `cell-with-error ${errorInfo.className}` : undefined;
                const title = errorInfo ? errorInfo.messages.join('\n') : undefined;
                const cellValue = columnIndex >= 0 ? row[columnIndex] ?? '' : '';
                return (
                  <td key={`${column.id}-${columnIndex}`} className={className} title={title}>
                    {cellValue}
                  </td>
                );
              })}
            </tr>
          );
        })}
        {hasMoreRows ? (
          <tr>
            <td colSpan={columns.length} style={{ textAlign: 'center', fontStyle: 'italic' }}>
              ... 他 {parseResult.rows.length - maxRows} 行
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

function deriveRoleAssignments(
  parseResult: ParseResult | null,
  overrides?: Record<string, ColumnRole>
): Partial<Record<ColumnRole, string[]>> {
  const assignments: Partial<Record<ColumnRole, string[]>> = {};

  if (parseResult?.column_roles) {
    Object.entries(parseResult.column_roles).forEach(([role, columnIds]) => {
      if (!isColumnRole(role)) return;
      assignments[role] = columnIds.slice();
    });
  }

  if (parseResult?.guessed_roles) {
    Object.entries(parseResult.guessed_roles).forEach(([columnId, role]) => {
      if (!isColumnRole(role)) return;
      const list = assignments[role] ?? (assignments[role] = []);
      if (!list.includes(columnId)) {
        list.push(columnId);
      }
    });
  }

  if (overrides) {
    Object.entries(overrides).forEach(([columnId, role]) => {
      if (!COLUMN_ROLE_SET.has(role)) return;
      const list = assignments[role] ?? (assignments[role] = []);
      if (!list.includes(columnId)) {
        list.push(columnId);
      }
    });
  }

  return assignments;
}

function fallbackColumnForRole(role: ColumnRole, parseResult: ParseResult, columns: ColumnMeta[]): string {
  const existing = parseResult.column_roles?.[role]?.find(columnId =>
    columns.some(column => column.id === columnId)
  );
  if (existing) return existing;

  if (parseResult.guessed_columns && parseResult.guessed_columns[role] !== undefined) {
    const guessedIndex = Number(parseResult.guessed_columns[role]);
    const guessedColumn = columns[guessedIndex];
    if (guessedColumn) {
      return guessedColumn.id;
    }
  }

  return '';
}

interface DatasetCardProps {
  dataset: DatasetKey;
  parseResult: ParseResult | null;
  fileName: string | null;
  lastUpdated?: string | null;
  columnRoles?: Record<string, ColumnRole>;
  errors?: string[];
  isProcessing?: boolean;
  onColumnRoleChange?: (role: ColumnRole, columnId: string | null) => void;
  onDefaultPreprocess?: () => void;
  onOpenEdit?: () => void;
  onExportECO?: () => void;
  onExportCCF?: () => void;
  onExportMSF?: () => void;
}

function DatasetCardComponent({
  dataset,
  parseResult,
  fileName,
  lastUpdated,
  columnRoles,
  errors,
  isProcessing = false,
  onColumnRoleChange,
  onDefaultPreprocess,
  onOpenEdit,
  onExportECO,
  onExportCCF,
  onExportMSF
}: DatasetCardProps) {
  const hasData = Boolean(parseResult && parseResult.rows.length > 0);
  const columns = useMemo(() => (parseResult ? deriveColumns(parseResult) : []), [parseResult]);
  const assignments = useMemo(
    () => deriveRoleAssignments(parseResult, columnRoles),
    [columnRoles, parseResult]
  );

  // 各列のサンプルデータを生成（最初の3つの非空値）
  const columnSamples = useColumnSamples(columns, parseResult);

  const previewMeta = useMemo(() => {
    if (!hasData || !parseResult) {
      return '未読み込み';
    }
    const rowCount = parseResult.rows.length;
    const columnCount = columns.length || (parseResult.headers?.length ?? 0);
    return [
      `行数: ${rowCount.toLocaleString()}`,
      `列数: ${columnCount}`,
      `更新: ${formatDateLabel(lastUpdated ?? null)}`
    ]
      .filter(Boolean)
      .join(' / ');
  }, [columns.length, hasData, lastUpdated, parseResult]);

  const headerMeta = useMemo(() => {
    if (!hasData || !parseResult) {
      return '未読み込み';
    }
    const rowCount = parseResult.rows.length;
    const columnCount = columns.length || (parseResult.headers?.length ?? 0);
    const parts = [
      `行数: ${rowCount.toLocaleString()}`,
      `列数: ${columnCount}`,
      fileName ? `ファイル: ${fileName}` : null,
      `更新: ${formatDateLabel(lastUpdated ?? null)}`
    ].filter(Boolean);
    return parts.join(' / ');
  }, [columns.length, fileName, hasData, lastUpdated, parseResult]);

  const aggregatedErrors = useMemo(() => {
    if (!parseResult) return [];
    const structured = parseResult.structured_errors ?? [];
    if (structured.length > 0) {
      return structured.map(item => ({
        message: item.message,
        severity: item.severity ?? 'warning'
      }));
    }
    const fallback = parseResult.errors?.length ? parseResult.errors : errors ?? [];
    return fallback.map(message => ({
      message,
      severity: 'warning' as const
    }));
  }, [errors, parseResult]);

  const handleRoleChange = useCallback(
    (role: ColumnRole) => (event: ChangeEvent<HTMLSelectElement>) => {
      if (!onColumnRoleChange) return;
      const { value } = event.target;
      if (value === MULTIPLE_COLUMN_TOKEN) {
        return;
      }
      const nextValue = value || null;
      onColumnRoleChange(role, nextValue);
    },
    [onColumnRoleChange]
  );

  return (
    <section className="preview-card" data-dataset={dataset}>
      <header>
        <div>
          <h3>{datasetLabel(dataset)}</h3>
          <p className="preview-meta">{headerMeta}</p>
        </div>
        <div>
          {hasData && parseResult ? null : (
            <button
              type="button"
              className="ghost-button"
              onClick={onOpenEdit}
              disabled
            >
              編集
            </button>
          )}
        </div>
      </header>

      <div className="preview-content">
        <div className="dropzone-body preview-dropzone-body">
          <div
            className="dropzone-surface"
            data-surface={dataset}
            data-has-data={hasData || undefined}
          >
            <div
              className="dropzone-placeholder"
              data-placeholder={dataset}
              hidden={hasData}
            >
              <div className="dropzone-placeholder-icon">⇣</div>
              <p>ここにファイルをドラッグ＆ドロップ</p>
              <small>CSV / XLSX / CADネットリスト 対応</small>
            </div>

            <div
              className="dropzone-preview"
              data-preview={dataset}
              hidden={!hasData || !parseResult}
            >
              {hasData && parseResult ? (
                <>
                  <div className="drop-preview-header">
                    <div>
                      <h3>{fileName ?? `${datasetLabel(dataset)} プレビュー`}</h3>
                      <p className="drop-preview-meta">{previewMeta}</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {(onExportECO || onExportCCF || onExportMSF) && (
                        <details className="export-dropdown">
                          <summary className="ghost-button">エクスポート</summary>
                          <div className="export-menu">
                            {onExportECO && (
                              <button
                                type="button"
                                onClick={onExportECO}
                                disabled={isProcessing}
                              >
                                PADS-ECO
                              </button>
                            )}
                            {onExportCCF && (
                              <button
                                type="button"
                                onClick={onExportCCF}
                                disabled={isProcessing}
                              >
                                CCF
                              </button>
                            )}
                            {onExportMSF && (
                              <button
                                type="button"
                                onClick={onExportMSF}
                                disabled={isProcessing}
                              >
                                MSF
                              </button>
                            )}
                          </div>
                        </details>
                      )}
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={onOpenEdit}
                        disabled={!onOpenEdit || isProcessing}
                      >
                        編集
                      </button>
                    </div>
                  </div>

                  <div className="preview-with-settings">
                    <div className="drop-preview-table">
                      <div className="preview-table-wrapper">
                        <PreviewTable parseResult={parseResult} maxRows={15} />
                      </div>
                    </div>
                    <aside className="column-settings-panel" data-column-settings={dataset}>
                      <h4>列の役割</h4>
                      {VISIBLE_ROLE_ORDER.map(role => {
                        const assignedColumns = assignments[role] ?? [];
                        const multipleSelected = assignedColumns.length > 1;
                        const initialAssigned =
                          assignedColumns[0] ?? (parseResult ? fallbackColumnForRole(role, parseResult, columns) : '');
                        const selectValue = multipleSelected
                          ? MULTIPLE_COLUMN_TOKEN
                          : initialAssigned ?? '';
                        const title = multipleSelected
                          ? assignedColumns
                              .map(columnId => columns.find(column => column.id === columnId)?.name ?? columnId)
                              .join(', ')
                          : undefined;

                        return (
                          <div className="column-setting-group" key={role}>
                            <label>
                              <span>{ROLE_LABELS[role]}</span>
                              <select
                                className={`column-select${multipleSelected ? ' column-select--multiple' : ''}`}
                                value={selectValue}
                                onChange={handleRoleChange(role)}
                                data-column-role={role}
                                data-dataset={dataset}
                                data-multiple-columns={
                                  multipleSelected ? assignedColumns.join(',') : undefined
                                }
                                title={title}
                                disabled={!onColumnRoleChange || isProcessing}
                              >
                                <option value="">--</option>
                                {multipleSelected ? (
                                  <option value={MULTIPLE_COLUMN_TOKEN}>複数列</option>
                                ) : null}
                                {columns.map(column => {
                                  const sample = columnSamples.get(column.id);
                                  const displayText = sample
                                    ? `${column.name} (${sample}...)`
                                    : column.name;
                                  return (
                                    <option key={column.id} value={column.id} title={sample || column.name}>
                                      {displayText}
                                    </option>
                                  );
                                })}
                              </select>
                            </label>
                          </div>
                        );
                      })}
                      <button
                        type="button"
                        className="column-default-preprocess"
                        data-default-preprocess={dataset}
                        onClick={onDefaultPreprocess}
                        disabled={!onDefaultPreprocess || isProcessing}
                      >
                        デフォルト前処理を適用
                      </button>
                    </aside>
                  </div>

                  {aggregatedErrors.length > 0 ? (
                    <div className="drop-preview-errors">
                      <strong>読み込み警告</strong>
                      <ul>
                        {aggregatedErrors.slice(0, 3).map((item, index) => (
                          <li key={`${item.message}-${index}`} className={item.severity}>
                            {item.message}
                          </li>
                        ))}
                        {aggregatedErrors.length > 3 ? (
                          <li className="info">
                            他 {aggregatedErrors.length - 3} 件の警告があります。
                          </li>
                        ) : null}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export const DatasetCard = memo(DatasetCardComponent);
