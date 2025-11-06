import { memo, useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { ColumnRole, DatasetKey } from '../types';
import type { EditModalDataset, EditPreprocessOptions } from '../components/EditModal';
import { EditModal } from '../components/EditModal';

interface FindReplaceState {
  find: string;
  replace: string;
}

interface HighlightedCellState {
  dataset: DatasetKey;
  row: number;
  column: number;
}

interface EditWorkspaceProps {
  open: boolean;
  activeDataset: DatasetKey;
  datasets: Partial<Record<DatasetKey, EditModalDataset | null>>;
  onOpenChange: (open: boolean) => void;
  onDatasetChange: (dataset: DatasetKey) => void;
  onCellChange: (dataset: DatasetKey, rowIndex: number, columnIndex: number, value: string) => void;
  onHeaderRoleChange: (dataset: DatasetKey, columnId: string, role: ColumnRole | null) => void;
  onApply: (dataset: DatasetKey) => void;
  onClose: () => void;
  onApplyReplace: (dataset: DatasetKey, payload: FindReplaceState) => void;
  onApplyPreprocess: (dataset: DatasetKey, options: EditPreprocessOptions) => void;
  onCellFocus: (dataset: DatasetKey, row: number, column: number) => void;
  findReplaceValues: Record<DatasetKey, FindReplaceState>;
  setFindReplaceValues: Dispatch<SetStateAction<Record<DatasetKey, FindReplaceState>>>;
  preprocessOptions: Record<DatasetKey, EditPreprocessOptions>;
  setPreprocessOptions: Dispatch<SetStateAction<Record<DatasetKey, EditPreprocessOptions>>>;
  defaultPreprocessTemplate: EditPreprocessOptions;
  formatRulesVisible: Record<DatasetKey, boolean>;
  setFormatRulesVisible: Dispatch<SetStateAction<Record<DatasetKey, boolean>>>;
  highlightedCell: HighlightedCellState | null;
  setHighlightedCell: (value: HighlightedCellState | null) => void;
  isProcessing: boolean;
}

export const EditWorkspace = memo(function EditWorkspace({
  open,
  activeDataset,
  datasets,
  onOpenChange,
  onDatasetChange,
  onCellChange,
  onHeaderRoleChange,
  onApply,
  onClose,
  onApplyReplace,
  onApplyPreprocess,
  onCellFocus,
  findReplaceValues,
  setFindReplaceValues,
  preprocessOptions,
  setPreprocessOptions,
  defaultPreprocessTemplate,
  formatRulesVisible,
  setFormatRulesVisible,
  highlightedCell,
  setHighlightedCell,
  isProcessing
}: EditWorkspaceProps) {
  const handleFindReplaceChange = useCallback(
    (dataset: DatasetKey, payload: FindReplaceState) => {
      setFindReplaceValues(prev => ({ ...prev, [dataset]: payload }));
    },
    [setFindReplaceValues]
  );

  const handlePreprocessOptionChange = useCallback(
    (dataset: DatasetKey, option: keyof EditPreprocessOptions, value: boolean) => {
      setPreprocessOptions(prev => ({
        ...prev,
        [dataset]: {
          ...(prev[dataset] ?? { ...defaultPreprocessTemplate }),
          [option]: value
        }
      }));
    },
    [defaultPreprocessTemplate, setPreprocessOptions]
  );

  const handleToggleFormatRules = useCallback(
    (dataset: DatasetKey, visible: boolean) => {
      setFormatRulesVisible(prev => ({ ...prev, [dataset]: visible }));
    },
    [setFormatRulesVisible]
  );

  const handleWarningCellClick = useCallback(
    (dataset: DatasetKey, row: number, column: number) => {
      onDatasetChange(dataset);
      setHighlightedCell({ dataset, row, column });
    },
    [onDatasetChange, setHighlightedCell]
  );

  const modalHighlightedCell = useMemo(() => {
    if (!highlightedCell || highlightedCell.dataset !== activeDataset) {
      return null;
    }
    return { row: highlightedCell.row, column: highlightedCell.column };
  }, [activeDataset, highlightedCell]);

  return (
    <EditModal
      open={open}
      activeDataset={activeDataset}
      datasets={datasets}
      onOpenChange={onOpenChange}
      onDatasetChange={onDatasetChange}
      onCellChange={onCellChange}
      onHeaderRoleChange={onHeaderRoleChange}
      onApply={onApply}
      onClose={onClose}
      onApplyReplace={onApplyReplace}
      onApplyPreprocess={onApplyPreprocess}
      findReplaceValues={findReplaceValues}
      preprocessOptions={preprocessOptions}
      onCellFocus={onCellFocus}
      onFindReplaceChange={handleFindReplaceChange}
      onPreprocessOptionChange={handlePreprocessOptionChange}
      formatRulesVisible={formatRulesVisible}
      onToggleFormatRules={handleToggleFormatRules}
      highlightedCell={modalHighlightedCell}
      onWarningCellClick={handleWarningCellClick}
      applying={isProcessing}
    />
  );
});
