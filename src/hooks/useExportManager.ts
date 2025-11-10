import { useCallback, useMemo } from 'react';
import type { ExportGroupConfig } from '../components/exportTypes';
import type { ExportContext, ExportSource } from '../core/export-handler';
import { exportToCSV, exportToCCF, exportToECO, exportToMSF, exportToPWS, exportToBD, exportToPADSReport } from '../core/export-handler';

interface UseExportManagerParams {
  exportContext: ExportContext;
  setIsProcessing: (value: boolean) => void;
  hasComparisonExport: boolean;
  hasReplacementExport: boolean;
  resultMode: 'comparison' | 'replacement' | null;
}

type ExporterFn = (source: ExportSource, context: ExportContext) => Promise<void>;

export function useExportManager({
  exportContext,
  setIsProcessing,
  hasComparisonExport,
  hasReplacementExport,
  resultMode
}: UseExportManagerParams) {
  const runExport = useCallback(
    async (runner: () => Promise<void>) => {
      setIsProcessing(true);
      try {
        await runner();
      } finally {
        setIsProcessing(false);
      }
    },
    [setIsProcessing]
  );

  const makeExportHandler = useCallback(
    (source: ExportSource, exporter: ExporterFn) => () => {
      void runExport(() => exporter(source, exportContext));
    },
    [exportContext, runExport]
  );

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
          msf: makeExportHandler('replacement', exportToMSF),
          pws: makeExportHandler('replacement', exportToPWS),
          bd: makeExportHandler('replacement', exportToBD),
          padsReport: makeExportHandler('replacement', exportToPADSReport)
        },
        visible: resultMode === 'replacement' && hasReplacementExport
      }
    ],
    [hasComparisonExport, hasReplacementExport, makeExportHandler, resultMode]
  );

  return {
    runExport,
    exportGroups
  };
}
