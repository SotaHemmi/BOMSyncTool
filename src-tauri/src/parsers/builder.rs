use std::collections::{HashMap, HashSet};

use crate::models::{AppError, BomRow, ColumnMeta, ParseError, ParseResult};
use crate::utils::header::{
    matches_manufacturer_header, matches_part_no_header, matches_ref_header, matches_value_header,
    normalize_header,
};
use crate::utils::text::find_invalid_char;

pub fn build_bom_rows(rows: Vec<Vec<String>>) -> Result<ParseResult, AppError> {
    let mut header_row: Option<(usize, Vec<String>)> = None;
    let mut data_rows: Vec<(usize, Vec<String>)> = Vec::new();

    for (idx, row) in rows.into_iter().enumerate() {
        if header_row.is_none() {
            if is_blank_row(&row) {
                continue;
            }
            header_row = Some((idx, row));
            continue;
        }

        // ヘッダー行の後は、空行も含めて全て読み込む
        data_rows.push((idx, row));
    }

    // 読み込み後、完全に空白の行を末尾から削除
    while let Some((_, last_row)) = data_rows.last() {
        if is_blank_row(last_row) {
            data_rows.pop();
        } else {
            break;
        }
    }

    let (_header_index, header) = header_row
        .ok_or_else(|| AppError::new("BOMデータ内に有効なヘッダー行が見つかりませんでした。"))?;

    let columns: Vec<ColumnMeta> = header
        .iter()
        .enumerate()
        .map(|(idx, name)| ColumnMeta {
            id: format!("col-{}", idx),
            name: name.clone(),
        })
        .collect();

    let mut guessed_roles: HashMap<String, String> = HashMap::new();

    let normalized_headers: Vec<String> = header.iter().map(|h| normalize_header(h)).collect();

    let ref_idx = normalized_headers
        .iter()
        .position(|name| matches_ref_header(name));
    let part_idx = normalized_headers
        .iter()
        .position(|name| matches_part_no_header(name));
    let value_idx = normalized_headers
        .iter()
        .position(|name| matches_value_header(name));
    let manufacturer_idx = normalized_headers
        .iter()
        .position(|name| matches_manufacturer_header(name));

    let mut guessed_columns = HashMap::new();
    if let Some(idx) = ref_idx {
        guessed_columns.insert("ref".to_string(), idx);
        if let Some(column) = columns.get(idx) {
            guessed_roles.insert(column.id.clone(), "ref".to_string());
        }
    }
    if let Some(idx) = part_idx {
        guessed_columns.insert("part_no".to_string(), idx);
        if let Some(column) = columns.get(idx) {
            guessed_roles.insert(column.id.clone(), "part_no".to_string());
        }
    }
    if let Some(idx) = value_idx {
        guessed_columns.insert("value".to_string(), idx);
    }
    if let Some(idx) = manufacturer_idx {
        guessed_columns.insert("manufacturer".to_string(), idx);
        if let Some(column) = columns.get(idx) {
            guessed_roles.insert(column.id.clone(), "manufacturer".to_string());
        }
    }

    let mut errors = Vec::new();
    let mut structured_errors = Vec::new();

    // 重要な列が見つからない場合は警告を追加
    if ref_idx.is_none() {
        let msg = "Reference列を自動判定できませんでした。編集モードで列の役割を指定してください。".to_string();
        errors.insert(0, msg.clone());
        structured_errors.push(ParseError {
            message: msg,
            row: None,
            column: None,
            severity: "warning".to_string(),
        });
    }
    let mut bom_rows = Vec::new();
    let mut row_numbers = Vec::new();
    let mut seen_refs: HashSet<String> = HashSet::new();

    let mut raw_rows: Vec<Vec<String>> = Vec::new();

    for (row_index, row) in data_rows {
        let line_number = row_index + 1; // 0-based -> 1-based

        // ref_idxが存在する場合のみチェック
        if let Some(idx) = ref_idx {
            if row.len() <= idx {
                let msg = format!("{line_number}行目: Reference列のデータが不足しています。");
                errors.push(msg.clone());
                structured_errors.push(ParseError {
                    message: msg,
                    row: Some(line_number),
                    column: Some(idx),
                    severity: "error".to_string(),
                });
                continue;
            }
        }

        if let Some(idx) = part_idx {
            if row.len() <= idx {
                let msg = format!("{line_number}行目: 部品型番列のデータが不足しています。");
                errors.push(msg.clone());
                structured_errors.push(ParseError {
                    message: msg,
                    row: Some(line_number),
                    column: Some(idx),
                    severity: "error".to_string(),
                });
                continue;
            }
        }

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

        // Referenceを取得（列が見つからない場合は空文字列）
        let reference = if let Some(idx) = ref_idx {
            row.get(idx)
                .map(|value| value.trim().to_string())
                .unwrap_or_default()
        } else {
            String::new()
        };

        // Referenceが空の場合は警告を出すが、データは元のまま保持
        if reference.is_empty() {
            let msg = format!("{line_number}行目: Referenceが空または列が見つかりません。");
            errors.push(msg.clone());
            if let Some(idx) = ref_idx {
                structured_errors.push(ParseError {
                    message: msg,
                    row: Some(line_number),
                    column: Some(idx),
                    severity: "warning".to_string(),
                });
            } else {
                structured_errors.push(ParseError {
                    message: msg,
                    row: Some(line_number),
                    column: None,
                    severity: "warning".to_string(),
                });
            }
        } else {
            // 空でないReferenceの場合のみ重複チェック（警告のみ、データは改変しない）
            if !seen_refs.insert(reference.clone()) {
                let msg = format!(
                    "{line_number}行目: Reference '{}' が重複しています。",
                    reference
                );
                errors.push(msg.clone());
                if let Some(idx) = ref_idx {
                    structured_errors.push(ParseError {
                        message: msg,
                        row: Some(line_number),
                        column: Some(idx),
                        severity: "warning".to_string(),
                    });
                }
            }
        }

        let part_no = part_idx
            .and_then(|idx| row.get(idx))
            .map(|value| value.trim().to_string())
            .unwrap_or_default();
        if part_idx.is_some() && part_no.is_empty() {
            let msg = format!(
                "{line_number}行目: 部品型番が空です (Reference: {}).",
                reference
            );
            errors.push(msg.clone());
            if let Some(idx) = part_idx {
                structured_errors.push(ParseError {
                    message: msg,
                    row: Some(line_number),
                    column: Some(idx),
                    severity: "warning".to_string(),
                });
            }
        }

        let mut attributes = HashMap::new();
        for (idx, header_name) in header.iter().enumerate() {
            let is_ref = ref_idx.map(|col| col == idx).unwrap_or(false);
            let is_part = part_idx.map(|col| col == idx).unwrap_or(false);
            if is_ref || is_part {
                continue;
            }

            let key = header_name.trim();
            if key.is_empty() {
                continue;
            }

            let attr_value = row
                .get(idx)
                .map(|value| value.trim())
                .unwrap_or_default()
                .to_string();

            if !attr_value.is_empty() {
                attributes.insert(key.to_string(), attr_value);
            }
        }

        bom_rows.push(BomRow {
            r#ref: reference,
            part_no,
            attributes,
        });
        raw_rows.push(row.clone());
        row_numbers.push(line_number);
    }

    if part_idx.is_none() {
        let msg = "部品型番列を自動判定できませんでした。編集モードで列の役割を指定してください。".to_string();
        errors.insert(0, msg.clone());
        structured_errors.insert(0, ParseError {
            message: msg,
            row: None,
            column: None,
            severity: "warning".to_string(),
        });
    }
    if value_idx.is_none() {
        let msg = "Value列を自動判定できませんでした。編集モードで列の役割を指定してください。".to_string();
        errors.insert(0, msg.clone());
        structured_errors.insert(0, ParseError {
            message: msg,
            row: None,
            column: None,
            severity: "warning".to_string(),
        });
    }

    Ok(ParseResult {
        bom_data: bom_rows,
        rows: raw_rows,
        guessed_columns,
        guessed_roles,
        errors,
        headers: header,
        columns,
        row_numbers,
        structured_errors: Some(structured_errors),
    })
}

fn is_blank_row(row: &[String]) -> bool {
    row.iter().all(|cell| cell.trim().is_empty())
}
