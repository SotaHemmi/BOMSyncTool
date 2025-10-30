import { useMemo } from 'react';
import type { ReactNode } from 'react';
import type { ExportGroupConfig } from './exportTypes';

export type ResultsFilterType = 'all' | 'diff' | 'added' | 'removed' | 'changed';

export interface FilterCounts {
  all: number;
  diff: number;
  added: number;
  removed: number;
  changed: number;
}

interface ResultsFilterProps {
  filter: ResultsFilterType;
  counts: FilterCounts;
  onFilterChange: (next: ResultsFilterType) => void;
  onPrint?: () => void;
  exportGroups?: ExportGroupConfig[];
  disabled?: boolean;
}

interface FilterButtonConfig {
  key: ResultsFilterType;
  id: string;
  label: string;
  className?: string;
  countKey: keyof FilterCounts | null;
}

const FILTER_BUTTONS: FilterButtonConfig[] = [
  { key: 'all', id: 'filter-all', label: '全件', countKey: 'all' },
  { key: 'diff', id: 'filter-diff', label: '差分', countKey: 'diff' },
  { key: 'added', id: 'filter-added', label: '追加', className: 'filter-added', countKey: 'added' },
  { key: 'removed', id: 'filter-removed', label: '削除', className: 'filter-removed', countKey: 'removed' },
  { key: 'changed', id: 'filter-changed', label: '変更', className: 'filter-changed', countKey: 'changed' }
];

export function ResultsFilter({
  filter,
  counts,
  onFilterChange,
  onPrint,
  exportGroups,
  disabled = false
}: ResultsFilterProps) {
  const groups = useMemo(() => exportGroups ?? [], [exportGroups]);

  // visible が true のグループのみをフィルタリング
  const visibleGroups = useMemo(() => {
    return groups.filter(group => {
      // visible が未定義の場合は常に表示（後方互換性）
      if (group.visible === undefined) return true;
      return group.visible === true;
    });
  }, [groups]);

  const hasExportGroups = visibleGroups.some(group =>
    group && Object.values(group.handlers).some(handler => typeof handler === 'function')
  );

  const hasActions = Boolean((onPrint || hasExportGroups) && counts.all > 0);

  const handleFilterClick = (next: ResultsFilterType) => {
    if (disabled) return;
    if (filter === next) return;
    onFilterChange(next);
  };

  const handlePrint = () => {
    if (disabled || counts.all === 0) return;
    if (onPrint) {
      onPrint();
      return;
    }
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  return (
    <div className="results-filter-controls">
      <div className="results-view-controls">
        {FILTER_BUTTONS.map(({ key, id, label, className, countKey }) => {
          const buttonCount = countKey ? counts[countKey] : undefined;
          return (
            <button
              key={key}
              id={id}
              type="button"
              className={`filter-button${className ? ` ${className}` : ''}${filter === key ? ' is-active' : ''}`}
              onClick={() => handleFilterClick(key)}
              disabled={disabled}
              aria-pressed={filter === key}
            >
              {label}
              {countKey ? (
                <span
                  id={
                    countKey === 'diff'
                      ? 'count-total'
                      : countKey === 'added'
                        ? 'count-added'
                        : countKey === 'removed'
                          ? 'count-removed'
                          : countKey === 'changed'
                            ? 'count-changed'
                            : undefined
                  }
                >
                  {buttonCount ?? 0}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {hasActions ? (
        <div className="results-actions">
          <button
            id="print-results"
            type="button"
            className="ghost-button"
            onClick={handlePrint}
            disabled={disabled || counts.all === 0}
          >
            印刷
          </button>
          {visibleGroups.map(group => {
            const buttons: ReactNode[] = [];
            if (group.handlers.csv) {
              buttons.push(
                <button
                  key={`${group.source}-csv`}
                  type="button"
                  className="outline-button"
                  onClick={group.handlers.csv}
                  disabled={disabled || counts.all === 0}
                >
                  CSVエクスポート
                </button>
              );
            }
            if (group.handlers.eco) {
              buttons.push(
                <button
                  key={`${group.source}-eco`}
                  type="button"
                  className="outline-button"
                  onClick={group.handlers.eco}
                  disabled={disabled || counts.all === 0}
                >
                  ECOエクスポート
                </button>
              );
            }
            if (group.handlers.ccf) {
              buttons.push(
                <button
                  key={`${group.source}-ccf`}
                  type="button"
                  className="outline-button"
                  onClick={group.handlers.ccf}
                  disabled={disabled || counts.all === 0}
                >
                  CCFエクスポート
                </button>
              );
            }
            if (group.handlers.msf) {
              buttons.push(
                <button
                  key={`${group.source}-msf`}
                  type="button"
                  className="outline-button"
                  onClick={group.handlers.msf}
                  disabled={disabled || counts.all === 0}
                >
                  MSFエクスポート
                </button>
              );
            }

            if (buttons.length === 0) {
              return null;
            }

            return (
              <div className="results-export-group" data-export-source={group.source} key={group.source}>
                <span className="results-export-title">{group.label}</span>
                <div className="results-export-buttons">{buttons}</div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
