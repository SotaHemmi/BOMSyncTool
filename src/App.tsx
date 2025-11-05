/**
 * BOMSyncTool - Reactメインアプリ
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ColumnRole, DatasetKey, DiffRow, ParseResult } from './types';
import { ProjectTabs } from './components/ProjectTabs';
import { BOMCompare } from './components/BOMCompare';
import { CompareResults, type NormalizedStatus } from './components/CompareResults';
import type { ResultsFilterType } from './components/ResultsFilter';
import {
  EditModal,
  type EditModalDataset,
  type EditPreprocessOptions
} from './components/EditModal';
import { SettingsModal, type SettingsTabKey } from './components/SettingsModal';
import type { DictionaryTabProps } from './components/DictionaryTab';
import { ProjectPanel } from './components/ProjectPanel';
import { ActivityLog } from './components/ActivityLog';
import { useProjects } from './hooks/useProjects';
import { useBOMData } from './hooks/useBOMData';
import { useSettings } from './hooks/useSettings';
import { useDictionary } from './hooks/useDictionary';
import { useActivityLog } from './hooks/useActivityLog';
import { compareBoms, updateAndAppendBoms, openProjectInNewWindow } from './services';
import { deriveColumns } from './components/DatasetCard';
import type { ExportGroupConfig } from './components/exportTypes';
import { formatDateLabel } from './utils';
import type { PreprocessOptions } from './core/preprocessing';
import { datasetState, setCurrentDiffs, setMergedBom } from './state/app-state';
import {
  exportToCCF,
  exportToCSV,
  exportToECO,
  exportToMSF,
  type ExportSource
} from './core/export-handler';
import { cloneRows } from './utils/data-utils';
import { GearIcon } from './components/icons';
import './styles.css';

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

const DEFAULT_EDIT_PREPROCESS: EditPreprocessOptions = {
  expandReference: false,
  splitReferenceRows: false,
  fillBlankCells: false,
  cleanseTextData: false,
  applyFormatRules: false
};

const createDefaultFindReplace = () => ({ find: '', replace: '' });

function App() {
  const projects = useProjects();
  const bomA = useBOMData('a');
  const bomB = useBOMData('b');
  const settings = useSettings();
  const dictionary = useDictionary();
  const activityLog = useActivityLog();

  const activeProject = useMemo(
    () =>
      projects.activeProjectId
        ? projects.projects.find(project => project.id === projects.activeProjectId) ?? null
        : null,
    [projects.activeProjectId, projects.projects]
  );
  const lastSyncedProjectRef = useRef<{ id: string | null; savedAt: string | null }>({
    id: null,
    savedAt: null
  });

  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTabKey>('projects');
  const [diffResults, setDiffResults] = useState<DiffRow[] | null>(null);
  const [resultMode, setResultMode] = useState<'comparison' | 'replacement' | null>(null);
  const [replacementResult, setReplacementResult] = useState<ParseResult | null>(null);
  const [replacementStatuses, setReplacementStatuses] = useState<NormalizedStatus[] | null>(null);
  const [resultsFilter, setResultsFilter] = useState<ResultsFilterType>('diff');
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingDatasets, setLoadingDatasets] = useState<Record<DatasetKey, boolean>>({
    a: false,
    b: false
  });

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
    (dataset: DatasetKey) => (dataset === 'a' ? bomA : bomB),
    [bomA, bomB]
  );

  const defaultPreprocessOptions = useMemo(() => {
    const defaults =
      settings.settings.defaultPreprocess ?? {
        expandReference: true,
        splitReferenceRows: false,
        fillBlankCells: true,
        cleanseTextData: true,
        applyFormatRules: false
      };
    return {
      expandRef: defaults.expandReference,
      splitRef: defaults.splitReferenceRows,
      fillBlank: defaults.fillBlankCells,
      cleanse: defaults.cleanseTextData,
      formatRules: defaults.applyFormatRules,
      formatOptions: {
        use_strikethrough: false,
        use_cell_color: true
      }
    };
  }, [settings.settings.defaultPreprocess]);

  const syncDatasetsFromState = useCallback(() => {
    const stateA = datasetState.a;
    if (stateA.parseResult) {
      bomA.updateFromParseResult(stateA.parseResult, stateA.fileName);
    } else {
      bomA.reset();
    }

    const stateB = datasetState.b;
    if (stateB.parseResult) {
      bomB.updateFromParseResult(stateB.parseResult, stateB.fileName);
    } else {
      bomB.reset();
    }
  }, [bomA, bomB]);

  const handleApplyDictionaryToBOM = useCallback(() => {
    void (async () => {
      const applied = await dictionary.applyRegistrationToBOM();
      if (applied > 0) {
        syncDatasetsFromState();
        projects.saveProject();
      }
    })();
  }, [dictionary, projects.saveProject, syncDatasetsFromState]);

  const syncDatasetsFromStateRef = useRef(syncDatasetsFromState);

  useEffect(() => {
    syncDatasetsFromStateRef.current = syncDatasetsFromState;
  }, [syncDatasetsFromState]);

  useEffect(() => {
    const handleDataLoaded = () => {
      syncDatasetsFromStateRef.current();
    };
    window.addEventListener('bomsync:dataLoaded', handleDataLoaded);
    return () => {
      window.removeEventListener('bomsync:dataLoaded', handleDataLoaded);
    };
  }, []); // 空の依存配列

  useEffect(() => {
    if (!activeProject) {
      if (bomA.parseResult) {
        bomA.reset();
      }
      if (bomB.parseResult) {
        bomB.reset();
      }
      setDiffResults(null);
      setResultMode(null);
      setReplacementResult(null);
      setReplacementStatuses(null);
      setCurrentDiffs([]);
      setMergedBom(null);
      lastSyncedProjectRef.current = { id: null, savedAt: null };
      return;
    }

    const { id, data, name } = activeProject;
    const savedAt = data.savedAt;
    const previous = lastSyncedProjectRef.current;

    // プロジェクトIDが変わった時だけ状態をリセット（自動保存時は保持）
    if (previous.id === id) {
      // 同じプロジェクトの場合、savedAtが変わっても状態を保持
      lastSyncedProjectRef.current = { id, savedAt };
      return;
    }

    // 異なるプロジェクトに切り替わった場合のみリセット
    if (data.bomA) {
      bomA.updateFromParseResult(data.bomA, name);
    } else if (bomA.parseResult) {
      bomA.reset();
    }

    if (data.bomB) {
      bomB.updateFromParseResult(data.bomB, name);
    } else if (bomB.parseResult) {
      bomB.reset();
    }

    setDiffResults(null);
    setResultMode(null);
    setReplacementResult(null);
    setReplacementStatuses(null);
    setCurrentDiffs([]);
    setMergedBom(null);
    lastSyncedProjectRef.current = { id, savedAt };
  }, [activeProject, bomA, bomB]);

  const handleLoadFile = useCallback(
    async (
      dataset: DatasetKey,
      loader: (path: string, displayName?: string) => Promise<void>,
      path: string,
      displayName?: string
    ) => {
      setLoadingDatasets(prev => ({ ...prev, [dataset]: true }));
      try {
        await loader(path, displayName);
        setDiffResults(null);
        setReplacementResult(null);
        setReplacementStatuses(null);
        setResultMode(null);
        setCurrentDiffs([]);
        setMergedBom(null);
        setResultsFilter('diff');
        projects.saveProject();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        alert(`ファイルの読み込みに失敗しました: ${message}`);
      } finally {
        setLoadingDatasets(prev => ({ ...prev, [dataset]: false }));
      }
    },
    [projects.saveProject]
  );

  const handleApplyDefaultPreprocess = useCallback(
    async (apply: (options: typeof defaultPreprocessOptions) => Promise<void>) => {
      setIsProcessing(true);
      try {
        await apply(defaultPreprocessOptions);
        projects.saveProject();
        alert('デフォルト前処理を適用しました。');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        alert(`前処理の適用に失敗しました: ${message}`);
      } finally {
        setIsProcessing(false);
      }
    },
    [defaultPreprocessOptions, projects.saveProject]
  );

  const handleCompare = useCallback(async () => {
    if (!bomA.parseResult || !bomB.parseResult) {
      alert('両方のBOMを読み込んでから比較してください。');
      return;
    }
    setIsProcessing(true);
    setMergedBom(null);
    setReplacementResult(null);
    setReplacementStatuses(null);
    try {
      const diffs = await compareBoms(bomA.parseResult, bomB.parseResult);
      setDiffResults(diffs);
      setResultsFilter('diff');
      setCurrentDiffs(diffs);
      setResultMode('comparison');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`比較に失敗しました: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [bomA.parseResult, bomB.parseResult]);

  const handleReplace = useCallback(async () => {
    if (!bomA.parseResult || !bomB.parseResult) {
      alert('両方のBOMを読み込んでから置き換えを実行してください。');
      return;
    }
    setIsProcessing(true);
    try {
      const sourceA = bomA.parseResult;
      const sourceB = bomB.parseResult;
      const diffs = await compareBoms(sourceA, sourceB);
      const normalizeStatusValue = (status: string | undefined | null): NormalizedStatus => {
        if (!status) return 'other';
        const value = status.toLowerCase();
        if (value === 'added') return 'added';
        if (value === 'remove' || value === 'removed' || value === 'delete' || value === 'deleted') {
          return 'removed';
        }
        if (
          value === 'modified' ||
          value === 'modify' ||
          value === 'change' ||
          value === 'changed' ||
          value === 'diff'
        ) {
          return 'modified';
        }
        if (value === 'same' || value === 'identical' || value === 'unchanged') {
          return 'unchanged';
        }
        return 'other';
      };

      const normalizedDiffs = diffs.map(diff => ({
        ...diff,
        normalized: normalizeStatusValue(diff.status)
      }));
      const hasChanges = normalizedDiffs.some(diff => diff.normalized !== 'unchanged');

      const merged = await updateAndAppendBoms(sourceA, sourceB);

      const baseRowCount = sourceA.rows.length;
      const statuses: NormalizedStatus[] = new Array(merged.rows.length).fill('unchanged');

      normalizedDiffs.forEach(diff => {
        if (diff.a_index !== null && diff.a_index < baseRowCount) {
          statuses[diff.a_index] = diff.normalized;
        }
      });

      const addedDiffs = normalizedDiffs
        .filter(diff => diff.normalized === 'added')
        .sort((a, b) => (a.b_index ?? 0) - (b.b_index ?? 0));

      addedDiffs.forEach((_, order) => {
        const targetIndex = baseRowCount + order;
        if (targetIndex < statuses.length) {
          statuses[targetIndex] = 'added';
        }
      });

      setDiffResults(null);
      setCurrentDiffs([]);
      setMergedBom(merged);
      setReplacementResult(merged);
      setReplacementStatuses(statuses);
      setResultMode('replacement');
      if (hasChanges) {
        projects.saveProject();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`置き換えに失敗しました: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [bomA, bomB, projects.saveProject]);

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
        projects.saveProject();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        alert(`前処理の適用に失敗しました: ${message}`);
      } finally {
        setIsProcessing(false);
      }
    },
    [getBom, projects.saveProject]
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
      projects.saveProject();
    },
    [editRows, getBom, projects]
  );

  const handleProjectTabChange = useCallback(
    (projectId: string) => {
      if (!projects.loadProject(projectId)) {
        alert('プロジェクトの読み込みに失敗しました。');
      }
    },
    [projects]
  );

  const handleOpenProjectInNewWindow = useCallback(
    async (projectId: string) => {
      try {
        await openProjectInNewWindow(projectId);
        // Activity log removed
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        alert(`ウィンドウを開けませんでした: ${message}`);
      }
    },
    [activityLog]
  );

  const runExport = useCallback(
    async (runner: () => Promise<void>) => {
      setIsProcessing(true);
      try {
        await runner();
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  const makeExportHandler = useCallback(
    (source: ExportSource, exporter: (source: ExportSource) => Promise<void>) => () => {
      void runExport(() => exporter(source));
    },
    [runExport]
  );

  const hasComparisonExport = diffResults !== null && diffResults.length > 0;
  const hasReplacementExport = Boolean(replacementResult && replacementResult.rows.length > 0);
  const activeResultMode =
    resultMode ?? (hasComparisonExport ? 'comparison' : hasReplacementExport ? 'replacement' : null);

  const exportGroups = useMemo<ExportGroupConfig[]>(
    () => [
      {
        source: 'comparison',
        label: '比較結果をエクスポート',
        handlers: {
          csv: makeExportHandler('comparison', exportToCSV)
        },
        visible: resultMode === 'comparison' && hasComparisonExport
      },
      {
        source: 'replacement',
        label: '置き換え結果をエクスポート',
        handlers: {
          csv: makeExportHandler('replacement', exportToCSV),
          eco: makeExportHandler('replacement', exportToECO),
          ccf: makeExportHandler('replacement', exportToCCF),
          msf: makeExportHandler('replacement', exportToMSF)
        },
        visible: resultMode === 'replacement' && hasReplacementExport
      }
    ],
    [hasComparisonExport, hasReplacementExport, makeExportHandler, resultMode]
  );

  const handleEditCellFocus = useCallback((dataset: DatasetKey, row: number, column: number) => {
    setEditHighlightedCell({ dataset, row, column });
  }, []);

  const editDatasets = useMemo<Partial<Record<DatasetKey, EditModalDataset | null>>>(() => {
    const buildDataset = (dataset: DatasetKey, parse: ParseResult | null, fileName: string | null, lastUpdated: string | null, columnRoles: Record<string, ColumnRole>) => {
      if (!parse) return null;
      const columns = deriveColumns(parse);
      const rows =
        editRows[dataset] && editRows[dataset].length > 0
          ? editRows[dataset]
          : cloneRows(parse.rows);
      const headerRoles =
        editHeaderRoles[dataset] && Object.keys(editHeaderRoles[dataset]).length > 0
          ? editHeaderRoles[dataset]
          : { ...columnRoles };
      return {
        dataset,
        columns,
        rows,
        headerRoles,
        structuredErrors: parse.structured_errors ?? [],
        fileName,
        lastUpdated
      };
    };

    return {
      a: buildDataset('a', bomA.parseResult, bomA.fileName, bomA.lastUpdated ?? null, bomA.columnRoles),
      b: buildDataset('b', bomB.parseResult, bomB.fileName, bomB.lastUpdated ?? null, bomB.columnRoles)
    };
  }, [bomA.parseResult, bomA.fileName, bomA.lastUpdated, bomA.columnRoles, bomB.parseResult, bomB.fileName, bomB.lastUpdated, bomB.columnRoles, editHeaderRoles, editRows]);

  const datasetAdapterA = useMemo(() => ({
    dataset: 'a' as DatasetKey,
    parseResult: bomA.parseResult,
    fileName: bomA.fileName,
    lastUpdated: bomA.lastUpdated ?? undefined,
    columnRoles: bomA.columnRoles,
    errors: bomA.errors,
    statusText: bomA.lastUpdated ? formatDateLabel(bomA.lastUpdated) : bomA.fileName ?? '未読み込み',
    isLoading: loadingDatasets.a,
    loadFile: (path: string, displayName?: string) => handleLoadFile('a', bomA.loadFile, path, displayName),
    setColumnRole: (role: ColumnRole, columnId: string | null) => {
      if (!columnId) return;
      bomA.setColumnRoleById(columnId, role);
      projects.saveProject();
    },
    applyDefaultPreprocess: () => handleApplyDefaultPreprocess(bomA.applyPreprocess),
    openEdit: () => handleOpenEdit('a'),
    exportECO: () => runExport(() => exportToECO('bom_a')),
    exportCCF: () => runExport(() => exportToCCF('bom_a')),
    exportMSF: () => runExport(() => exportToMSF('bom_a')),
    handleError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      alert(`BOM A: ${message}`);
    }
  }), [
    bomA.parseResult,
    bomA.fileName,
    bomA.lastUpdated,
    bomA.columnRoles,
    bomA.errors,
    bomA.loadFile,
    bomA.setColumnRoleById,
    bomA.applyPreprocess,
    handleApplyDefaultPreprocess,
    handleLoadFile,
    handleOpenEdit,
    loadingDatasets.a,
    projects.saveProject,
    runExport
  ]);

  const datasetAdapterB = useMemo(() => ({
    dataset: 'b' as DatasetKey,
    parseResult: bomB.parseResult,
    fileName: bomB.fileName,
    lastUpdated: bomB.lastUpdated ?? undefined,
    columnRoles: bomB.columnRoles,
    errors: bomB.errors,
    statusText: bomB.lastUpdated ? formatDateLabel(bomB.lastUpdated) : bomB.fileName ?? '未読み込み',
    isLoading: loadingDatasets.b,
    loadFile: (path: string, displayName?: string) => handleLoadFile('b', bomB.loadFile, path, displayName),
    setColumnRole: (role: ColumnRole, columnId: string | null) => {
      if (!columnId) return;
      bomB.setColumnRoleById(columnId, role);
      projects.saveProject();
    },
    applyDefaultPreprocess: () => handleApplyDefaultPreprocess(bomB.applyPreprocess),
    openEdit: () => handleOpenEdit('b'),
    exportECO: () => runExport(() => exportToECO('bom_b')),
    exportCCF: () => runExport(() => exportToCCF('bom_b')),
    exportMSF: () => runExport(() => exportToMSF('bom_b')),
    handleError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      alert(`BOM B: ${message}`);
    }
  }), [
    bomB.parseResult,
    bomB.fileName,
    bomB.lastUpdated,
    bomB.columnRoles,
    bomB.errors,
    bomB.loadFile,
    bomB.setColumnRoleById,
    bomB.applyPreprocess,
    handleApplyDefaultPreprocess,
    handleLoadFile,
    handleOpenEdit,
    loadingDatasets.b,
    projects.saveProject,
    runExport
  ]);

  const dictionaryProps: DictionaryTabProps = useMemo(
    () => ({
      activeTab: dictionary.activeTab,
      registrationEntries: dictionary.registrationEntries,
      exceptionEntries: dictionary.exceptionEntries,
      onTabChange: dictionary.setActiveTab,
      onLoadDictionary: () => void dictionary.loadDictionaryFile(),
      onSaveDictionary: () => void dictionary.saveDictionaryFile(),
      onImportDictionary: () => void dictionary.importDictionaryFile(),
      onExportDictionary: () => void dictionary.exportDictionaryFile(),
      onExtractFromBOM: () => void dictionary.extractFromBOM(),
      onAddRegistration: dictionary.addRegistration,
      onRegistrationFieldChange: dictionary.updateRegistration,
      onRemoveRegistration: dictionary.removeRegistration,
      onImportRegistrationCSV: () => void dictionary.importRegistrationCSV(),
      onExportRegistrationCSV: () => void dictionary.exportRegistrationCSV(),
      onApplyRegistrationToBOM: handleApplyDictionaryToBOM,
      onAddException: dictionary.addException,
      onExceptionFieldChange: dictionary.updateException,
      onRemoveException: dictionary.removeException,
      onImportExceptionCSV: () => void dictionary.importExceptionCSV(),
      onExportExceptionCSV: () => void dictionary.exportExceptionCSV(),
      onApplyExceptionToBOM: handleApplyDictionaryToBOM,
      isProcessing
    }),
    [dictionary, handleApplyDictionaryToBOM, isProcessing]
  );

  const handleSettingsSave = useCallback(() => {
    settings.applyTheme();
    setSettingsModalOpen(false);
  }, [settings]);

  return (
    <main className="app-shell">
      <header className="shell-header">
        <div className="brand">
          <h1>
            BOMSyncTool
            <span className="brand-version" aria-label="version 0.4.1">
              v0.4.1
            </span>
          </h1>
        </div>
        <div className="header-actions">
          <button
            className="icon-button"
            id="open-settings"
            aria-label="設定を開く"
            data-tooltip="アプリ全体の設定や辞書を管理します"
            onClick={() => setSettingsModalOpen(true)}
          >
            <GearIcon />
          </button>
        </div>
      </header>

      <ProjectTabs
        projects={projects.projects}
        activeProjectId={projects.activeProjectId}
        favoriteProjects={projects.favoriteProjects}
        onTabChange={handleProjectTabChange}
        onTabClose={projects.deleteProject}
        onNewTab={() => projects.createProject()}
        onToggleFavorite={projects.toggleFavorite}
        onTabReorder={projects.reorderProject}
        onRename={projects.renameProject}
        onOpenInNewWindow={handleOpenProjectInNewWindow}
      />

      <BOMCompare
        datasetA={datasetAdapterA}
        datasetB={datasetAdapterB}
        onCompare={handleCompare}
        onReplace={handleReplace}
        isProcessing={isProcessing}
      />

      <CompareResults
        results={diffResults}
        filter={resultsFilter}
        onFilterChange={setResultsFilter}
        parseA={bomA.parseResult}
        parseB={bomB.parseResult}
        onPrint={() => window.print()}
        exportGroups={exportGroups}
        isLoading={isProcessing}
        mode={activeResultMode}
        replacementResult={replacementResult}
        replacementStatuses={replacementStatuses}
      />

      <div className="supplementary-panel">
        <ProjectPanel
          projects={projects.projects}
          favorites={projects.favoriteProjects}
          favoriteArchive={projects.favoriteArchive}
          activeProjectId={projects.activeProjectId}
          onProjectClick={handleProjectTabChange}
          onToggleFavorite={projects.toggleFavorite}
          onRename={(projectId, name) => {
            const success = projects.renameProject(projectId, name);
            if (!success) {
              alert('タブ名の変更に失敗しました。');
            }
          }}
          onDelete={projectId => projects.deleteProject(projectId)}
        />
        <ActivityLog logs={activityLog.logs} onClear={activityLog.clear} />
      </div>

      <EditModal
        open={editModalOpen}
        activeDataset={editActiveDataset}
        datasets={editDatasets}
        onOpenChange={setEditModalOpen}
        onDatasetChange={setEditActiveDataset}
        onCellChange={handleEditCellChange}
        onHeaderRoleChange={handleEditHeaderRoleChange}
        onApply={handleEditApply}
        onClose={() => setEditModalOpen(false)}
        onApplyReplace={handleEditApplyReplace}
      onApplyPreprocess={handleEditApplyPreprocess}
      findReplaceValues={editFindReplace}
      preprocessOptions={editPreprocessOptionsState}
      onCellFocus={handleEditCellFocus}
        onFindReplaceChange={(dataset, payload) =>
          setEditFindReplace(prev => ({ ...prev, [dataset]: payload }))
        }
        onPreprocessOptionChange={(dataset, option, value) =>
          setEditPreprocessOptionsState(prev => ({
            ...prev,
            [dataset]: {
              ...((prev[dataset] as EditPreprocessOptions | undefined) ?? { ...DEFAULT_EDIT_PREPROCESS }),
              [option]: value
            }
          }))
        }
        formatRulesVisible={formatRulesVisible}
        onToggleFormatRules={(dataset, visible) =>
          setFormatRulesVisible(prev => ({ ...prev, [dataset]: visible }))
        }
        highlightedCell={
          editHighlightedCell && editHighlightedCell.dataset === editActiveDataset
            ? { row: editHighlightedCell.row, column: editHighlightedCell.column }
            : null
        }
        onWarningCellClick={(dataset, row, column) => {
          setEditActiveDataset(dataset);
          setEditHighlightedCell({ dataset, row, column });
        }}
        applying={isProcessing}
      />

      <SettingsModal
        open={settingsModalOpen}
        activeTab={settingsTab}
        onOpenChange={setSettingsModalOpen}
        onTabChange={setSettingsTab}
        projectSettings={settings.settings}
        onDefaultPreprocessChange={(option, value) => {
          const current =
            settings.settings.defaultPreprocess ?? {
              expandReference: true,
              splitReferenceRows: false,
              fillBlankCells: true,
              cleanseTextData: true,
              applyFormatRules: false
            };
          settings.setDefaultPreprocess({
            ...current,
            [option]: value
          });
        }}
        themeColors={settings.theme}
        onThemeColorChange={(color, value) =>
          settings.updateTheme({ [color]: value } as Partial<typeof settings.theme>)
        }
        onResetTheme={settings.resetTheme}
        onSave={handleSettingsSave}
        onCancel={() => setSettingsModalOpen(false)}
        dictionaryProps={dictionaryProps}
        isSaving={isProcessing}
      />
    </main>
  );
}

export default App;
