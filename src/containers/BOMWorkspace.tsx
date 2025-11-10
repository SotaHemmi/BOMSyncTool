import { memo, useCallback } from 'react';
import type { DiffRow, ParseResult } from '../types';
import type { ResultsFilterType } from '../components/ResultsFilter';
import type { BOMDatasetAdapter } from '../components/BOMCompare';
import type { ExportGroupConfig } from '../components/exportTypes';
import type { UseProjectsResult } from '../hooks/useProjects';
import type { UseActivityLogResult } from '../hooks/useActivityLog';
import type { NormalizedStatus } from '../components/CompareResults';
import { ProjectTabs } from '../components/ProjectTabs';
import { BOMCompare } from '../components/BOMCompare';
import { CompareResults } from '../components/CompareResults';
import { ProjectPanel } from '../components/ProjectPanel';
import { ActivityLog } from '../components/ActivityLog';
import { useNativeDrop } from '../hooks/useNativeDrop';

interface BOMWorkspaceProps {
  datasetAdapterA: BOMDatasetAdapter;
  datasetAdapterB: BOMDatasetAdapter;
  onCompare: () => void;
  onReplace: () => void;
  isProcessing: boolean;
  diffResults: DiffRow[] | null;
  resultsFilter: ResultsFilterType;
  onResultsFilterChange: (filter: ResultsFilterType) => void;
  parseA: ParseResult | null;
  parseB: ParseResult | null;
  onPrint: () => void;
  exportGroups: ExportGroupConfig[];
  resultMode: 'comparison' | 'replacement' | null;
  replacementResult: ParseResult | null;
  replacementStatuses: NormalizedStatus[] | null;
  projects: UseProjectsResult;
  onProjectTabChange: (projectId: string) => void;
  onOpenProjectInNewWindow: (projectId: string) => void;
  activityLog: UseActivityLogResult;
}

export const BOMWorkspace = memo(function BOMWorkspace({
  datasetAdapterA,
  datasetAdapterB,
  onCompare,
  onReplace,
  isProcessing,
  diffResults,
  resultsFilter,
  onResultsFilterChange,
  parseA,
  parseB,
  onPrint,
  exportGroups,
  resultMode,
  replacementResult,
  replacementStatuses,
  projects,
  onProjectTabChange,
  onOpenProjectInNewWindow,
  activityLog
}: BOMWorkspaceProps) {
  const handleRenameProject = useCallback(
    (projectId: string, name: string) => {
      const success = projects.renameProject(projectId, name);
      if (!success) {
        alert('タブ名の変更に失敗しました。');
      }
    },
    [projects]
  );

  const handleDeleteProject = useCallback(
    (projectId: string) => projects.deleteProject(projectId),
    [projects]
  );

  // Tauriネイティブドロップイベントを処理
  useNativeDrop({
    onDrop: useCallback(
      (dataset, path, fileName) => {
        if (dataset === 'a') {
          void datasetAdapterA.loadFile(path, fileName);
        } else {
          void datasetAdapterB.loadFile(path, fileName);
        }
      },
      [datasetAdapterA, datasetAdapterB]
    )
  });

  return (
    <>
      <ProjectTabs
        projects={projects.projects}
        activeProjectId={projects.activeProjectId}
        favoriteProjects={projects.favoriteProjects}
        onTabChange={onProjectTabChange}
        onTabClose={projects.deleteProject}
        onNewTab={() => projects.createProject()}
        onToggleFavorite={projects.toggleFavorite}
        onTabReorder={projects.reorderProject}
        onRename={projects.renameProject}
        onOpenInNewWindow={onOpenProjectInNewWindow}
      />

      <BOMCompare
        datasetA={datasetAdapterA}
        datasetB={datasetAdapterB}
        onCompare={onCompare}
        onReplace={onReplace}
        isProcessing={isProcessing}
      />

      <CompareResults
        results={diffResults}
        filter={resultsFilter}
        onFilterChange={onResultsFilterChange}
        parseA={parseA}
        parseB={parseB}
        onPrint={onPrint}
        exportGroups={exportGroups}
        isLoading={isProcessing}
        mode={resultMode}
        replacementResult={replacementResult}
        replacementStatuses={replacementStatuses}
      />

      <div className="supplementary-panel">
        <ProjectPanel
          projects={projects.projects}
          favorites={projects.favoriteProjects}
          favoriteArchive={projects.favoriteArchive}
          activeProjectId={projects.activeProjectId}
          onProjectClick={onProjectTabChange}
          onToggleFavorite={projects.toggleFavorite}
          onRename={handleRenameProject}
          onDelete={handleDeleteProject}
        />
        <ActivityLog logs={activityLog.logs} onClear={activityLog.clear} />
      </div>
    </>
  );
});
