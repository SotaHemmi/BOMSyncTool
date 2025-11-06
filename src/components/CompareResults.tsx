import { Fragment, useMemo, useState, useEffect, useCallback, type CSSProperties } from 'react';
import type { DiffRow, ParseResult } from '../types';
import { getCellValue, getManufacturer, getPartNo } from '../utils/bom';
import { buildColumnIndexMap } from '../utils';
import { deriveColumns } from '../core/bom-columns';
import {
  ResultsFilter,
  type FilterCounts,
  type ResultsFilterType
} from './ResultsFilter';
import type { ExportGroupConfig } from './exportTypes';

export type NormalizedStatus = 'added' | 'removed' | 'modified' | 'unchanged' | 'other';

const STATUS_LABELS: Record<NormalizedStatus, string> = {
  added: '追加',
  removed: '削除',
  modified: '変更',
  unchanged: '同一',
  other: '不明'
};

const STATUS_COLORS: Record<NormalizedStatus, string> = {
  added: '#166534',
  removed: '#b91c1c',
  modified: '#b45309',
  unchanged: '#64748b',
  other: '#475569'
};

const STATUS_NORMALIZE_MAP: Record<string, NormalizedStatus> = {
  added: 'added',
  remove: 'removed',
  removed: 'removed',
  delete: 'removed',
  deleted: 'removed',
  modified: 'modified',
  modify: 'modified',
  change: 'modified',
  changed: 'modified',
  diff: 'modified',
  same: 'unchanged',
  identical: 'unchanged',
  unchanged: 'unchanged'
};

type BaseColumnKey = 'ref' | 'part_no' | 'manufacturer';

interface ColumnSelectionState {
  compareAll: boolean;
  base: Record<BaseColumnKey, boolean>;
}

const BASE_COLUMN_ORDER: BaseColumnKey[] = ['ref', 'part_no', 'manufacturer'];

const BASE_COLUMN_LABELS: Record<BaseColumnKey, string> = {
  ref: 'リファレンス表示',
  part_no: '型番表示',
  manufacturer: 'メーカー名表示'
};

interface CompareResultsProps {
  results: DiffRow[] | null;
  filter: ResultsFilterType;
  onFilterChange: (filter: ResultsFilterType) => void;
  parseA: ParseResult | null;
  parseB: ParseResult | null;
  onPrint?: () => void;
  exportGroups?: ExportGroupConfig[];
  summaryOverride?: string;
  isLoading?: boolean;
  mode?: 'comparison' | 'replacement' | null;
  replacementResult?: ParseResult | null;
  replacementStatuses?: NormalizedStatus[] | null;
}

function normalizeStatus(status: string | undefined | null): NormalizedStatus {
  if (!status) return 'other';
  const key = status.toLowerCase();
  return STATUS_NORMALIZE_MAP[key] ?? 'other';
}

function mapChangedColumns(
  changedColumns: string[] | undefined,
  columnNameMap: Map<string, string>
): string {
  if (!changedColumns || changedColumns.length === 0) {
    return '-';
  }
  const labels = changedColumns.map(columnId => columnNameMap.get(columnId) ?? columnId);
  return labels.join(', ');
}

function resolveCellValue(
  parseResult: ParseResult | null,
  rowIndex: number | null,
  columnIndexMap: Map<string, number>,
  columnId: string
): string {
  if (!parseResult || rowIndex === null) {
    return '';
  }
  const resolvedIndex = columnIndexMap.get(columnId);
  if (resolvedIndex === undefined || resolvedIndex < 0) {
    return '';
  }
  return getCellValue(parseResult, rowIndex, resolvedIndex);
}

function computeCounts(results: DiffRow[] | null): FilterCounts {
  if (!results || results.length === 0) {
    return { all: 0, diff: 0, added: 0, removed: 0, changed: 0 };
  }

  let added = 0;
  let removed = 0;
  let modified = 0;

  results.forEach(result => {
    switch (normalizeStatus(result.status)) {
      case 'added':
        added += 1;
        break;
      case 'removed':
        removed += 1;
        break;
      case 'modified':
        modified += 1;
        break;
      default:
        break;
    }
  });

  return {
    all: results.length,
    diff: added + removed + modified,
    added,
    removed,
    changed: modified
  };
}

function filterResults(results: DiffRow[] | null, filter: ResultsFilterType): DiffRow[] {
  if (!results) return [];
  if (filter === 'all') {
    return results;
  }

  if (filter === 'diff') {
    return results.filter(result => {
      const normalized = normalizeStatus(result.status);
      return normalized === 'added' || normalized === 'removed' || normalized === 'modified';
    });
  }

  if (filter === 'added') {
    return results.filter(result => normalizeStatus(result.status) === 'added');
  }

  if (filter === 'removed') {
    return results.filter(result => normalizeStatus(result.status) === 'removed');
  }

  if (filter === 'changed') {
    return results.filter(result => normalizeStatus(result.status) === 'modified');
  }

  return results;
}

export function CompareResults({
  results,
  filter,
  onFilterChange,
  parseA,
  parseB,
  onPrint,
  exportGroups,
  summaryOverride,
  isLoading = false,
  mode = 'comparison',
  replacementResult = null,
  replacementStatuses = null
}: CompareResultsProps) {
  const [showAllRows, setShowAllRows] = useState(false);
  const [columnSelection, setColumnSelection] = useState<ColumnSelectionState>({
    compareAll: false,
    base: {
      ref: true,
      part_no: true,
      manufacturer: true
    }
  });
  const isReplacementMode = mode === 'replacement';
  const isComparisonMode = !isReplacementMode;
  const availableFilters: ResultsFilterType[] = isComparisonMode
    ? ['all', 'diff']
    : ['all', 'diff', 'added', 'removed', 'changed'];

  // フィルター変更時に表示をリセット
  useEffect(() => {
    setShowAllRows(false);
  }, [filter]);

  useEffect(() => {
    if (isComparisonMode && filter !== 'all' && filter !== 'diff') {
      onFilterChange('all');
    }
  }, [filter, isComparisonMode, onFilterChange]);

  const counts = useMemo(() => computeCounts(results), [results]);
  const filteredResults = useMemo(() => filterResults(results, filter), [results, filter]);
  const hasAnyComparisonResult = results !== null && results.length > 0;
  const showComparisonTable = isComparisonMode && filteredResults.length > 0;

  const columnsA = useMemo(() => (parseA ? deriveColumns(parseA) : []), [parseA]);
  const columnsB = useMemo(() => (parseB ? deriveColumns(parseB) : []), [parseB]);
  const replacementColumns = useMemo(() => {
    if (!replacementResult) return [];
    return deriveColumns(replacementResult);
  }, [replacementResult]);
  const columnNameMap = useMemo(() => {
    const map = new Map<string, string>();
    const register = (column: { id: string; name: string }) => {
      if (!map.has(column.id)) {
        map.set(column.id, column.name);
      }
    };
    columnsA.forEach(register);
    columnsB.forEach(register);
    replacementColumns.forEach(register);
    return map;
  }, [columnsA, columnsB, replacementColumns]);
  const columnRoleMap = useMemo(() => {
    const map = new Map<string, string>();
    const applyRoles = (parseResult: ParseResult | null) => {
      if (!parseResult) return;
      Object.entries(parseResult.column_roles ?? {}).forEach(([role, ids]) => {
        ids.forEach(id => {
          if (!map.has(id)) {
            map.set(id, role);
          }
        });
      });
    };
    applyRoles(parseA);
    applyRoles(parseB);
    applyRoles(replacementResult);
    return map;
  }, [parseA, parseB, replacementResult]);

  const columnIndexMapA = useMemo(() => {
    if (!parseA) return new Map<string, number>();
    return buildColumnIndexMap(columnsA, parseA);
  }, [columnsA, parseA]);
  const columnIndexMapB = useMemo(() => {
    if (!parseB) return new Map<string, number>();
    return buildColumnIndexMap(columnsB, parseB);
  }, [columnsB, parseB]);

  const mergedColumns = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    const register = (column: { id: string; name: string }) => {
      if (!map.has(column.id)) {
        map.set(column.id, column);
      }
    };
    columnsA.forEach(register);
    columnsB.forEach(register);
    replacementColumns.forEach(register);
    return Array.from(map.values());
  }, [columnsA, columnsB, replacementColumns]);

  const extraColumns = useMemo(
    () =>
      mergedColumns.filter(column => {
        const role = columnRoleMap.get(column.id);
        return role !== 'ref' && role !== 'part_no' && role !== 'manufacturer';
      }),
    [mergedColumns, columnRoleMap]
  );

  const computeAllSelected = useCallback(
    (base: Record<BaseColumnKey, boolean>): boolean => {
      return BASE_COLUMN_ORDER.every(key => base[key]);
    },
    []
  );

  const handleToggleAll = useCallback(() => {
    setColumnSelection(prev => {
      const nextValue = !prev.compareAll;
      return {
        compareAll: nextValue,
        base: prev.base
      };
    });
  }, []);

  const handleToggleBaseColumn = useCallback(
    (key: BaseColumnKey) => {
      setColumnSelection(prev => {
        const nextBase = {
          ...prev.base,
          [key]: !prev.base[key]
        };
        const compareAll = computeAllSelected(nextBase);
        return {
          compareAll,
          base: nextBase
        };
      });
    },
    [computeAllSelected]
  );

  const showRefColumn = columnSelection.compareAll || columnSelection.base.ref;
  const showPartNumberColumns = columnSelection.compareAll || columnSelection.base.part_no;
  const showManufacturerColumns = columnSelection.compareAll || columnSelection.base.manufacturer;
  const isColumnVisible = useCallback(
    (columnId: string): boolean => {
      if (columnSelection.compareAll) {
        return true;
      }
      const role = columnRoleMap.get(columnId);
      if (role === 'ref' || role === 'part_no' || role === 'manufacturer') {
        return columnSelection.base[role];
      }
      return false;
    },
    [columnSelection, columnRoleMap]
  );
  const comparisonExtraColumns = useMemo(
    () => extraColumns.filter(column => isColumnVisible(column.id)),
    [extraColumns, isColumnVisible]
  );
  const visibleReplacementColumns = useMemo(
    () => replacementColumns.filter(column => isColumnVisible(column.id)),
    [replacementColumns, isColumnVisible]
  );
  const replacementColumnIndexMap = useMemo(() => {
    if (!replacementResult) return new Map<string, number>();
    return buildColumnIndexMap(replacementColumns, replacementResult);
  }, [replacementColumns, replacementResult]);
  const replacementRowCount = replacementResult?.rows.length ?? 0;
  const replacementStatusesArray = replacementStatuses ?? [];
  const replacementCounts = useMemo<FilterCounts>(() => {
    if (!replacementResult || replacementStatusesArray.length !== replacementResult.rows.length) {
      return {
        all: replacementRowCount,
        diff: 0,
        added: 0,
        removed: 0,
        changed: 0
      };
    }
    let added = 0;
    let removed = 0;
    let modified = 0;
    replacementStatusesArray.forEach(status => {
      if (status === 'added') added += 1;
      else if (status === 'removed') removed += 1;
      else if (status === 'modified') modified += 1;
    });
    return {
      all: replacementRowCount,
      diff: added + removed + modified,
      added,
      removed,
      changed: modified
    };
  }, [replacementResult, replacementRowCount, replacementStatusesArray]);
  const replacementFilteredIndices = useMemo(() => {
    if (!replacementResult) return [];
    const total = replacementResult.rows.length;
    const indices = Array.from({ length: total }, (_, index) => index);
    if (replacementStatusesArray.length !== total) {
      if (filter === 'all') return indices;
      return [];
    }
    const shouldInclude = (status: NormalizedStatus): boolean => {
      if (filter === 'all') return true;
      if (filter === 'diff') {
        return status === 'added' || status === 'removed' || status === 'modified';
      }
      if (filter === 'added') return status === 'added';
      if (filter === 'removed') return status === 'removed';
      if (filter === 'changed') return status === 'modified';
      return true;
    };
    return indices.filter(index => shouldInclude(replacementStatusesArray[index] ?? 'other'));
  }, [filter, replacementResult, replacementStatusesArray]);
  const replacementDisplayLimit = 20;
  const replacementDisplayIndices = showAllRows
    ? replacementFilteredIndices
    : replacementFilteredIndices.slice(0, replacementDisplayLimit);
  const replacementHasMoreRows =
    replacementFilteredIndices.length > replacementDisplayLimit;

  const groups = useMemo(() => exportGroups ?? [], [exportGroups]);

  const headerCounts = isReplacementMode ? replacementCounts : counts;
  const filterDisabled = isLoading || (isComparisonMode && !hasAnyComparisonResult);

  let summaryText = summaryOverride;
  if (!summaryText) {
    if (isReplacementMode) {
      summaryText = replacementResult
        ? `置き換え結果: ${replacementRowCount.toLocaleString()} 行`
        : '置き換え結果がまだありません。置き換えを実行してください。';
    } else if (!results) {
      summaryText = '結果がまだありません。比較または置き換えを実行してください。';
    } else if (results.length === 0 || counts.diff === 0) {
      summaryText = '差分は検出されませんでした。';
    } else {
      summaryText = `差分: ${counts.diff.toLocaleString()}件（追加 ${counts.added}, 削除 ${counts.removed}, 変更 ${counts.changed}）`;
    }
  }

  const noResultsMessage = !results
    ? '結果がまだありません。比較または置き換えを実行してください。'
    : results.length === 0 || counts.diff === 0
      ? '差分は検出されませんでした。'
      : 'フィルター条件に一致する項目がありません。';
  const replacementEmptyMessage =
    replacementResult === null
      ? '置き換え結果がまだありません。置き換えを実行してください。'
      : 'フィルター条件に一致する項目がありません。';

  const emptyStateStyle: CSSProperties = {
    padding: '16px',
    textAlign: 'center',
    color: '#61748f'
  };

  const shouldHidePanel =
    !isLoading &&
    ((isComparisonMode && !hasAnyComparisonResult) ||
      (isReplacementMode && replacementResult === null));
  const showColumnControls =
    (isComparisonMode && hasAnyComparisonResult) ||
    (isReplacementMode && replacementRowCount > 0);
  const columnControlsDisabled = isLoading || (!hasAnyComparisonResult && replacementRowCount === 0);

  return (
    <section className="results-panel" hidden={shouldHidePanel}>
      <div className="results-header">
        <div className="results-summary" id="results-summary">
          {summaryText}
        </div>
        <ResultsFilter
          filter={filter}
          counts={headerCounts}
          onFilterChange={onFilterChange}
          onPrint={onPrint}
          exportGroups={groups}
          disabled={filterDisabled}
          filtersEnabled={isReplacementMode || hasAnyComparisonResult}
          availableFilters={availableFilters}
        />
      </div>

      {showColumnControls ? (
        <div
          className="results-column-controls"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '12px'
          }}
        >
          <label htmlFor="compare-all-columns" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input
              id="compare-all-columns"
              type="checkbox"
              checked={columnSelection.compareAll}
              onChange={handleToggleAll}
              disabled={columnControlsDisabled}
            />
            全表示
          </label>
          {BASE_COLUMN_ORDER.map(key => (
            <label
              key={key}
              htmlFor={`compare-column-${key}`}
              style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <input
                id={`compare-column-${key}`}
                type="checkbox"
                checked={columnSelection.base[key]}
                onChange={() => handleToggleBaseColumn(key)}
                disabled={columnControlsDisabled}
              />
              {BASE_COLUMN_LABELS[key]}
            </label>
          ))}
        </div>
      ) : null}

      <div className="results-table-wrapper">
        {isComparisonMode ? (
          showComparisonTable ? (
            <table className="results-table">
              <thead>
                <tr>
                  <th>ステータス</th>
                  {showRefColumn ? <th>Ref</th> : null}
                  {showPartNumberColumns ? (
                    <>
                      <th>A: 部品型番</th>
                      <th>B: 部品型番</th>
                    </>
                  ) : null}
                  {showManufacturerColumns ? (
                    <>
                      <th>A: メーカー</th>
                      <th>B: メーカー</th>
                    </>
                  ) : null}
                  {comparisonExtraColumns.map(column => (
                    <Fragment key={`header-${column.id}`}>
                      <th>{`A: ${column.name}`}</th>
                      <th>{`B: ${column.name}`}</th>
                    </Fragment>
                  ))}
                  <th>変更詳細</th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.map((result, index) => {
                  const normalized = normalizeStatus(result.status);
                  const statusLabel = STATUS_LABELS[normalized] ?? result.status ?? '-';
                  const statusColor = STATUS_COLORS[normalized];
                  const partA =
                    result.a_index !== null && parseA
                      ? getPartNo(parseA, result.a_index)
                      : '-';
                  const partB =
                    result.b_index !== null && parseB
                      ? getPartNo(parseB, result.b_index)
                      : '-';
                  const manufacturerA =
                    result.a_index !== null && parseA
                      ? getManufacturer(parseA, result.a_index)
                      : '-';
                  const manufacturerB =
                    result.b_index !== null && parseB
                      ? getManufacturer(parseB, result.b_index)
                      : '-';
                  const rowKey = `${result.ref_value}-${result.status}-${result.a_index ?? 'a'}-${result.b_index ?? 'b'}-${index}`;
                  const visibleChangedColumns =
                    result.changed_columns?.filter(columnId => isColumnVisible(columnId)) ?? [];
                  return (
                    <tr key={rowKey}>
                      <td style={{ color: statusColor }}>{statusLabel}</td>
                      {showRefColumn ? <td>{result.ref_value || '-'}</td> : null}
                      {showPartNumberColumns ? (
                        <>
                          <td>{partA || '-'}</td>
                          <td>{partB || '-'}</td>
                        </>
                      ) : null}
                      {showManufacturerColumns ? (
                        <>
                          <td>{manufacturerA || '-'}</td>
                          <td>{manufacturerB || '-'}</td>
                        </>
                      ) : null}
                      {comparisonExtraColumns.map(column => {
                        const extraA = resolveCellValue(parseA, result.a_index, columnIndexMapA, column.id);
                        const extraB = resolveCellValue(parseB, result.b_index, columnIndexMapB, column.id);
                        return (
                          <Fragment key={`cell-${column.id}-${index}`}>
                            <td>{extraA || '-'}</td>
                            <td>{extraB || '-'}</td>
                          </Fragment>
                        );
                      })}
                      <td>{mapChangedColumns(visibleChangedColumns, columnNameMap)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div style={emptyStateStyle}>{noResultsMessage}</div>
          )
        ) : replacementResult ? (
          replacementFilteredIndices.length > 0 ? (
            <table className="results-table">
              <thead>
                <tr>
                  <th>ステータス</th>
                  {visibleReplacementColumns.map(column => (
                    <th key={column.id}>{column.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {replacementDisplayIndices.map(displayIndex => {
                  const status = replacementStatusesArray[displayIndex] ?? 'other';
                  const statusLabel = STATUS_LABELS[status] ?? '-';
                  const row = replacementResult.rows[displayIndex];
                  return (
                    <tr key={`replacement-${displayIndex}`}>
                      <td style={{ color: STATUS_COLORS[status] ?? '#475569' }}>{statusLabel}</td>
                      {visibleReplacementColumns.map(column => {
                        const index = replacementColumnIndexMap.get(column.id);
                        const resolvedIndex =
                          index !== undefined ? index : replacementColumns.findIndex(col => col.id === column.id);
                        const cellValue = resolvedIndex >= 0 ? row[resolvedIndex] ?? '' : '';
                        return <td key={`${column.id}-${resolvedIndex}`}>{cellValue}</td>;
                      })}
                    </tr>
                  );
                })}
                {replacementHasMoreRows && !showAllRows ? (
                  <tr>
                    <td
                      colSpan={visibleReplacementColumns.length + 1}
                      style={{
                        textAlign: 'center',
                        fontStyle: 'italic',
                        cursor: 'pointer',
                        color: '#2563eb',
                        padding: '12px',
                        userSelect: 'none'
                      }}
                      onClick={() => setShowAllRows(true)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setShowAllRows(true);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`残りの${replacementFilteredIndices.length - replacementDisplayIndices.length}行を表示`}
                    >
                      ... 他 {replacementFilteredIndices.length - replacementDisplayLimit} 行をクリックして表示
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          ) : (
            <div style={emptyStateStyle}>{replacementEmptyMessage}</div>
          )
        ) : (
          <div style={emptyStateStyle}>{replacementEmptyMessage}</div>
        )}
      </div>
    </section>
  );
}
