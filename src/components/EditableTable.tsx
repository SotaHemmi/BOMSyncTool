import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FocusEvent, UIEvent } from 'react';
import type { ColumnMeta, ParseError } from '../types';

type ErrorSeverity = 'error' | 'warning' | 'info';

interface AggregatedCellError {
  severity: ErrorSeverity;
  messages: string[];
}

export interface EditableTableProps {
  columns: ColumnMeta[];
  rows: string[][];
  structuredErrors?: ParseError[] | null;
  highlightedCell?: { row: number; column: number } | null;
  maxRows?: number;
  onCellChange: (rowIndex: number, columnIndex: number, value: string) => void;
  onCellFocus?: (rowIndex: number, columnIndex: number) => void;
  onAddRow?: () => void;
  onDeleteRow?: (rowIndex: number) => void;
  onReorderColumns?: (fromIndex: number, toIndex: number) => void;
}

const ROW_HEIGHT_PX = 38;
const DEFAULT_VIEWPORT_HEIGHT = 420;
const VIRTUALIZATION_THRESHOLD = 200;
const VIRTUALIZATION_OVERSCAN = 8;

const severityPriority: Record<ErrorSeverity, number> = {
  error: 3,
  warning: 2,
  info: 1
};

function resolveDataColumnIndex(columnId: string, fallbackIndex: number): number {
  if (columnId) {
    const match = columnId.match(/^col-(\d+)$/i);
    if (match) {
      const numericIndex = Number(match[1]);
      if (Number.isFinite(numericIndex)) {
        return numericIndex;
      }
    }
  }
  return fallbackIndex;
}

function aggregateErrors(errors: ParseError[] | null | undefined): Map<string, AggregatedCellError> {
  const map = new Map<string, AggregatedCellError>();
  if (!errors) {
    return map;
  }

  errors.forEach(error => {
    if (typeof error.row !== 'number' || typeof error.column !== 'number') {
      return;
    }
    // structured_errors では severity が省略されるケースもあるため warning をデフォルトに
    const severity = (error.severity as ErrorSeverity) ?? 'warning';
    const key = `${error.row},${error.column}`;
    const existing = map.get(key);
    if (existing) {
      const currentPriority = severityPriority[existing.severity];
      const nextPriority = severityPriority[severity];
      if (nextPriority > currentPriority) {
        existing.severity = severity;
      }
      existing.messages.push(error.message);
    } else {
      map.set(key, {
        severity,
        messages: [error.message]
      });
    }
  });

  return map;
}

function EditableTable({
  columns,
  rows,
  structuredErrors,
  highlightedCell,
  maxRows,
  onCellChange,
  onCellFocus,
  onAddRow,
  onDeleteRow
  // onReorderColumns - 将来実装予定
}: EditableTableProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [containerHeight, setContainerHeight] = useState<number>(DEFAULT_VIEWPORT_HEIGHT);
  const [scrollOffset, setScrollOffset] = useState<number>(0);

  const errorMap = useMemo(() => aggregateErrors(structuredErrors), [structuredErrors]);

  useLayoutEffect(() => {
    const measure = () => {
      if (scrollContainerRef.current) {
        setContainerHeight(scrollContainerRef.current.clientHeight);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useLayoutEffect(() => {
    if (scrollContainerRef.current) {
      setContainerHeight(scrollContainerRef.current.clientHeight);
    }
  }, [columns.length, rows.length]);

  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    setScrollOffset(event.currentTarget.scrollTop);
  }, []);

  const effectiveMaxRows = typeof maxRows === 'number' ? maxRows : rows.length;
  const totalRows = Math.min(rows.length, effectiveMaxRows);
  const boundedRows = useMemo(() => rows.slice(0, totalRows), [rows, totalRows]);

  const enableVirtualization = totalRows > VIRTUALIZATION_THRESHOLD;
  const viewportRowCapacity = Math.max(1, Math.ceil(containerHeight / ROW_HEIGHT_PX));
  const virtualStartIndex = enableVirtualization
    ? Math.max(0, Math.floor(scrollOffset / ROW_HEIGHT_PX) - VIRTUALIZATION_OVERSCAN)
    : 0;
  const virtualEndIndex = enableVirtualization
    ? Math.min(totalRows, virtualStartIndex + viewportRowCapacity + VIRTUALIZATION_OVERSCAN * 2)
    : totalRows;

  const visibleRows = useMemo(
    () => boundedRows.slice(virtualStartIndex, virtualEndIndex),
    [boundedRows, virtualEndIndex, virtualStartIndex]
  );

  const paddingTop = enableVirtualization ? virtualStartIndex * ROW_HEIGHT_PX : 0;
  const paddingBottom = enableVirtualization
    ? Math.max(0, totalRows * ROW_HEIGHT_PX - paddingTop - visibleRows.length * ROW_HEIGHT_PX)
    : 0;
  const columnSpan = columns.length + (onDeleteRow ? 1 : 0);

  const handleCellBlur = (rowIndex: number, columnIndex: number) => (event: FocusEvent<HTMLTableCellElement>) => {
    const nextValue = event.currentTarget.textContent ?? '';
    onCellChange(rowIndex, columnIndex, nextValue);
  };

  const handleCellFocus = (rowIndex: number, columnIndex: number) => () => {
    if (onCellFocus) {
      onCellFocus(rowIndex, columnIndex);
    }
  };

  const handleDeleteRow = (rowIndex: number) => () => {
    if (onDeleteRow && confirm(`行 ${rowIndex + 1} を削除しますか？`)) {
      onDeleteRow(rowIndex);
    }
  };

  const handleAddRow = () => {
    if (onAddRow) {
      onAddRow();
    }
  };

  return (
    <div className="editable-table-wrapper">
      {/* 行追加ボタン */}
      {onAddRow && (
        <div className="table-toolbar">
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={handleAddRow}
            data-tooltip="新しい行を追加"
          >
            + 行を追加
          </button>
        </div>
      )}

      <div
        className="editable-table-scroll"
        ref={scrollContainerRef}
        onScroll={enableVirtualization ? handleScroll : undefined}
        style={enableVirtualization ? { maxHeight: DEFAULT_VIEWPORT_HEIGHT, overflowY: 'auto' } : undefined}
      >
        <table id="edit-table">
          <thead id="edit-table-head">
            <tr>
              {onDeleteRow && <th style={{ width: '40px' }}>削除</th>}
              {columns.map(column => (
                <th key={column.id}>{column.name}</th>
              ))}
            </tr>
          </thead>
          <tbody id="edit-table-body">
          {enableVirtualization && paddingTop > 0 ? (
            <tr className="virtual-spacer" style={{ height: paddingTop }}>
              <td colSpan={columnSpan} />
            </tr>
          ) : null}

          {(enableVirtualization ? visibleRows : boundedRows).map((row, index) => {
            const rowIndex = enableVirtualization ? virtualStartIndex + index : index;
            return (
              <tr key={`edit-row-${rowIndex}`} style={enableVirtualization ? { height: ROW_HEIGHT_PX } : undefined}>
              {onDeleteRow && (
                <td className="row-actions">
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={handleDeleteRow(rowIndex)}
                    data-tooltip={`行 ${rowIndex + 1} を削除`}
                    aria-label={`行 ${rowIndex + 1} を削除`}
                  >
                    ×
                  </button>
                </td>
              )}
              {columns.map((column, columnIndex) => {
                const dataIndex = resolveDataColumnIndex(column.id, columnIndex);
                const mapKey = `${rowIndex},${dataIndex}`;
                const cellError = errorMap.get(mapKey);
                const isHighlighted =
                  highlightedCell !== null &&
                  highlightedCell !== undefined &&
                  highlightedCell.row === rowIndex &&
                  highlightedCell.column === dataIndex;
                const classNames = [
                  cellError ? 'cell-with-error' : null,
                  cellError?.severity === 'error' ? 'cell-error' : null,
                  cellError?.severity === 'warning' ? 'cell-warning' : null,
                  cellError?.severity === 'info' ? 'cell-info' : null,
                  isHighlighted ? 'cell-highlight' : null
                ]
                  .filter(Boolean)
                  .join(' ');

                return (
                  <td
                    key={`${column.id}-${columnIndex}`}
                    contentEditable
                    suppressContentEditableWarning
                    data-row-index={rowIndex}
                    data-column-index={dataIndex}
                    onBlur={handleCellBlur(rowIndex, dataIndex)}
                    onFocus={handleCellFocus(rowIndex, dataIndex)}
                    className={classNames || undefined}
                    title={cellError ? cellError.messages.join('\n') : undefined}
                  >
                    {row[dataIndex] ?? ''}
                  </td>
                );
              })}
            </tr>
            );
          })}

          {enableVirtualization && paddingBottom > 0 ? (
            <tr className="virtual-spacer" style={{ height: paddingBottom }}>
              <td colSpan={columnSpan} />
            </tr>
          ) : null}

          {rows.length > totalRows ? (
            <tr className="edit-table-notice-row">
              <td colSpan={columnSpan} className="edit-table-notice">
                表示は先頭 {totalRows} 行までです。
              </td>
            </tr>
          ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default React.memo(EditableTable);
