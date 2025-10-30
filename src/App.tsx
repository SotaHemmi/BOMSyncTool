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
import './styles.css';

const cloneRows = (rows: string[][]): string[][] => rows.map(row => [...row]);

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
  const autoSaveDebounceRef = useRef<number | null>(null);

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
      }
    })();
  }, [dictionary, syncDatasetsFromState]);

  useEffect(() => {
    const handleDataLoaded = () => {
      syncDatasetsFromState();
    };
    window.addEventListener('bomsync:dataLoaded', handleDataLoaded);
    return () => {
      window.removeEventListener('bomsync:dataLoaded', handleDataLoaded);
    };
  }, [syncDatasetsFromState]);

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

  useEffect(() => {
    projects.projectSettingsRef.current = settings.settings;
  }, [projects.projectSettingsRef, settings.settings]);

  useEffect(() => {
    projects.startAutoSave(settings.settings.autoIntervalMinutes);
    return () => {
      projects.stopAutoSave();
    };
  }, [settings.settings.autoIntervalMinutes]);

  const scheduleAutoSave = useCallback(() => {
    if (!projects.activeProjectId) {
      return;
    }
    if (autoSaveDebounceRef.current !== null) {
      window.clearTimeout(autoSaveDebounceRef.current);
    }
    autoSaveDebounceRef.current = window.setTimeout(() => {
      projects.saveProject();
      autoSaveDebounceRef.current = null;
    }, 1500);
  }, [projects]);

  useEffect(() => {
    scheduleAutoSave();
    return () => {
      if (autoSaveDebounceRef.current !== null) {
        window.clearTimeout(autoSaveDebounceRef.current);
        autoSaveDebounceRef.current = null;
      }
    };
  }, [
    scheduleAutoSave,
    projects.activeProjectId,
    bomA.parseResult,
    bomA.columnRoles,
    bomA.errors,
    bomA.fileName,
    bomA.lastUpdated,
    bomB.parseResult,
    bomB.columnRoles,
    bomB.errors,
    bomB.fileName,
    bomB.lastUpdated
  ]);

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
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        alert(`ファイルの読み込みに失敗しました: ${message}`);
      } finally {
        setLoadingDatasets(prev => ({ ...prev, [dataset]: false }));
      }
    },
    []
  );

  const handleApplyDefaultPreprocess = useCallback(
    async (apply: (options: typeof defaultPreprocessOptions) => Promise<void>) => {
      setIsProcessing(true);
      try {
        await apply(defaultPreprocessOptions);
        alert('デフォルト前処理を適用しました。');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        alert(`前処理の適用に失敗しました: ${message}`);
      } finally {
        setIsProcessing(false);
      }
    },
    [defaultPreprocessOptions]
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`置き換えに失敗しました: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [bomA, bomB]);

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
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        alert(`前処理の適用に失敗しました: ${message}`);
      } finally {
        setIsProcessing(false);
      }
    },
    [getBom]
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
      const updated: ParseResult = {
        ...parse,
        rows: cloneRows(rows)
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
          csv: makeExportHandler('comparison', exportToCSV),
          eco: makeExportHandler('comparison', exportToECO),
          ccf: makeExportHandler('comparison', exportToCCF),
          msf: makeExportHandler('comparison', exportToMSF)
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
  }, [bomA, bomB, editHeaderRoles, editRows]);

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
    },
    applyDefaultPreprocess: () => handleApplyDefaultPreprocess(bomA.applyPreprocess),
    openEdit: () => handleOpenEdit('a'),
    handleError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      alert(`BOM A: ${message}`);
    }
  }), [
    bomA,
    handleApplyDefaultPreprocess,
    handleLoadFile,
    handleOpenEdit,
    loadingDatasets.a
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
    },
    applyDefaultPreprocess: () => handleApplyDefaultPreprocess(bomB.applyPreprocess),
    openEdit: () => handleOpenEdit('b'),
    handleError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      alert(`BOM B: ${message}`);
    }
  }), [
    bomB,
    handleApplyDefaultPreprocess,
    handleLoadFile,
    handleOpenEdit,
    loadingDatasets.b
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
            <span className="brand-version" aria-label="version 0.3.1">
              v0.3.1
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
            <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
              <path d="M12 8.9a3.1 3.1 0 1 0 0 6.2 3.1 3.1 0 0 0 0-6.2Zm8.94 2.2-1.16-.2a7.14 7.14 0 0 0-.54-1.32l.7-.94a.76.76 0 0 0-.05-.97l-1.38-1.38a.75.75 0 0 0-.97-.06l-.94.7a7.14 7.14 0 0 0-1.32-.54l-.2-1.16A.76.76 0 0 0 14.08 5h-1.95a.76.76 0 0 0-.74.63l-.2 1.16a7.14 7.14 0 0 0-1.32.54l-.94-.7a.75.75 0 0 0-.97.05L6.58 8.06a.75.75 0 0 0-.05.97l.7.94a7.14 7.14 0 0 0-.54 1.32l-1.16.2A.76.76 0 0 0 5 11.92v1.95c0 .37.27.69.63.74l1.16.2c.12.45.3.89.54 1.32l-.7.94a.76.76 0 0 0 .05.97l1.38 1.38c.25.25.64.29.97.06l.94-.7c.43.24.87.42 1.32.54l.2 1.16c.05.36.37.63.74.63h1.95c.37 0 .69-.27.74-.63l.2-1.16c.45-.12.89-.3 1.32-.54l.94.7c.33.23.72.19.97-.06l1.38-1.38a.75.75 0 0 0 .06-.97l-.7-.94c.24-.43.42-.87.54-1.32l1.16-.2c.36-.05.63-.37.63-.74v-1.95a.76.76 0 0 0-.63-.74Z" />
            </svg>
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
        onAutoIntervalChange={value => settings.updateSettings({ autoIntervalMinutes: value })}
        onAutoMaxEntriesChange={value => settings.updateSettings({ autoMaxEntries: value })}
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
