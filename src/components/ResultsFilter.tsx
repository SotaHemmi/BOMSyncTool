import { useMemo } from 'react';
import type { ExportGroupConfig } from './exportTypes';
import { ResultsActionBar } from './ResultsActionBar';

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
  filtersEnabled?: boolean;
  availableFilters?: ResultsFilterType[];
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
  disabled = false,
  filtersEnabled = true,
  availableFilters
}: ResultsFilterProps) {
  const groups = useMemo(() => exportGroups ?? [], [exportGroups]);
  const visibleButtons = useMemo(() => {
    if (!availableFilters || availableFilters.length === 0) {
      return FILTER_BUTTONS;
    }
    const allowed = new Set(availableFilters);
    return FILTER_BUTTONS.filter(button => allowed.has(button.key));
  }, [availableFilters]);
  const isInteractive = filtersEnabled && !disabled;
  const handleFilterClick = (next: ResultsFilterType) => {
    if (!isInteractive) return;
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
        {visibleButtons.map(({ key, id, label, className, countKey }) => {
          const buttonCount = countKey ? counts[countKey] : undefined;
          return (
            <button
              key={key}
              id={id}
              type="button"
              className={`filter-button${className ? ` ${className}` : ''}${filter === key ? ' is-active' : ''}`}
              onClick={() => handleFilterClick(key)}
              disabled={disabled || !filtersEnabled}
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

      <ResultsActionBar
        onPrint={handlePrint}
        exportGroups={groups}
        disabled={disabled}
        hasData={counts.all > 0}
      />
    </div>
  );
}
