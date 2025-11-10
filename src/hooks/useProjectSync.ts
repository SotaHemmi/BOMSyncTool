import { useEffect, useMemo, useRef } from 'react';
import type { DiffRow, ParseResult } from '../types';
import type { UseBOMDataResult } from './useBOMData';
import type { UseProjectsResult } from './useProjects';

interface UseProjectSyncParams {
  projects: UseProjectsResult;
  bomA: UseBOMDataResult;
  bomB: UseBOMDataResult;
  setCurrentDiffs: (diffs: DiffRow[]) => void;
  setMergedBom: (bom: ParseResult | null) => void;
  resetResults: () => void;
}

export function useProjectSync({
  projects,
  bomA,
  bomB,
  setCurrentDiffs,
  setMergedBom,
  resetResults
}: UseProjectSyncParams) {
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


  useEffect(() => {
    if (!activeProject) {
      if (bomA.parseResult) {
        bomA.reset();
      }
      if (bomB.parseResult) {
        bomB.reset();
      }
      resetResults();
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
      const fileNameA = data.fileNameA ?? bomA.fileName ?? name;
      bomA.updateFromParseResult(data.bomA, fileNameA ?? null);
    } else if (bomA.parseResult) {
      bomA.reset();
    }

    if (data.bomB) {
      const fileNameB = data.fileNameB ?? bomB.fileName ?? name;
      bomB.updateFromParseResult(data.bomB, fileNameB ?? null);
    } else if (bomB.parseResult) {
      bomB.reset();
    }

    resetResults();
    setCurrentDiffs([]);
    setMergedBom(null);
    lastSyncedProjectRef.current = { id, savedAt };
  }, [activeProject, bomA, bomB, resetResults, setCurrentDiffs, setMergedBom]);

  return {
    activeProject
  };
}
