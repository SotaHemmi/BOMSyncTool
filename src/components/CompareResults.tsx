import { useMemo, type CSSProperties } from 'react';
import type { DiffRow, ParseResult } from '../types';
import { getPartNo, getColumnIndexById } from '../utils/bom';
import { deriveColumns } from './DatasetCard';
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

function buildColumnIndexMap(columns: { id: string; name: string }[], parseResult: ParseResult): Map<string, number> {
  const map = new Map<string, number>();
  columns.forEach((column, index) => {
    const resolvedIndex = getColumnIndexById(parseResult, column.id);
    map.set(column.id, resolvedIndex >= 0 ? resolvedIndex : index);
  });
  return map;
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
  const isReplacementMode = mode === 'replacement';
  const isComparisonMode = !isReplacementMode;

  const counts = useMemo(() => computeCounts(results), [results]);
  const filteredResults = useMemo(() => filterResults(results, filter), [results, filter]);
  const hasAnyComparisonResult = results !== null && results.length > 0;
  const showComparisonTable = isComparisonMode && filteredResults.length > 0;

  const columnsA = useMemo(() => (parseA ? deriveColumns(parseA) : []), [parseA]);
  const columnsB = useMemo(() => (parseB ? deriveColumns(parseB) : []), [parseB]);
  const columnNameMap = useMemo(() => {
    const map = new Map<string, string>();
    columnsA.forEach(column => {
      if (!map.has(column.id)) {
        map.set(column.id, column.name);
      }
    });
    columnsB.forEach(column => {
      if (!map.has(column.id)) {
        map.set(column.id, column.name);
      }
    });
    return map;
  }, [columnsA, columnsB]);

  const replacementColumns = useMemo(() => {
    if (!replacementResult) return [];
    return deriveColumns(replacementResult);
  }, [replacementResult]);
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
  const replacementDisplayIndices = replacementFilteredIndices.slice(0, replacementDisplayLimit);
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
        />
      </div>

      <div className="results-table-wrapper">
        {isComparisonMode ? (
          showComparisonTable ? (
            <table className="results-table">
              <thead>
                <tr>
                  <th>ステータス</th>
                  <th>Ref</th>
                  <th>A: 部品型番</th>
                  <th>B: 部品型番</th>
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
                  const rowKey = `${result.ref_value}-${result.status}-${result.a_index ?? 'a'}-${result.b_index ?? 'b'}-${index}`;
                  return (
                    <tr key={rowKey}>
                      <td style={{ color: statusColor }}>{statusLabel}</td>
                      <td>{result.ref_value || '-'}</td>
                      <td>{partA || '-'}</td>
                      <td>{partB || '-'}</td>
                      <td>{mapChangedColumns(result.changed_columns, columnNameMap)}</td>
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
                  {replacementColumns.map(column => (
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
                      {replacementColumns.map(column => {
                        const index = replacementColumnIndexMap.get(column.id);
                        const resolvedIndex =
                          index !== undefined ? index : replacementColumns.findIndex(col => col.id === column.id);
                        const cellValue = resolvedIndex >= 0 ? row[resolvedIndex] ?? '' : '';
                        return <td key={`${column.id}-${resolvedIndex}`}>{cellValue}</td>;
                      })}
                    </tr>
                  );
                })}
                {replacementHasMoreRows ? (
                  <tr>
                    <td
                      colSpan={replacementColumns.length + 1}
                      style={{ textAlign: 'center', fontStyle: 'italic' }}
                    >
                      ... 他 {replacementFilteredIndices.length - replacementDisplayIndices.length} 行
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
