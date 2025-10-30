import { useMemo } from 'react';
import type { ReactNode } from 'react';
import type { ExportGroupConfig } from './exportTypes';

interface ResultsActionBarProps {
  onPrint?: () => void;
  exportGroups?: ExportGroupConfig[];
  disabled?: boolean;
  hasData?: boolean;
  showPrint?: boolean;
}

const hasHandlers = (group: ExportGroupConfig): boolean =>
  Object.values(group.handlers).some(handler => typeof handler === 'function');

export function ResultsActionBar({
  onPrint,
  exportGroups,
  disabled = false,
  hasData = true,
  showPrint = true
}: ResultsActionBarProps) {
  const visibleGroups = useMemo(() => {
    if (!exportGroups) return [];
    return exportGroups.filter(group => {
      if (group.visible === undefined) return hasHandlers(group);
      return group.visible && hasHandlers(group);
    });
  }, [exportGroups]);

  const actionsDisabled = disabled || !hasData;
  const hasAnyAction = (showPrint && Boolean(onPrint)) || visibleGroups.length > 0;
  if (!hasAnyAction) {
    return null;
  }

  const handlePrint = () => {
    if (actionsDisabled) return;
    if (onPrint) {
      onPrint();
    } else if (typeof window !== 'undefined') {
      window.print();
    }
  };

  return (
    <div className="results-actions">
      {showPrint ? (
        <button
          id="print-results"
          type="button"
          className="ghost-button"
          onClick={handlePrint}
          disabled={actionsDisabled}
        >
          印刷
        </button>
      ) : null}
      {visibleGroups.map(group => {
        const buttons: ReactNode[] = [];
        if (group.handlers.csv) {
          buttons.push(
            <button
              key={`${group.source}-csv`}
              type="button"
              className="outline-button"
              onClick={group.handlers.csv}
              disabled={actionsDisabled}
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
              disabled={actionsDisabled}
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
              disabled={actionsDisabled}
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
              disabled={actionsDisabled}
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
  );
}

