import { useMemo, type CSSProperties } from 'react';
import type { DiffRow, ParseResult } from '../types';
import { getPartNo } from '../utils/bom';
import { deriveColumns } from './DatasetCard';
import {
  ResultsFilter,
  type FilterCounts,
  type ResultsFilterType
} from './ResultsFilter';
import type { ExportGroupConfig } from './exportTypes';

type NormalizedStatus = 'added' | 'removed' | 'modified' | 'unchanged' | 'other';

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
  isLoading = false
}: CompareResultsProps) {
  const counts = useMemo(() => computeCounts(results), [results]);
  const filteredResults = useMemo(() => filterResults(results, filter), [results, filter]);
  const hasAnyResult = results !== null && results.length > 0;

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

  let summaryText = summaryOverride;
  if (!summaryText) {
    if (!results) {
      summaryText = '結果がまだありません。比較または置き換えを実行してください。';
    } else if (results.length === 0 || counts.diff === 0) {
      summaryText = '差分は検出されませんでした。';
    } else {
      summaryText = `差分: ${counts.diff.toLocaleString()}件（追加 ${counts.added}, 削除 ${counts.removed}, 変更 ${counts.changed}）`;
    }
  }

  const showTable = filteredResults.length > 0;
  const noResultsMessage = !results
    ? '結果がまだありません。比較または置き換えを実行してください。'
    : results.length === 0 || counts.diff === 0
      ? '差分は検出されませんでした。'
      : 'フィルター条件に一致する項目がありません。';

  const emptyStateStyle: CSSProperties = {
    padding: '16px',
    textAlign: 'center',
    color: '#61748f'
  };

  return (
    <section className="results-panel" hidden={!hasAnyResult && !isLoading}>
      <div className="results-header">
        <div className="results-summary" id="results-summary">
          {summaryText}
        </div>
        <ResultsFilter
          filter={filter}
          counts={counts}
          onFilterChange={onFilterChange}
          onPrint={onPrint}
          exportGroups={exportGroups}
          disabled={!hasAnyResult || isLoading}
        />
      </div>

      <div className="results-table-wrapper">
        {showTable ? (
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
        )}
      </div>
    </section>
  );
}
