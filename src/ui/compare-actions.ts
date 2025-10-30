/**
 * 比較・置換アクション
 *
 * BOM比較と置換機能（BomRow不使用、ParseResultのみ使用）
 */

import type { ParseResult, DiffRow } from '../types';
import { datasetState, setCurrentDiffs, setMergedBom } from '../state/app-state';
import { compareBoms, updateAndAppendBoms } from '../services';
import { setProcessing, logActivity } from '../utils';
import { renderDiffTable } from './diff-view';

/**
 * BOM比較を実行
 */
export async function runCompare(): Promise<void> {
  if (!datasetState.a.parseResult || !datasetState.b.parseResult) {
    alert('両方のBOMを読み込んでから比較してください。');
    return;
  }

  const parseA = datasetState.a.parseResult;
  const parseB = datasetState.b.parseResult;

  try {
    setProcessing(true, '差分を比較中...');

    // compareBoms は ParseResult を受け取る（BomRow不使用）
    const diffs: DiffRow[] = await compareBoms(parseA, parseB);

    setCurrentDiffs(diffs);
    renderDiffTable(diffs);

    // 結果サマリーを更新
    const added = diffs.filter(d => d.status === '追加').length;
    const removed = diffs.filter(d => d.status === '削除').length;
    const changed = diffs.filter(d => d.status === '変更').length;
    const total = added + removed + changed;

    const resultsSummary = document.getElementById('results-summary');
    if (resultsSummary) {
      resultsSummary.textContent = `差分: ${total}件（追加 ${added}、削除 ${removed}、変更 ${changed}）`;
    }

    // 結果パネルを表示
    const resultsPanel = document.getElementById('results-panel');
    if (resultsPanel) {
      resultsPanel.hidden = false;
    }

    logActivity('BOM A と BOM B の比較を実行しました。');
  } catch (error: unknown) {
    console.error('Comparison failed', error);
    const message =
      typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: string }).message)
        : JSON.stringify(error);
    alert(`比較処理に失敗しました: ${message}`);
  } finally {
    setProcessing(false);
  }
}

/**
 * BOM置換を実行
 */
export async function runReplace(): Promise<void> {
  if (!datasetState.a.parseResult || !datasetState.b.parseResult) {
    alert('両方のBOMを読み込んでから置き換えを実行してください。');
    return;
  }

  const parseA = datasetState.a.parseResult;
  const parseB = datasetState.b.parseResult;

  try {
    setProcessing(true, '置き換えを実行中...');

    // updateAndAppendBoms は ParseResult を受け取る（BomRow不使用）
    const merged: ParseResult = await updateAndAppendBoms(parseA, parseB);

    setMergedBom(merged);

    const summary = `置き換え結果: ${merged.rows.length.toLocaleString()} 行`;
    const resultsSummary = document.getElementById('results-summary');
    if (resultsSummary) {
      resultsSummary.textContent = summary;
    }

    // 結果テーブルを表示
    const diffResultContainer = document.getElementById('diff-result');
    if (diffResultContainer) {
      const table = createMergedTable(merged, 20);
      diffResultContainer.innerHTML = '';
      diffResultContainer.appendChild(table);
      diffResultContainer.hidden = false;
    }

    // 結果パネルを表示
    const resultsPanel = document.getElementById('results-panel');
    if (resultsPanel) {
      resultsPanel.hidden = false;
    }

    logActivity(`置き換えを実行しました: ${merged.rows.length} 行`);
  } catch (error: unknown) {
    console.error('Replace failed', error);
    const message =
      typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: string }).message)
        : JSON.stringify(error);
    alert(`置き換え処理に失敗しました: ${message}`);
  } finally {
    setProcessing(false);
  }
}

/**
 * マージ結果のテーブルを作成
 */
function createMergedTable(parseResult: ParseResult, maxRows = 20): HTMLTableElement {
  const table = document.createElement('table');
  table.classList.add('results-table');

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  parseResult.headers.forEach(header => {
    const th = document.createElement('th');
    th.textContent = header;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  parseResult.rows.slice(0, maxRows).forEach(row => {
    const tr = document.createElement('tr');
    row.forEach(cell => {
      const td = document.createElement('td');
      td.textContent = cell || '';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  return table;
}
