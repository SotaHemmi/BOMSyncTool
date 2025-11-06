import { useMemo } from 'react';
import type { ColumnRole, DatasetKey } from '../types';
import type { UseBOMDataResult } from './useBOMData';
import type { BOMDatasetAdapter } from '../components/BOMCompare';
import { formatDateLabel } from '../utils';

interface ExportHandlers {
  eco?: () => void;
  ccf?: () => void;
  msf?: () => void;
}

interface UseDatasetAdapterParams {
  dataset: DatasetKey;
  bom: UseBOMDataResult;
  isLoading: boolean;
  loadFile: (path: string, displayName?: string) => Promise<void> | void;
  setColumnRole: (role: ColumnRole, columnId: string | null) => void;
  applyDefaultPreprocess?: () => void;
  openEdit?: () => void;
  exportHandlers?: ExportHandlers;
  handleError?: (error: unknown) => void;
}

export function useDatasetAdapter({
  dataset,
  bom,
  isLoading,
  loadFile,
  setColumnRole,
  applyDefaultPreprocess,
  openEdit,
  exportHandlers,
  handleError
}: UseDatasetAdapterParams): BOMDatasetAdapter {
  return useMemo(
    () => ({
      dataset,
      parseResult: bom.parseResult,
      fileName: bom.fileName,
      lastUpdated: bom.lastUpdated ?? undefined,
      columnRoles: bom.columnRoles,
      errors: bom.errors,
      statusText: bom.lastUpdated ? formatDateLabel(bom.lastUpdated) : bom.fileName ?? '未読み込み',
      isLoading,
      loadFile,
      setColumnRole,
      applyDefaultPreprocess,
      openEdit,
      exportECO: exportHandlers?.eco,
      exportCCF: exportHandlers?.ccf,
      exportMSF: exportHandlers?.msf,
      handleError
    }),
    [
      applyDefaultPreprocess,
      bom.columnRoles,
      bom.errors,
      bom.fileName,
      bom.lastUpdated,
      bom.parseResult,
      dataset,
      exportHandlers?.ccf,
      exportHandlers?.eco,
      exportHandlers?.msf,
      handleError,
      isLoading,
      loadFile,
      openEdit,
      setColumnRole
    ]
  );
}
