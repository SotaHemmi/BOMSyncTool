import { useCallback, useMemo } from 'react';
import type { ColumnRole, DatasetKey } from '../types';
import type { UseBOMDataResult } from './useBOMData';
import type { PreprocessOptions } from '../core/preprocessing';
import { exportToCCF, exportToECO, exportToMSF, exportToPWS, exportToBD, exportToPADSReport, type ExportContext } from '../core/export-handler';

interface UseDatasetHandlersParams {
  dataset: DatasetKey;
  bom: UseBOMDataResult;
  isLoading: boolean;
  handleLoadFile: (
    dataset: DatasetKey,
    loader: (path: string, displayName?: string) => Promise<void>,
    path: string,
    displayName?: string
  ) => Promise<void>;
  defaultPreprocessOptions: PreprocessOptions;
  handleOpenEdit: (dataset: DatasetKey) => void;
  exportContext: ExportContext;
  runExport: (runner: () => Promise<void>) => Promise<void>;
  onSave: () => void;
  setIsProcessing: (value: boolean) => void;
}

export function useDatasetHandlers({
  dataset,
  bom,
  isLoading,
  handleLoadFile,
  defaultPreprocessOptions,
  handleOpenEdit,
  exportContext,
  runExport,
  onSave,
  setIsProcessing
}: UseDatasetHandlersParams) {
  const loadFile = useCallback(
    async (path: string, displayName?: string) => {
      await handleLoadFile(dataset, bom.loadFile, path, displayName);
      onSave();
    },
    [bom.loadFile, dataset, handleLoadFile, onSave]
  );

  const setColumnRole = useCallback(
    (role: ColumnRole, columnId: string | null) => {
      if (!columnId) return;
      bom.setColumnRoleById(columnId, role);
      // 列の役割変更時は自動保存しない（ユーザーが明示的に保存するまで待つ）
      // onSave();
    },
    [bom.setColumnRoleById]
  );

  const applyDefaultPreprocess = useCallback(async () => {
    setIsProcessing(true);
    try {
      await bom.applyPreprocess(defaultPreprocessOptions);
      // 前処理適用時は自動保存しない（ユーザーが明示的に保存するまで待つ）
      // onSave();
      alert('デフォルト前処理を適用しました。');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert(`前処理の適用に失敗しました: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [bom.applyPreprocess, defaultPreprocessOptions, setIsProcessing]);

  const openEdit = useCallback(() => handleOpenEdit(dataset), [dataset, handleOpenEdit]);

  const exportSource = dataset === 'a' ? 'bom_a' : 'bom_b';

  const exportECO = useCallback(
    () => runExport(() => exportToECO(exportSource, exportContext)),
    [exportContext, exportSource, runExport]
  );

  const exportCCF = useCallback(
    () => runExport(() => exportToCCF(exportSource, exportContext)),
    [exportContext, exportSource, runExport]
  );

  const exportMSF = useCallback(
    () => runExport(() => exportToMSF(exportSource, exportContext)),
    [exportContext, exportSource, runExport]
  );

  const exportPWS = useCallback(
    () => runExport(() => exportToPWS(exportSource, exportContext)),
    [exportContext, exportSource, runExport]
  );

  const exportBD = useCallback(
    () => runExport(() => exportToBD(exportSource, exportContext)),
    [exportContext, exportSource, runExport]
  );

  const exportPADSReport = useCallback(
    () => runExport(() => exportToPADSReport(exportSource, exportContext)),
    [exportContext, exportSource, runExport]
  );

  const exportHandlers = useMemo(
    () => ({
      eco: exportECO,
      ccf: exportCCF,
      msf: exportMSF,
      pws: exportPWS,
      bd: exportBD,
      padsReport: exportPADSReport
    }),
    [exportCCF, exportECO, exportMSF, exportPWS, exportBD, exportPADSReport]
  );

  const handleError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    alert(`BOM ${dataset.toUpperCase()}: ${message}`);
  }, [dataset]);

  return {
    loadFile,
    setColumnRole,
    applyDefaultPreprocess,
    openEdit,
    exportHandlers,
    handleError,
    isLoading
  };
}
