use std::collections::{HashMap, HashSet};

use crate::models::{AppError, ColumnMeta, ParseError, ParseResult};
use crate::utils::header::{
    matches_manufacturer_header, matches_part_no_header, matches_ref_header, matches_value_header,
    normalize_header,
};
use crate::utils::text::find_invalid_char;

/// BOM行データを解析してParseResultを構築する
///
/// # 処理の流れ
/// 1. ヘッダー行の検出（最初の非空白行）
/// 2. データ行の抽出（末尾の空白行を除く）
/// 3. 列の役割を自動推測（ref, part_no, value, manufacturer）
/// 4. データのバリデーション（無効文字、重複、空欄チェック）
/// 5. 列の表示順序を決定（ref → part_no → manufacturer → その他）
///
/// # 引数
/// * `rows` - CSVやExcelから読み込んだ全行
///
/// # 戻り値
/// * `Ok(ParseResult)` - 解析成功
/// * `Err(AppError)` - ヘッダー行が見つからない等のエラー
///
/// # 注意
/// - BomRowは生成せず、元データ（rows）をそのまま保持
/// - 空セルも含めて全データを保存
/// - エラーがあっても処理は継続（エラーリストに記録）
pub fn build_bom_rows(rows: Vec<Vec<String>>) -> Result<ParseResult, AppError> {
    // ------------------------------------------------------------------------
    // ステップ1: ヘッダー行とデータ行の分離
    // ------------------------------------------------------------------------
    let mut header_row: Option<(usize, Vec<String>)> = None;
    let mut data_rows: Vec<(usize, Vec<String>)> = Vec::new();

    for (idx, row) in rows.into_iter().enumerate() {
        if header_row.is_none() {
            // 最初の非空白行をヘッダーとする
            if is_blank_row(&row) {
                continue;
            }
            header_row = Some((idx, row));
            continue;
        }

        // ヘッダー行の後は、空行も含めて全て読み込む
        data_rows.push((idx, row));
    }

    // 末尾の空白行を削除
    while let Some((_, last_row)) = data_rows.last() {
        if is_blank_row(last_row) {
            data_rows.pop();
        } else {
            break;
        }
    }

    let (_header_index, header) = header_row
        .ok_or_else(|| AppError::new("BOMデータ内に有効なヘッダー行が見つかりませんでした。"))?;

    // ------------------------------------------------------------------------
    // ステップ2: 列メタデータの生成
    // ------------------------------------------------------------------------
    let columns: Vec<ColumnMeta> = header
        .iter()
        .enumerate()
        .map(|(idx, name)| ColumnMeta {
            id: format!("col-{}", idx),
            name: name.clone(),
        })
        .collect();

    // ------------------------------------------------------------------------
    // ステップ3: 列の役割を自動推測
    // ------------------------------------------------------------------------

    // ヘッダー名を正規化（空白除去、小文字化）
    let normalized_headers: Vec<String> = header.iter().map(|h| normalize_header(h)).collect();

    // 各役割の列を探す
    let ref_indices: Vec<usize> = normalized_headers
        .iter()
        .enumerate()
        .filter(|(_, name)| matches_ref_header(name))
        .map(|(idx, _)| idx)
        .collect();

    let part_indices: Vec<usize> = normalized_headers
        .iter()
        .enumerate()
        .filter(|(_, name)| matches_part_no_header(name))
        .map(|(idx, _)| idx)
        .collect();

    let value_indices: Vec<usize> = normalized_headers
        .iter()
        .enumerate()
        .filter(|(_, name)| matches_value_header(name))
        .map(|(idx, _)| idx)
        .collect();

    let manufacturer_indices: Vec<usize> = normalized_headers
        .iter()
        .enumerate()
        .filter(|(_, name)| matches_manufacturer_header(name))
        .map(|(idx, _)| idx)
        .collect();

    // column_roles: HashMap<役割名, Vec<列ID>>
    let mut column_roles: HashMap<String, Vec<String>> = HashMap::new();

    if !ref_indices.is_empty() {
        column_roles.insert(
            "ref".to_string(),
            ref_indices
                .iter()
                .map(|idx| format!("col-{}", idx))
                .collect(),
        );
    }

    if !part_indices.is_empty() {
        column_roles.insert(
            "part_no".to_string(),
            part_indices
                .iter()
                .map(|idx| format!("col-{}", idx))
                .collect(),
        );
    }

    if !value_indices.is_empty() {
        column_roles.insert(
            "value".to_string(),
            value_indices
                .iter()
                .map(|idx| format!("col-{}", idx))
                .collect(),
        );
    }

    if !manufacturer_indices.is_empty() {
        column_roles.insert(
            "manufacturer".to_string(),
            manufacturer_indices
                .iter()
                .map(|idx| format!("col-{}", idx))
                .collect(),
        );
    }

    // ------------------------------------------------------------------------
    // ステップ4: 列の表示順序を決定
    // ------------------------------------------------------------------------

    // 優先順位: ref → part_no → manufacturer → value → その他
    let mut column_order: Vec<String> = Vec::new();
    let mut used_indices = HashSet::new();

    // 1. Reference列を先頭に
    for idx in &ref_indices {
        column_order.push(format!("col-{}", idx));
        used_indices.insert(*idx);
    }

    // 2. Part_No列
    for idx in &part_indices {
        column_order.push(format!("col-{}", idx));
        used_indices.insert(*idx);
    }

    // 3. Manufacturer列
    for idx in &manufacturer_indices {
        column_order.push(format!("col-{}", idx));
        used_indices.insert(*idx);
    }

    // 4. Value列
    for idx in &value_indices {
        column_order.push(format!("col-{}", idx));
        used_indices.insert(*idx);
    }

    // 5. その他の列（元の順序を維持）
    for (idx, _) in columns.iter().enumerate() {
        if !used_indices.contains(&idx) {
            column_order.push(format!("col-{}", idx));
        }
    }

    // ------------------------------------------------------------------------
    // ステップ6: データのバリデーション
    // ------------------------------------------------------------------------

    let mut errors = Vec::new();
    let mut structured_errors = Vec::new();
    let mut row_numbers = Vec::new();
    let mut seen_refs: HashSet<String> = HashSet::new();

    // 重要な列が見つからない場合は警告
    if ref_indices.is_empty() {
        let msg = "Reference列を自動判定できませんでした。編集モードで列の役割を指定してください。"
            .to_string();
        errors.insert(0, msg.clone());
        structured_errors.push(ParseError {
            message: msg,
            row: None,
            column: None,
            severity: "warning".to_string(),
        });
    }

    if part_indices.is_empty() {
        let msg = "部品型番列を自動判定できませんでした。編集モードで列の役割を指定してください。"
            .to_string();
        errors.insert(0, msg.clone());
        structured_errors.push(ParseError {
            message: msg,
            row: None,
            column: None,
            severity: "warning".to_string(),
        });
    }

    if value_indices.is_empty() {
        let msg = "Value列を自動判定できませんでした。編集モードで列の役割を指定してください。"
            .to_string();
        errors.insert(0, msg.clone());
        structured_errors.push(ParseError {
            message: msg,
            row: None,
            column: None,
            severity: "warning".to_string(),
        });
    }

    let mut raw_rows: Vec<Vec<String>> = Vec::new();

    for (row_index, row) in data_rows {
        let line_number = row_index + 1; // 0-based -> 1-based

        // Reference列のデータチェック
        for &ref_idx in &ref_indices {
            if row.len() <= ref_idx {
                let msg = format!("{line_number}行目: Reference列のデータが不足しています。");
                errors.push(msg.clone());
                structured_errors.push(ParseError {
                    message: msg,
                    row: Some(line_number),
                    column: Some(ref_idx),
                    severity: "error".to_string(),
                });
                continue;
            }
        }

        // Part_No列のデータチェック
        for &part_idx in &part_indices {
            if row.len() <= part_idx {
                let msg = format!("{line_number}行目: 部品型番列のデータが不足しています。");
                errors.push(msg.clone());
                structured_errors.push(ParseError {
                    message: msg,
                    row: Some(line_number),
                    column: Some(part_idx),
                    severity: "error".to_string(),
                });
                continue;
            }
        }

        // 無効文字のチェック
        for (col_idx, cell) in row.iter().enumerate() {
            if let Some(invalid_char) = find_invalid_char(cell) {
                let msg = format!(
                    "{line_number}行目(列{}): 無効な文字 '{}' を検出しました。",
                    col_idx + 1,
                    invalid_char
                );
                errors.push(msg.clone());
                structured_errors.push(ParseError {
                    message: msg,
                    row: Some(line_number),
                    column: Some(col_idx),
                    severity: "warning".to_string(),
                });
            }
        }

        // Reference値の取得（複数列の場合は結合）
        let reference_values: Vec<String> = ref_indices
            .iter()
            .filter_map(|&idx| row.get(idx))
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
            .collect();

        let reference = reference_values.join(", ");

        // Referenceが空の場合は警告
        if reference.is_empty() && !ref_indices.is_empty() {
            let msg = format!("{line_number}行目: Referenceが空です。");
            errors.push(msg.clone());
            structured_errors.push(ParseError {
                message: msg,
                row: Some(line_number),
                column: ref_indices.first().copied(),
                severity: "warning".to_string(),
            });
        } else if !reference.is_empty() {
            // 重複チェック（警告のみ）
            if !seen_refs.insert(reference.clone()) {
                let msg = format!(
                    "{line_number}行目: Reference '{}' が重複しています。",
                    reference
                );
                errors.push(msg.clone());
                structured_errors.push(ParseError {
                    message: msg,
                    row: Some(line_number),
                    column: ref_indices.first().copied(),
                    severity: "warning".to_string(),
                });
            }
        }

        // Part_Noの空欄チェック
        let part_no_empty = part_indices
            .iter()
            .all(|&idx| row.get(idx).map(|v| v.trim().is_empty()).unwrap_or(true));

        if !part_indices.is_empty() && part_no_empty {
            let msg = format!(
                "{line_number}行目: 部品型番が空です (Reference: {}).",
                reference
            );
            errors.push(msg.clone());
            structured_errors.push(ParseError {
                message: msg,
                row: Some(line_number),
                column: part_indices.first().copied(),
                severity: "warning".to_string(),
            });
        }

        // 元データをそのまま保存
        raw_rows.push(row);
        row_numbers.push(line_number);
    }

    // ------------------------------------------------------------------------
    // ステップ7: ParseResultの構築
    // ------------------------------------------------------------------------

    Ok(ParseResult {
        rows: raw_rows,
        column_roles,
        column_order,
        #[allow(deprecated)]
        guessed_columns: HashMap::new(),
        #[allow(deprecated)]
        guessed_roles: HashMap::new(),
        errors,
        headers: header,
        columns,
        row_numbers,
        structured_errors: Some(structured_errors),
    })
}

/// 行が完全に空白かチェック
fn is_blank_row(row: &[String]) -> bool {
    row.iter().all(|cell| cell.trim().is_empty())
}
