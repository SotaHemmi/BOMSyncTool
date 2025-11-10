use std::collections::{HashMap, HashSet, VecDeque};

use crate::models::{AppError, ParseResult};

/// BOM AをBOM Bで更新し、Bの新規行を追加
///
/// # マージ戦略
/// 1. Aの行をBの対応する行で更新（Referenceでマッチング）
/// 2. Bのみに存在する行をAに追加
///
/// # 引数
/// * `parse_a` - 更新元のBOM
/// * `parse_b` - 更新内容のBOM
///
/// # 戻り値
/// マージ後のParseResult（Aの構造を維持、Bの内容で更新）
pub fn update_and_append_boms(
    parse_a: &ParseResult,
    parse_b: &ParseResult,
) -> Result<ParseResult, AppError> {
    // ------------------------------------------------------------------------
    // ステップ1: Bのマッピングを作成
    // ------------------------------------------------------------------------

    let mut map_b: HashMap<String, VecDeque<usize>> = HashMap::new();
    for (idx, _) in parse_b.rows.iter().enumerate() {
        let ref_value = parse_b.get_ref(idx);
        if !ref_value.is_empty() {
            map_b.entry(ref_value).or_default().push_back(idx);
        }
    }

    let mut merged_rows = Vec::new();
    let mut used_indices: HashSet<usize> = HashSet::new();

    // ------------------------------------------------------------------------
    // ステップ2: Aの行を更新
    // ------------------------------------------------------------------------

    for (idx_a, row_a) in parse_a.rows.iter().enumerate() {
        let ref_a = parse_a.get_ref(idx_a);

        if let Some(queue) = map_b.get_mut(&ref_a) {
            if let Some(idx_b) = queue.pop_front() {
                // Bに対応する行がある → Bの値で更新
                used_indices.insert(idx_b);

                let row_b = &parse_b.rows[idx_b];
                let mut merged_row = row_a.clone();

                // 列ごとに更新（Bに値があれば上書き）
                for (col_idx, cell_b) in row_b.iter().enumerate() {
                    if !cell_b.trim().is_empty() {
                        // Aの対応する列を更新（列数が足りなければ拡張）
                        if col_idx < merged_row.len() {
                            merged_row[col_idx] = cell_b.clone();
                        } else {
                            // Aより列が多い場合は追加
                            while merged_row.len() < col_idx {
                                merged_row.push(String::new());
                            }
                            merged_row.push(cell_b.clone());
                        }
                    }
                }

                merged_rows.push(merged_row);
            } else {
                // B側に対応する行が残っていなければ元の行を保持
                merged_rows.push(row_a.clone());
            }
        } else {
            // Aのみに存在 → そのまま保持
            merged_rows.push(row_a.clone());
        }
    }

    // ------------------------------------------------------------------------
    // ステップ3: Bのみに存在する行を追加
    // ------------------------------------------------------------------------

    for (idx_b, row_b) in parse_b.rows.iter().enumerate() {
        if !used_indices.contains(&idx_b) {
            merged_rows.push(row_b.clone());
        }
    }

    // ------------------------------------------------------------------------
    // ステップ4: マージ結果のParseResultを作成
    // ------------------------------------------------------------------------

    let row_count = merged_rows.len();

    Ok(ParseResult {
        rows: merged_rows,
        column_roles: parse_a.column_roles.clone(),
        column_order: parse_a.column_order.clone(),
        #[allow(deprecated)]
        guessed_columns: HashMap::new(),
        #[allow(deprecated)]
        guessed_roles: HashMap::new(),
        errors: vec![],
        headers: parse_a.headers.clone(),
        columns: parse_a.columns.clone(),
        row_numbers: (1..=row_count).collect(),
        structured_errors: None,
    })
}
