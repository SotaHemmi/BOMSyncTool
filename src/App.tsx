/**
 * BOMSyncTool - Reactメインアプリ
 */

import { useCallback, useMemo, useState } from 'react';
import type { DictionaryTabProps } from './components/DictionaryTab';
import { SettingsModal, type SettingsTabKey } from './components/SettingsModal';
import { useProjects } from './hooks/useProjects';
import { useBOMData } from './hooks/useBOMData';
import { useSettings } from './hooks/useSettings';
import { useDictionary } from './hooks/useDictionary';
import { useActivityLog } from './hooks/useActivityLog';
import { useDatasetAdapter } from './hooks/useDatasetAdapter';
import { useExportManager } from './hooks/useExportManager';
import { useEditModal, DEFAULT_EDIT_PREPROCESS } from './hooks/useEditModal';
import { useComparison } from './hooks/useComparison';
import { useProjectSync } from './hooks/useProjectSync';
import { useDatasetHandlers } from './hooks/useDatasetHandlers';
import { openProjectInNewWindow } from './services';
import { GearIcon } from './components/icons';
import { useAppState } from './contexts/AppStateContext';
import { AppProvider } from './contexts/AppContext';
import './styles.css';
import { BOMWorkspace } from './containers/BOMWorkspace';
import { EditWorkspace } from './containers/EditWorkspace';
import { appVersion } from './version';

function App() {
  const projects = useProjects();
  const bomA = useBOMData('a');
  const bomB = useBOMData('b');
  const settings = useSettings();
  const dictionary = useDictionary();
  const activityLog = useActivityLog();
  const { currentDiffs, setCurrentDiffs, mergedBom, setMergedBom } = useAppState();

  const appContextValue = useMemo(
    () => ({
      bomA,
      bomB,
      projects,
      dictionary,
      activityLog,
      settings
    }),
    [activityLog, bomA, bomB, dictionary, projects, settings]
  );

  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTabKey>('projects');

  const defaultPreprocessOptions = useMemo(() => {
    const defaults = settings.settings.defaultPreprocess ?? {
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

  const comparison = useComparison({
    bomA,
    bomB,
    setCurrentDiffs,
    setMergedBom,
    onSave: projects.saveProject
  });

  useProjectSync({
    projects,
    bomA,
    bomB,
    setCurrentDiffs,
    setMergedBom,
    resetResults: comparison.resetResults
  });

  const editModal = useEditModal({
    bomA,
    bomB,
    defaultPreprocessOptions,
    onSave: projects.saveProject,
    setIsProcessing: comparison.setIsProcessing
  });

  const exportContext = useMemo(
    () => ({ currentDiffs, mergedBom }),
    [currentDiffs, mergedBom]
  );

  const hasComparisonExport = comparison.diffResults !== null && comparison.diffResults.length > 0;
  const hasReplacementExport = Boolean(comparison.replacementResult && comparison.replacementResult.rows.length > 0);
  const activeResultMode =
    comparison.resultMode ?? (hasComparisonExport ? 'comparison' : hasReplacementExport ? 'replacement' : null);

  const { runExport, exportGroups } = useExportManager({
    exportContext,
    setIsProcessing: comparison.setIsProcessing,
    hasComparisonExport,
    hasReplacementExport,
    resultMode: activeResultMode
  });

  const datasetHandlersA = useDatasetHandlers({
    dataset: 'a',
    bom: bomA,
    isLoading: comparison.loadingDatasets.a,
    handleLoadFile: comparison.handleLoadFile,
    defaultPreprocessOptions,
    handleOpenEdit: editModal.handleOpenEdit,
    exportContext,
    runExport,
    onSave: projects.saveProject,
    setIsProcessing: comparison.setIsProcessing
  });

  const datasetHandlersB = useDatasetHandlers({
    dataset: 'b',
    bom: bomB,
    isLoading: comparison.loadingDatasets.b,
    handleLoadFile: comparison.handleLoadFile,
    defaultPreprocessOptions,
    handleOpenEdit: editModal.handleOpenEdit,
    exportContext,
    runExport,
    onSave: projects.saveProject,
    setIsProcessing: comparison.setIsProcessing
  });

  const datasetAdapterA = useDatasetAdapter({
    dataset: 'a',
    bom: bomA,
    isLoading: datasetHandlersA.isLoading,
    loadFile: datasetHandlersA.loadFile,
    setColumnRole: datasetHandlersA.setColumnRole,
    applyDefaultPreprocess: datasetHandlersA.applyDefaultPreprocess,
    openEdit: datasetHandlersA.openEdit,
    exportHandlers: datasetHandlersA.exportHandlers,
    handleError: datasetHandlersA.handleError
  });

  const datasetAdapterB = useDatasetAdapter({
    dataset: 'b',
    bom: bomB,
    isLoading: datasetHandlersB.isLoading,
    loadFile: datasetHandlersB.loadFile,
    setColumnRole: datasetHandlersB.setColumnRole,
    applyDefaultPreprocess: datasetHandlersB.applyDefaultPreprocess,
    openEdit: datasetHandlersB.openEdit,
    exportHandlers: datasetHandlersB.exportHandlers,
    handleError: datasetHandlersB.handleError
  });

  const handleApplyDictionaryToBOM = useCallback(() => {
    void (async () => {
      const applied = await dictionary.applyRegistrationToBOM();
      if (applied > 0) {
        projects.saveProject();
      }
    })();
  }, [dictionary, projects.saveProject]);

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
      isProcessing: comparison.isProcessing
    }),
    [dictionary, handleApplyDictionaryToBOM, comparison.isProcessing]
  );

  const handleProjectTabChange = useCallback(
    (projectId: string) => {
      if (!projects.loadProject(projectId)) {
        alert('プロジェクトの読み込みに失敗しました。');
      }
    },
    [projects]
  );

  const handleOpenProjectInNewWindow = useCallback(async (projectId: string) => {
    try {
      await openProjectInNewWindow(projectId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`ウィンドウを開けませんでした: ${message}`);
    }
  }, []);

  const handleSettingsSave = useCallback(() => {
    settings.applyTheme();
    setSettingsModalOpen(false);
  }, [settings]);

  return (
    <AppProvider value={appContextValue}>
      <main className="app-shell">
        <header className="shell-header">
          <div className="brand">
            <h1>
              BOMSyncTool
              <span className="brand-version" aria-label={`version ${appVersion}`}>
                v{appVersion}
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

        <BOMWorkspace
          datasetAdapterA={datasetAdapterA}
          datasetAdapterB={datasetAdapterB}
          onCompare={comparison.handleCompare}
          onReplace={comparison.handleReplace}
          isProcessing={comparison.isProcessing}
          diffResults={comparison.diffResults}
          resultsFilter={comparison.resultsFilter}
          onResultsFilterChange={comparison.setResultsFilter}
          parseA={bomA.parseResult}
          parseB={bomB.parseResult}
          onPrint={() => window.print()}
          exportGroups={exportGroups}
          resultMode={activeResultMode}
          replacementResult={comparison.replacementResult}
          replacementStatuses={comparison.replacementStatuses}
          projects={projects}
          onProjectTabChange={handleProjectTabChange}
          onOpenProjectInNewWindow={handleOpenProjectInNewWindow}
          activityLog={activityLog}
        />

        <EditWorkspace
          open={editModal.editModalOpen}
          activeDataset={editModal.editActiveDataset}
          datasets={editModal.editDatasets}
          onOpenChange={editModal.setEditModalOpen}
          onDatasetChange={editModal.setEditActiveDataset}
          onCellChange={editModal.handleEditCellChange}
          onHeaderRoleChange={editModal.handleEditHeaderRoleChange}
          onApply={editModal.handleEditApply}
          onClose={() => editModal.setEditModalOpen(false)}
          onApplyReplace={editModal.handleEditApplyReplace}
          onApplyPreprocess={editModal.handleEditApplyPreprocess}
          onCellFocus={editModal.handleEditCellFocus}
          findReplaceValues={editModal.editFindReplace}
          setFindReplaceValues={editModal.setEditFindReplace}
          preprocessOptions={editModal.editPreprocessOptionsState}
          setPreprocessOptions={editModal.setEditPreprocessOptionsState}
          defaultPreprocessTemplate={DEFAULT_EDIT_PREPROCESS}
          formatRulesVisible={editModal.formatRulesVisible}
          setFormatRulesVisible={editModal.setFormatRulesVisible}
          highlightedCell={editModal.editHighlightedCell}
          setHighlightedCell={editModal.setEditHighlightedCell}
          isProcessing={comparison.isProcessing}
        />

        <SettingsModal
          open={settingsModalOpen}
          activeTab={settingsTab}
          onOpenChange={setSettingsModalOpen}
          onTabChange={setSettingsTab}
          projectSettings={settings.settings}
          onDefaultPreprocessChange={(option, value) => {
            const current = settings.settings.defaultPreprocess ?? {
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
          isSaving={comparison.isProcessing}
        />
      </main>
    </AppProvider>
  );
}

export default App;
