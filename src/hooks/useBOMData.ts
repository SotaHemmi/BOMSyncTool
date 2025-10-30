import { useCallback, useMemo, useState } from 'react';
import type {
  ColumnRole,
  DatasetKey,
  ParseResult
} from '../types';
import { datasetState, clearDataset } from '../state/app-state';
import { parseBomFile } from '../services';
import {
  applyPreprocessing,
  type PreprocessOptions
} from '../core/preprocessing';
import { deriveColumns } from '../components/DatasetCard';

type ColumnRoles = Record<string, ColumnRole>;

function extractFileName(path: string): string {
  const segments = path.split(/[/\\]/);
  return segments[segments.length - 1] ?? path;
}

function isColumnRole(role: string): role is ColumnRole {
  return (
    role === 'ref' ||
    role === 'part_no' ||
    role === 'manufacturer' ||
    role === 'ignore'
  );
}

function cloneParseResult(parse: ParseResult): ParseResult {
  const columnRoles = parse.column_roles ?? {};
  const columnOrder = parse.column_order ?? [];
  const errors = parse.errors ?? [];
  const headers = parse.headers ?? [];
  const columns = parse.columns ?? [];
  const rowNumbers = parse.row_numbers ?? [];
  return {
    ...parse,
    rows: parse.rows.map(row => [...row]),
    column_roles: Object.fromEntries(
      Object.entries(columnRoles).map(([role, ids]) => [role, [...ids]])
    ),
    column_order: [...columnOrder],
    errors: [...errors],
    headers: [...headers],
    columns: columns.map(column => ({ ...column })),
    row_numbers: [...rowNumbers],
    structured_errors: parse.structured_errors
      ? parse.structured_errors.map(error => ({ ...error }))
      : undefined
  };
}

function extractColumnRoles(parseResult: ParseResult): ColumnRoles {
  const assignments: ColumnRoles = {};
  const columns = deriveColumns(parseResult);

  if (parseResult.column_roles) {
    Object.entries(parseResult.column_roles).forEach(([role, columnIds]) => {
      if (!isColumnRole(role)) return;
      columnIds.forEach(columnId => {
        assignments[columnId] = role;
      });
    });
  }

  if (parseResult.guessed_roles) {
    Object.entries(parseResult.guessed_roles).forEach(([columnId, role]) => {
      if (!assignments[columnId] && isColumnRole(role)) {
        assignments[columnId] = role;
      }
    });
  }

  if (parseResult.guessed_columns) {
    Object.entries(parseResult.guessed_columns).forEach(([role, index]) => {
      if (!isColumnRole(role)) return;
      const numericIndex = Number(index);
      if (!Number.isFinite(numericIndex)) return;
      const column = columns[numericIndex];
      if (column && !assignments[column.id]) {
        assignments[column.id] = role;
      }
    });
  }

  return assignments;
}

function buildRoleMapping(columnRoles: ColumnRoles): Record<string, string[]> {
  const mapping: Record<string, string[]> = {};
  Object.entries(columnRoles).forEach(([columnId, role]) => {
    if (!mapping[role]) {
      mapping[role] = [];
    }
    mapping[role]!.push(columnId);
  });
  return mapping;
}

export interface UseBOMDataResult {
  parseResult: ParseResult | null;
  fileName: string | null;
  lastUpdated: string | null;
  columnRoles: ColumnRoles;
  errors: string[];
  loadFile: (filePath: string, displayName?: string) => Promise<void>;
  setColumnRoleById: (columnId: string, role: ColumnRole | null) => void;
  applyPreprocess: (options: PreprocessOptions) => Promise<void>;
  reset: () => void;
  updateFromParseResult: (result: ParseResult | null, nextFileName?: string | null) => void;
}

export function useBOMData(dataset: DatasetKey): UseBOMDataResult {
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [columnRoles, setColumnRoles] = useState<ColumnRoles>({});
  const [errors, setErrors] = useState<string[]>([]);

  const updateFromParseResult = useCallback(
    (result: ParseResult | null, nextFileName?: string | null) => {
      if (!result) {
        setParseResult(null);
        setFileName(null);
        setLastUpdated(null);
        setColumnRoles({});
        setErrors([]);
        clearDataset(dataset);
        return;
      }

      const cloned = cloneParseResult(result);
      const derivedColumns = deriveColumns(cloned);
      const roles = extractColumnRoles(cloned);
      setParseResult(cloned);
      setFileName(nextFileName ?? fileName ?? null);
      const timestamp = new Date().toISOString();
      setLastUpdated(timestamp);
      setColumnRoles(roles);
      setErrors(cloned.errors ?? []);

      const target = datasetState[dataset];
      target.parseResult = cloneParseResult(cloned);
      target.fileName = nextFileName ?? fileName ?? null;
      target.filePath = null;
      target.lastUpdated = timestamp;
      target.columnRoles = { ...roles };

      // Ensure column order is aligned with derived columns
      if (!cloned.column_order || cloned.column_order.length === 0) {
        cloned.column_order = derivedColumns.map(column => column.id);
      }
    },
    [dataset, fileName]
  );

  const loadFile = useCallback(
    async (filePath: string, displayName?: string) => {
      const result = await parseBomFile(filePath);
      const resolvedName = displayName ?? extractFileName(filePath);
      updateFromParseResult(result, resolvedName);
    },
    [updateFromParseResult]
  );

  const setColumnRoleById = useCallback(
    (columnId: string, role: ColumnRole | null) => {
      setParseResult(current => {
        if (!current) return current;
        const nextRoles: ColumnRoles = { ...columnRoles };
        if (!columnId) {
          return current;
        }
        if (!role || role === 'ignore') {
          delete nextRoles[columnId];
        } else {
          nextRoles[columnId] = role;
        }

        const mapping = buildRoleMapping(nextRoles);
        setColumnRoles(nextRoles);

        const target = datasetState[dataset];
        target.columnRoles = { ...nextRoles };
        if (target.parseResult) {
          target.parseResult.column_roles = mapping;
        }

        return {
          ...current,
          column_roles: mapping
        };
      });
    },
    [columnRoles, dataset]
  );

  const applyPreprocessHandler = useCallback(
    async (options: PreprocessOptions) => {
      if (!parseResult) return;
      const processed = await applyPreprocessing(cloneParseResult(parseResult), options);
      const nextErrors = processed.errors ?? [];
      setErrors(nextErrors);
      updateFromParseResult(processed, fileName);
    },
    [fileName, parseResult, updateFromParseResult]
  );

  const reset = useCallback(() => {
    setParseResult(null);
    setFileName(null);
    setLastUpdated(null);
    setColumnRoles({});
    setErrors([]);
    clearDataset(dataset);
  }, [dataset]);

  return useMemo(
    () => ({
      parseResult,
      fileName,
      lastUpdated,
      columnRoles,
      errors,
      loadFile,
      setColumnRoleById,
      applyPreprocess: applyPreprocessHandler,
      reset,
      updateFromParseResult
    }),
    [
      parseResult,
      fileName,
      lastUpdated,
      columnRoles,
      errors,
      loadFile,
      setColumnRoleById,
      applyPreprocessHandler,
      reset,
      updateFromParseResult
    ]
  );
}
