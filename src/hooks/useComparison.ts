import { useCallback, useState } from 'react';
import type { DatasetKey, DiffRow, ParseResult } from '../types';
import type { NormalizedStatus } from '../components/CompareResults';
import type { ResultsFilterType } from '../components/ResultsFilter';
import type { UseBOMDataResult } from './useBOMData';
import { compareBoms, updateAndAppendBoms } from '../services';

interface UseComparisonParams {
  bomA: UseBOMDataResult;
  bomB: UseBOMDataResult;
  setCurrentDiffs: (diffs: DiffRow[]) => void;
  setMergedBom: (bom: ParseResult | null) => void;
  onSave: () => void;
}

export function useComparison({
  bomA,
  bomB,
  setCurrentDiffs,
  setMergedBom,
  onSave
}: UseComparisonParams) {
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

  const resetResults = useCallback(() => {
    setDiffResults(null);
    setResultMode(null);
    setReplacementResult(null);
    setReplacementStatuses(null);
    setCurrentDiffs([]);
    setMergedBom(null);
  }, [setCurrentDiffs, setMergedBom]);

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
        resetResults();
        setResultsFilter('diff');
        // ファイル読み込み後は自動保存しない（ユーザーが明示的に保存するまで待つ）
        // onSave();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        alert(`ファイルの読み込みに失敗しました: ${message}`);
      } finally {
        setLoadingDatasets(prev => ({ ...prev, [dataset]: false }));
      }
    },
    [resetResults]
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
  }, [bomA.parseResult, bomB.parseResult, setCurrentDiffs, setMergedBom]);

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
        onSave();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`置き換えに失敗しました: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [bomA.parseResult, bomB.parseResult, onSave, setCurrentDiffs, setMergedBom]);

  return {
    diffResults,
    resultMode,
    replacementResult,
    replacementStatuses,
    resultsFilter,
    setResultsFilter,
    isProcessing,
    setIsProcessing,
    loadingDatasets,
    handleLoadFile,
    handleCompare,
    handleReplace,
    resetResults
  };
}
