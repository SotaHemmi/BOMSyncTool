import { useCallback, useMemo, useState } from 'react';
import type { ColumnRole, DatasetKey, ParseResult } from '../types';
import type { EditModalDataset, EditPreprocessOptions } from '../components/EditModal';
import type { UseBOMDataResult } from './useBOMData';
import type { PreprocessOptions } from '../core/preprocessing';
import { deriveColumns } from '../core/bom-columns';
import { cloneRows } from '../utils/data-utils';

const toPreprocessOptions = (options: EditPreprocessOptions): PreprocessOptions => ({
  expandRef: options.expandReference,
  splitRef: options.splitReferenceRows,
  fillBlank: options.fillBlankCells,
  cleanse: options.cleanseTextData,
  formatRules: options.applyFormatRules,
  formatOptions: {
    use_strikethrough: false,
    use_cell_color: true
  }
});

const createDefaultFindReplace = () => ({ find: '', replace: '' });

export const DEFAULT_EDIT_PREPROCESS: EditPreprocessOptions = {
  expandReference: false,
  splitReferenceRows: false,
  fillBlankCells: false,
  cleanseTextData: false,
  applyFormatRules: false
};

interface UseEditModalParams {
  bomA: UseBOMDataResult;
  bomB: UseBOMDataResult;
  defaultPreprocessOptions: PreprocessOptions;
  onSave: () => void;
  setIsProcessing: (value: boolean) => void;
}

export function useEditModal({
  bomA,
  bomB,
  defaultPreprocessOptions,
  onSave,
  setIsProcessing
}: UseEditModalParams) {
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editActiveDataset, setEditActiveDataset] = useState<DatasetKey>('a');
  const [editRows, setEditRows] = useState<Record<DatasetKey, string[][]>>({ a: [], b: [] });
  const [editHeaderRoles, setEditHeaderRoles] = useState<Record<DatasetKey, Record<string, ColumnRole>>>({
    a: {},
    b: {}
  });
  const [editHighlightedCell, setEditHighlightedCell] =
    useState<{ dataset: DatasetKey; row: number; column: number } | null>(null);
  const [formatRulesVisible, setFormatRulesVisible] = useState<Record<DatasetKey, boolean>>({
    a: false,
    b: false
  });
  const [editFindReplace, setEditFindReplace] = useState<Record<DatasetKey, { find: string; replace: string }>>({
    a: createDefaultFindReplace(),
    b: createDefaultFindReplace()
  });
  const [editPreprocessOptionsState, setEditPreprocessOptionsState] =
    useState<Record<DatasetKey, EditPreprocessOptions>>({
      a: { ...DEFAULT_EDIT_PREPROCESS },
      b: { ...DEFAULT_EDIT_PREPROCESS }
    });

  const getBom = useCallback(
    (dataset: DatasetKey): UseBOMDataResult => (dataset === 'a' ? bomA : bomB),
    [bomA, bomB]
  );

  const convertPreprocessToEdit = useCallback(
    (options: PreprocessOptions): EditPreprocessOptions => ({
      expandReference: Boolean(options.expandRef),
      splitReferenceRows: Boolean(options.splitRef),
      fillBlankCells: Boolean(options.fillBlank),
      cleanseTextData: Boolean(options.cleanse),
      applyFormatRules: Boolean(options.formatRules)
    }),
    []
  );

  const prepareEditState = useCallback(
    (dataset: DatasetKey) => {
      const bom = getBom(dataset);
      if (!bom.parseResult) {
        return false;
      }

      setEditRows(prev => ({
        ...prev,
        [dataset]: cloneRows(bom.parseResult!.rows)
      }));
      setEditHeaderRoles(prev => ({
        ...prev,
        [dataset]: { ...bom.columnRoles }
      }));
      setEditFindReplace(prev => ({
        ...prev,
        [dataset]: createDefaultFindReplace()
      }));
      setEditPreprocessOptionsState(prev => ({
        ...prev,
        [dataset]: convertPreprocessToEdit(defaultPreprocessOptions)
      }));
      return true;
    },
    [convertPreprocessToEdit, defaultPreprocessOptions, getBom]
  );

  const handleOpenEdit = useCallback(
    (dataset: DatasetKey) => {
      const opened = prepareEditState(dataset);
      const other: DatasetKey = dataset === 'a' ? 'b' : 'a';
      prepareEditState(other);

      if (!opened) {
        alert(`${dataset.toUpperCase()} のデータが読み込まれていません。`);
        return;
      }

      setEditActiveDataset(dataset);
      setEditHighlightedCell(null);
      setFormatRulesVisible({ a: false, b: false });
      setEditModalOpen(true);
    },
    [prepareEditState]
  );

  const handleEditCellChange = useCallback(
    (dataset: DatasetKey, rowIndex: number, columnIndex: number, value: string) => {
      setEditRows(prev => {
        const baseRows =
          prev[dataset] && prev[dataset].length > 0
            ? prev[dataset].map(row => [...row])
            : cloneRows(getBom(dataset).parseResult?.rows ?? []);
        if (!baseRows[rowIndex]) {
          baseRows[rowIndex] = [];
        }
        baseRows[rowIndex] = [...baseRows[rowIndex]];
        baseRows[rowIndex][columnIndex] = value;
        return { ...prev, [dataset]: baseRows };
      });
    },
    [getBom]
  );

  const handleEditHeaderRoleChange = useCallback(
    (dataset: DatasetKey, columnId: string, role: ColumnRole | null) => {
      if (!columnId) return;
      setEditHeaderRoles(prev => {
        const next = { ...(prev[dataset] ?? {}) };
        if (!role) {
          delete next[columnId];
        } else {
          next[columnId] = role;
        }
        return { ...prev, [dataset]: next };
      });
      const bom = getBom(dataset);
      bom.setColumnRoleById(columnId, role);
    },
    [getBom]
  );

  const handleEditApplyReplace = useCallback(
    (dataset: DatasetKey, payload: { find: string; replace: string }) => {
      const find = payload.find;
      if (!find) {
        alert('検索する文字列を入力してください。');
        return;
      }
      const replace = payload.replace ?? '';
      const rowsSource =
        editRows[dataset] && editRows[dataset].length > 0
          ? editRows[dataset]
          : cloneRows(getBom(dataset).parseResult?.rows ?? []);
      const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'g');
      let replacedCount = 0;
      const nextRows = rowsSource.map(row =>
        row.map(cell => {
          if (!cell) return cell;
          const next = cell.replace(regex, () => {
            replacedCount += 1;
            return replace;
          });
          return next;
        })
      );
      if (replacedCount === 0) {
        alert('置換対象が見つかりませんでした。');
        return;
      }
      setEditRows(prev => ({ ...prev, [dataset]: nextRows }));
      setEditFindReplace(prev => ({ ...prev, [dataset]: { find, replace } }));
      alert(`${replacedCount} 箇所を置換しました。`);
    },
    [editRows, getBom]
  );

  const handleEditApplyPreprocess = useCallback(
    async (dataset: DatasetKey, options: EditPreprocessOptions) => {
      const bom = getBom(dataset);
      if (!bom.parseResult) {
        alert(`${dataset.toUpperCase()} のデータが読み込まれていません。`);
        return;
      }
      setIsProcessing(true);
      try {
        await bom.applyPreprocess(toPreprocessOptions(options));
        if (bom.parseResult) {
          setEditRows(prev => ({ ...prev, [dataset]: cloneRows(bom.parseResult!.rows) }));
        }
        setEditPreprocessOptionsState(prev => ({ ...prev, [dataset]: { ...options } }));
        onSave();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        alert(`前処理の適用に失敗しました: ${message}`);
      } finally {
        setIsProcessing(false);
      }
    },
    [getBom, onSave, setIsProcessing]
  );

  const handleEditApply = useCallback(
    (dataset: DatasetKey) => {
      const bom = getBom(dataset);
      const parse = bom.parseResult;
      if (!parse) {
        alert(`${dataset.toUpperCase()} のデータが読み込まれていません。`);
        return;
      }
      const rows =
        editRows[dataset] && editRows[dataset].length > 0
          ? editRows[dataset]
          : cloneRows(parse.rows);
      const filteredErrors = parse.errors.filter(
        message => !message.includes('編集モードで指定してください。')
      );
      const filteredStructured = parse.structured_errors
        ?.filter(error => !error.message.includes('編集モードで指定してください。'));

      const updated: ParseResult = {
        ...parse,
        rows: cloneRows(rows),
        errors: filteredErrors,
        structured_errors: filteredStructured && filteredStructured.length > 0 ? filteredStructured : undefined
      };

      bom.updateFromParseResult(updated, bom.fileName);
      setEditRows(prev => ({ ...prev, [dataset]: cloneRows(rows) }));
      setEditModalOpen(false);

      // 編集内容を自動保存
      onSave();
    },
    [editRows, getBom, onSave]
  );

  const handleEditCellFocus = useCallback((dataset: DatasetKey, row: number, column: number) => {
    setEditHighlightedCell({ dataset, row, column });
  }, []);

  const editRowsA = editRows.a;
  const editRowsB = editRows.b;
  const editHeaderRolesA = editHeaderRoles.a;
  const editHeaderRolesB = editHeaderRoles.b;

  const editDatasetA = useMemo<EditModalDataset | null>(() => {
    const parse = bomA.parseResult;
    if (!parse) {
      return null;
    }

    const columns = deriveColumns(parse);
    const rows = editRowsA && editRowsA.length > 0 ? editRowsA : cloneRows(parse.rows);
    const headerRoles =
      editHeaderRolesA && Object.keys(editHeaderRolesA).length > 0
        ? editHeaderRolesA
        : { ...bomA.columnRoles };

    return {
      dataset: 'a',
      columns,
      rows,
      headerRoles,
      structuredErrors: parse.structured_errors ?? [],
      fileName: bomA.fileName,
      lastUpdated: bomA.lastUpdated ?? null
    };
  }, [bomA.columnRoles, bomA.fileName, bomA.lastUpdated, bomA.parseResult, editHeaderRolesA, editRowsA]);

  const editDatasetB = useMemo<EditModalDataset | null>(() => {
    const parse = bomB.parseResult;
    if (!parse) {
      return null;
    }

    const columns = deriveColumns(parse);
    const rows = editRowsB && editRowsB.length > 0 ? editRowsB : cloneRows(parse.rows);
    const headerRoles =
      editHeaderRolesB && Object.keys(editHeaderRolesB).length > 0
        ? editHeaderRolesB
        : { ...bomB.columnRoles };

    return {
      dataset: 'b',
      columns,
      rows,
      headerRoles,
      structuredErrors: parse.structured_errors ?? [],
      fileName: bomB.fileName,
      lastUpdated: bomB.lastUpdated ?? null
    };
  }, [bomB.columnRoles, bomB.fileName, bomB.lastUpdated, bomB.parseResult, editHeaderRolesB, editRowsB]);

  const editDatasets = useMemo<Partial<Record<DatasetKey, EditModalDataset | null>>>(
    () => ({
      a: editDatasetA,
      b: editDatasetB
    }),
    [editDatasetA, editDatasetB]
  );

  return {
    editModalOpen,
    setEditModalOpen,
    editActiveDataset,
    setEditActiveDataset,
    editDatasets,
    editFindReplace,
    setEditFindReplace,
    editPreprocessOptionsState,
    setEditPreprocessOptionsState,
    formatRulesVisible,
    setFormatRulesVisible,
    editHighlightedCell,
    setEditHighlightedCell,
    handleOpenEdit,
    handleEditCellChange,
    handleEditHeaderRoleChange,
    handleEditApplyReplace,
    handleEditApplyPreprocess,
    handleEditApply,
    handleEditCellFocus
  };
}
