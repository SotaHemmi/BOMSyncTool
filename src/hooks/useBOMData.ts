import { useCallback, useMemo, useState } from 'react';
import type {
  ColumnMeta,
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
import { deriveColumns } from '../core/bom-columns';

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

const ROLE_PRIORITY: ColumnRole[] = ['ref', 'part_no', 'manufacturer'];
const ROLE_LABELS: Record<Exclude<ColumnRole, 'ignore'>, string> = {
  ref: 'Reference',
  part_no: 'Part_No',
  manufacturer: 'Manufacturer'
};
const FALLBACK_HEADER_PATTERN = /^column\s+\d+$/i;

function findRoleForColumn(
  columnId: string,
  mapping: Record<string, string[]>
): ColumnRole | null {
  for (const [role, ids] of Object.entries(mapping)) {
    if (!isColumnRole(role)) continue;
    if (ids.includes(columnId)) {
      return role;
    }
  }
  return null;
}

function getRoleLabel(role: ColumnRole | null): string | undefined {
  if (!role || role === 'ignore') {
    return undefined;
  }
  return ROLE_LABELS[role];
}

function buildOrderedColumnIds(
  base: ParseResult,
  mapping: Record<string, string[]>
): string[] {
  const initialOrder =
    (base.column_order && base.column_order.length > 0
      ? base.column_order
      : base.columns && base.columns.length > 0
        ? base.columns.map(column => column.id)
        : base.rows[0]?.map((_, index) => `col-${index}`)) ?? [];

  const priorityIds = ROLE_PRIORITY.flatMap(role => mapping[role] ?? []);

  const order: string[] = [];
  priorityIds.forEach(id => {
    if (!order.includes(id)) {
      order.push(id);
    }
  });

  initialOrder.forEach(id => {
    if (!order.includes(id)) {
      order.push(id);
    }
  });

  Object.values(mapping)
    .flat()
    .forEach(id => {
      if (!order.includes(id)) {
        order.push(id);
      }
    });

  const columnCount = Math.max(
    order.length,
    base.columns?.length ?? 0,
    base.headers?.length ?? 0,
    base.rows[0]?.length ?? 0
  );

  for (let index = 0; index < columnCount; index += 1) {
    const fallbackId = `col-${index}`;
    if (!order.includes(fallbackId)) {
      order.push(fallbackId);
    }
  }

  return order;
}

function buildColumnsWithRoles(
  base: ParseResult,
  order: string[],
  mapping: Record<string, string[]>
): ColumnMeta[] {
  const columnsById = new Map<string, ColumnMeta>();
  (base.columns ?? []).forEach(column => {
    columnsById.set(column.id, { ...column });
  });

  return order.map((columnId, index) => {
    const existing = columnsById.get(columnId);
    const role = findRoleForColumn(columnId, mapping);
    const roleLabel = getRoleLabel(role);
    let name =
      existing?.name ??
      base.headers?.[index] ??
      `Column ${index + 1}`;

    if (roleLabel && (name.trim() === '' || FALLBACK_HEADER_PATTERN.test(name.trim()))) {
      name = roleLabel;
    }

    return {
      id: columnId,
      name
    };
  });
}

function applyRolesToParseResult(
  base: ParseResult,
  mapping: Record<string, string[]>
): ParseResult {
  const orderedIds = buildOrderedColumnIds(base, mapping);
  const updatedColumns = buildColumnsWithRoles(base, orderedIds, mapping);
  const updatedHeaders = updatedColumns.map(column => column.name);

  return {
    ...base,
    column_roles: mapping,
    column_order: orderedIds,
    columns: updatedColumns,
    headers: updatedHeaders
  };
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
      const roles = extractColumnRoles(cloned);
      const mapping = buildRoleMapping(roles);
      const normalized = applyRolesToParseResult(cloned, mapping);
      setParseResult(normalized);
      setFileName(nextFileName ?? fileName ?? null);
      const timestamp = new Date().toISOString();
      setLastUpdated(timestamp);
      setColumnRoles(roles);
      setErrors(normalized.errors ?? []);

      const target = datasetState[dataset];
      target.parseResult = cloneParseResult(normalized);
      target.fileName = nextFileName ?? fileName ?? null;
      target.filePath = null;
      target.lastUpdated = timestamp;
      target.columnRoles = { ...roles };
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

        const updatedParse = applyRolesToParseResult(current, mapping);

        const target = datasetState[dataset];
        target.columnRoles = { ...nextRoles };
        target.parseResult = cloneParseResult(updatedParse);

        return updatedParse;
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
