/**
 * フォーマットルールUI
 *
 * BOMデータのフォーマットルール設定と管理
 */

/**
 * フォーマットルール定義
 */
export interface FormatRule {
  /** 対象フィールド */
  field: string;
  /** 条件 */
  condition: 'contains' | 'equals' | 'starts_with' | 'ends_with' | 'exists';
  /** 比較値 */
  value: string;
  /** アクション */
  action: 'replace' | 'remove';
  /** 置換後の値 */
  replacement: string;
}

/**
 * フォーマットルール配列（グローバル状態）
 */
let formatRules: FormatRule[] = [];

/**
 * フォーマットルールを取得
 *
 * @returns フォーマットルール配列
 */
export function getFormatRules(): FormatRule[] {
  return formatRules;
}

/**
 * フォーマットルールを設定
 *
 * @param rules - フォーマットルール配列
 */
export function setFormatRules(rules: FormatRule[]): void {
  formatRules = rules;
  renderFormatRules();
}

/**
 * フォーマットルールをレンダリング
 */
export function renderFormatRules(): void {
  const container = document.getElementById('format-rules-list');
  if (!container) return;

  container.innerHTML = '';

  if (formatRules.length === 0) {
    const empty = document.createElement('p');
    empty.style.fontSize = '12px';
    empty.style.color = '#94a3b8';
    empty.textContent = 'ルールが設定されていません';
    container.appendChild(empty);
    return;
  }

  formatRules.forEach((rule, index) => {
    const item = document.createElement('div');
    item.className = 'format-rule-item';

    // Field row
    const fieldRow = document.createElement('div');
    fieldRow.className = 'format-rule-row';

    const fieldLabel = document.createElement('label');
    fieldLabel.textContent = 'フィールド:';

    const fieldInput = document.createElement('input');
    fieldInput.type = 'text';
    fieldInput.value = rule.field;
    fieldInput.style.flex = '1';
    fieldInput.addEventListener('input', () => {
      formatRules[index].field = fieldInput.value;
    });

    fieldRow.appendChild(fieldLabel);
    fieldRow.appendChild(fieldInput);

    // Condition row
    const conditionRow = document.createElement('div');
    conditionRow.className = 'format-rule-row';

    const conditionLabel = document.createElement('label');
    conditionLabel.textContent = '条件:';

    const conditionSelect = document.createElement('select');
    conditionSelect.style.flex = '1';
    [
      { value: 'exists', label: '存在する' },
      { value: 'contains', label: '含む' },
      { value: 'equals', label: '等しい' },
      { value: 'starts_with', label: '始まる' },
      { value: 'ends_with', label: '終わる' }
    ].forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      conditionSelect.appendChild(option);
    });
    conditionSelect.value = rule.condition;
    conditionSelect.addEventListener('change', () => {
      formatRules[index].condition = conditionSelect.value as FormatRule['condition'];
    });

    conditionRow.appendChild(conditionLabel);
    conditionRow.appendChild(conditionSelect);

    // Value row
    const valueRow = document.createElement('div');
    valueRow.className = 'format-rule-row';

    const valueLabel = document.createElement('label');
    valueLabel.textContent = '値:';

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.value = rule.value;
    valueInput.style.flex = '1';
    valueInput.addEventListener('input', () => {
      formatRules[index].value = valueInput.value;
    });

    valueRow.appendChild(valueLabel);
    valueRow.appendChild(valueInput);

    // Action row
    const actionRow = document.createElement('div');
    actionRow.className = 'format-rule-row';

    const actionLabel = document.createElement('label');
    actionLabel.textContent = 'アクション:';

    const actionSelect = document.createElement('select');
    actionSelect.style.flex = '1';
    [
      { value: 'replace', label: '置換' },
      { value: 'remove', label: '削除' }
    ].forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      actionSelect.appendChild(option);
    });
    actionSelect.value = rule.action;
    actionSelect.addEventListener('change', () => {
      formatRules[index].action = actionSelect.value as FormatRule['action'];
    });

    const replacementInput = document.createElement('input');
    replacementInput.type = 'text';
    replacementInput.value = rule.replacement;
    replacementInput.style.flex = '1';
    replacementInput.addEventListener('input', () => {
      formatRules[index].replacement = replacementInput.value;
    });

    actionRow.appendChild(actionLabel);
    actionRow.appendChild(actionSelect);
    actionRow.appendChild(replacementInput);

    // Remove button row
    const removeRow = document.createElement('div');
    removeRow.className = 'format-rule-row';
    removeRow.style.justifyContent = 'flex-end';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'format-rule-remove';
    removeBtn.textContent = '削除';
    removeBtn.addEventListener('click', () => {
      formatRules.splice(index, 1);
      renderFormatRules();
    });

    removeRow.appendChild(removeBtn);

    item.appendChild(fieldRow);
    item.appendChild(conditionRow);
    item.appendChild(valueRow);
    item.appendChild(actionRow);
    item.appendChild(removeRow);

    container.appendChild(item);
  });
}

/**
 * フォーマットルールUIを登録
 */
export function registerFormatRulesUI(): void {
  const toggleBtn = document.getElementById('toggle-format-rules');
  const configPanel = document.getElementById('format-rules-config');
  const addBtn = document.getElementById('add-format-rule');

  toggleBtn?.addEventListener('click', () => {
    if (configPanel) {
      configPanel.hidden = !configPanel.hidden;
    }
  });

  addBtn?.addEventListener('click', () => {
    formatRules.push({
      field: 'ref',
      condition: 'exists',
      value: '',
      action: 'replace',
      replacement: ''
    });
    renderFormatRules();
  });

  renderFormatRules();
}
