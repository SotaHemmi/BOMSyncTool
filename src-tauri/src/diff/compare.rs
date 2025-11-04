use std::collections::HashMap;

use crate::models::{DiffRow, ParseResult};

/// 2つのBOMを比較して差分を検出
///
/// # 処理の流れ
/// 1. 各データセットのReference値でマッピングを作成
/// 2. データセットAを基準に差分を分類
///    - 両方に存在 → 内容を比較（変更 or 同一）
///    - Aのみ → 削除
/// 3. データセットBのみに存在 → 追加
///
/// # 引数
/// * `parse_a` - データセットAのパース結果
/// * `parse_b` - データセットBのパース結果
///
/// # 戻り値
/// 差分行のリスト（ステータス付き）
///
/// # 差分ステータス
/// - "added": Bにのみ存在
/// - "removed": Aにのみ存在
/// - "modified": 両方に存在するが内容が異なる
/// - "unchanged": 両方に存在し内容が同一
pub fn compare_boms(parse_a: &ParseResult, parse_b: &ParseResult) -> Vec<DiffRow> {
    // ------------------------------------------------------------------------
    // ステップ1: Reference値でインデックスマッピングを作成
    // ------------------------------------------------------------------------

    // データセットA: Reference → 行インデックス
    let mut map_a: HashMap<String, usize> = HashMap::new();
    for (idx, _) in parse_a.rows.iter().enumerate() {
        let ref_value = parse_a.get_ref(idx);
        if !ref_value.is_empty() {
            map_a.insert(ref_value, idx);
        }
    }

    // データセットB: Reference → 行インデックス
    let mut map_b: HashMap<String, usize> = HashMap::new();
    for (idx, _) in parse_b.rows.iter().enumerate() {
        let ref_value = parse_b.get_ref(idx);
        if !ref_value.is_empty() {
            map_b.insert(ref_value, idx);
        }
    }

    let mut diffs = Vec::new();

    // ------------------------------------------------------------------------
    // ステップ2: データセットAを基準に比較
    // ------------------------------------------------------------------------

    for (idx_a, _) in parse_a.rows.iter().enumerate() {
        let ref_a = parse_a.get_ref(idx_a);
        if ref_a.is_empty() {
            continue; // Referenceが空の行はスキップ
        }

        if let Some(&idx_b) = map_b.get(&ref_a) {
            // 両方に存在 → 内容を比較
            let (status, changed_columns) = compare_rows(parse_a, idx_a, parse_b, idx_b);

            diffs.push(DiffRow {
                status,
                a_index: Some(idx_a),
                b_index: Some(idx_b),
                ref_value: ref_a,
                changed_columns,
            });
        } else {
            // Aのみに存在 → 削除
            diffs.push(DiffRow {
                status: "removed".to_string(),
                a_index: Some(idx_a),
                b_index: None,
                ref_value: ref_a,
                changed_columns: vec![],
            });
        }
    }

    // ------------------------------------------------------------------------
    // ステップ3: データセットBのみに存在する行（追加）
    // ------------------------------------------------------------------------

    for (idx_b, _) in parse_b.rows.iter().enumerate() {
        let ref_b = parse_b.get_ref(idx_b);
        if ref_b.is_empty() {
            continue;
        }

        if !map_a.contains_key(&ref_b) {
            // Bのみに存在 → 追加
            diffs.push(DiffRow {
                status: "added".to_string(),
                a_index: None,
                b_index: Some(idx_b),
                ref_value: ref_b,
                changed_columns: vec![],
            });
        }
    }

    diffs
}

/// 2つの行を比較して差分を検出
///
/// # 引数
/// * `parse_a` - データセットA
/// * `idx_a` - データセットAの行インデックス
/// * `parse_b` - データセットB
/// * `idx_b` - データセットBの行インデックス
///
/// # 戻り値
/// (ステータス, 変更された列IDのリスト)
fn compare_rows(
    parse_a: &ParseResult,
    idx_a: usize,
    parse_b: &ParseResult,
    idx_b: usize,
) -> (String, Vec<String>) {
    let mut changed_columns = Vec::new();

    // ------------------------------------------------------------------------
    // 主要な役割（ref, part_no, manufacturer）の比較
    // ------------------------------------------------------------------------

    let part_no_a = parse_a.get_part_no(idx_a);
    let part_no_b = parse_b.get_part_no(idx_b);

    if part_no_a != part_no_b {
        // Part_No列が変更された
        if let Some(col_ids) = parse_a.column_roles.get("part_no") {
            changed_columns.extend(col_ids.clone());
        }
    }

    let manufacturer_a = parse_a.get_manufacturer(idx_a);
    let manufacturer_b = parse_b.get_manufacturer(idx_b);

    if manufacturer_a != manufacturer_b {
        if let Some(col_ids) = parse_a.column_roles.get("manufacturer") {
            changed_columns.extend(col_ids.clone());
        }
    }

    let value_a = parse_a.get_value(idx_a);
    let value_b = parse_b.get_value(idx_b);

    if value_a != value_b {
        if let Some(col_ids) = parse_a.column_roles.get("value") {
            changed_columns.extend(col_ids.clone());
        }
    }

    // ------------------------------------------------------------------------
    // 全列の比較（より詳細な差分検出）
    // ------------------------------------------------------------------------

    let row_a = &parse_a.rows[idx_a];
    let row_b = &parse_b.rows[idx_b];

    let min_len = row_a.len().min(row_b.len());

    for col_idx in 0..min_len {
        let val_a = row_a.get(col_idx).map(|s| s.trim()).unwrap_or("");
        let val_b = row_b.get(col_idx).map(|s| s.trim()).unwrap_or("");

        if val_a != val_b {
            let col_id = format!("col-{}", col_idx);
            // 既に記録されている列はスキップ
            if !changed_columns.contains(&col_id) {
                changed_columns.push(col_id);
            }
        }
    }

    // 列数が異なる場合も変更とみなす
    if row_a.len() != row_b.len() {
        for col_idx in min_len..row_a.len().max(row_b.len()) {
            changed_columns.push(format!("col-{}", col_idx));
        }
    }

    // ------------------------------------------------------------------------
    // ステータスを決定
    // ------------------------------------------------------------------------

    let status = if changed_columns.is_empty() {
        "unchanged".to_string()
    } else {
        "modified".to_string()
    };

    (status, changed_columns)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ColumnMeta;
    use std::collections::HashMap;

    #[test]
    fn test_compare_identical_boms() {
        // 同一のBOMを比較
        let mut column_roles = HashMap::new();
        column_roles.insert("ref".to_string(), vec!["col-0".to_string()]);
        column_roles.insert("part_no".to_string(), vec!["col-1".to_string()]);

        let parse_a = ParseResult {
            rows: vec![vec!["C1".to_string(), "0603B104K".to_string()]],
            column_roles: column_roles.clone(),
            column_order: vec!["col-0".to_string(), "col-1".to_string()],
            guessed_columns: HashMap::new(),
            guessed_roles: HashMap::new(),
            errors: vec![],
            headers: vec!["Ref".to_string(), "Part".to_string()],
            columns: vec![
                ColumnMeta {
                    id: "col-0".to_string(),
                    name: "Ref".to_string(),
                },
                ColumnMeta {
                    id: "col-1".to_string(),
                    name: "Part".to_string(),
                },
            ],
            row_numbers: vec![1],
            structured_errors: None,
        };

        let parse_b = parse_a.clone();

        let diffs = compare_boms(&parse_a, &parse_b);

        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].status, "unchanged");
    }

    #[test]
    fn test_compare_added_row() {
        // Bに新しい行が追加された
        let mut column_roles = HashMap::new();
        column_roles.insert("ref".to_string(), vec!["col-0".to_string()]);
        column_roles.insert("part_no".to_string(), vec!["col-1".to_string()]);

        let parse_a = ParseResult {
            rows: vec![vec!["C1".to_string(), "0603B104K".to_string()]],
            column_roles: column_roles.clone(),
            column_order: vec!["col-0".to_string(), "col-1".to_string()],
            guessed_columns: HashMap::new(),
            guessed_roles: HashMap::new(),
            errors: vec![],
            headers: vec!["Ref".to_string(), "Part".to_string()],
            columns: vec![
                ColumnMeta {
                    id: "col-0".to_string(),
                    name: "Ref".to_string(),
                },
                ColumnMeta {
                    id: "col-1".to_string(),
                    name: "Part".to_string(),
                },
            ],
            row_numbers: vec![1],
            structured_errors: None,
        };

        let mut parse_b = parse_a.clone();
        parse_b
            .rows
            .push(vec!["C2".to_string(), "0603B104K".to_string()]);

        let diffs = compare_boms(&parse_a, &parse_b);

        assert_eq!(diffs.len(), 2);
        assert_eq!(diffs[0].status, "unchanged"); // C1
        assert_eq!(diffs[1].status, "added"); // C2
    }
}
