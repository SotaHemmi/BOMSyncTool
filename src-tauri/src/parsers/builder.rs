use std::collections::{HashMap, HashSet};

use crate::models::{AppError, ColumnMeta, ParseError, ParseResult};
use crate::utils::text::find_invalid_char;

const MAX_SAMPLE_ROWS: usize = 50;

pub fn build_bom_rows(rows: Vec<Vec<String>>) -> Result<ParseResult, AppError> {
    if rows.is_empty() {
        return Err(AppError::new(
            "BOMデータ内に有効な行が見つかりませんでした。",
        ));
    }

    let mut indexed_rows: Vec<(usize, Vec<String>)> = rows.into_iter().enumerate().collect();

    // 先頭の空行を除去
    while let Some((_, row)) = indexed_rows.first() {
        if is_blank_row(row) {
            indexed_rows.remove(0);
        } else {
            break;
        }
    }

    if indexed_rows.is_empty() {
        return Err(AppError::new(
            "BOMデータ内に有効な行が見つかりませんでした。",
        ));
    }

    let mut errors: Vec<String> = Vec::new();
    let mut structured_errors: Vec<ParseError> = Vec::new();

    let detected_start = detect_data_start(&indexed_rows);
    let data_start = match detected_start {
        Some(idx) => idx,
        None => {
            let message =
                "開始行が判定できませんでした。編集モードで指定してください。".to_string();
            push_warning(&mut errors, &mut structured_errors, message, None, None);
            0
        }
    };

    // 候補ヘッダー行を抽出（データ開始直前行で、明らかにデータ行でない場合のみ）
    let header_row = if data_start > 0 {
        let candidate = indexed_rows[data_start - 1].clone();
        if is_potential_header(&candidate.1) {
            Some(candidate)
        } else {
            None
        }
    } else {
        None
    };

    let data_rows = &indexed_rows[data_start..];
    if data_rows.is_empty() {
        return Err(AppError::new("データ行が見つかりませんでした。"));
    }

    let max_columns = data_rows
        .iter()
        .map(|(_, row)| row.len())
        .chain(header_row.as_ref().map(|(_, row)| row.len()))
        .max()
        .unwrap_or(0);

    // 列メタデータを生成
    let mut headers: Vec<String> = Vec::with_capacity(max_columns);
    for col_idx in 0..max_columns {
        let name = header_row
            .as_ref()
            .and_then(|(_, row)| row.get(col_idx))
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| format!("Column {}", col_idx + 1));
        headers.push(name.clone());
    }

    let columns: Vec<ColumnMeta> = headers
        .iter()
        .enumerate()
        .map(|(idx, name)| ColumnMeta {
            id: format!("col-{}", idx),
            name: name.clone(),
        })
        .collect();

    let mut raw_rows: Vec<Vec<String>> = Vec::with_capacity(data_rows.len());
    let mut row_numbers: Vec<usize> = Vec::with_capacity(data_rows.len());

    for (line_number, row) in data_rows.iter() {
        raw_rows.push(row.clone());
        row_numbers.push(line_number + 1);
    }

    let analysis = analyze_columns(data_rows, max_columns);
    let mut column_roles: HashMap<String, Vec<String>> = HashMap::new();
    let mut priority_order: Vec<usize> = Vec::new();

    let assigned_refs = assign_role(
        "Reference",
        "ref",
        &analysis.reference_candidates,
        &mut column_roles,
        &mut errors,
        &mut structured_errors,
        &mut priority_order,
    );
    let assigned_parts = assign_role(
        "部品型番",
        "part_no",
        &analysis.part_candidates,
        &mut column_roles,
        &mut errors,
        &mut structured_errors,
        &mut priority_order,
    );
    assign_role(
        "メーカー",
        "manufacturer",
        &analysis.manufacturer_candidates,
        &mut column_roles,
        &mut errors,
        &mut structured_errors,
        &mut priority_order,
    );

    let mut column_order: Vec<String> = Vec::with_capacity(max_columns);
    let mut used = HashSet::new();

    for idx in &priority_order {
        if used.insert(*idx) {
            column_order.push(format!("col-{}", idx));
        }
    }

    for idx in 0..max_columns {
        if used.insert(idx) {
            column_order.push(format!("col-{}", idx));
        }
    }

    validate_rows(
        data_rows,
        &assigned_refs,
        &assigned_parts,
        &mut errors,
        &mut structured_errors,
    );

    Ok(ParseResult {
        rows: raw_rows,
        column_roles,
        column_order,
        #[allow(deprecated)]
        guessed_columns: HashMap::new(),
        #[allow(deprecated)]
        guessed_roles: HashMap::new(),
        errors,
        headers,
        columns,
        row_numbers,
        structured_errors: Some(structured_errors),
    })
}

fn detect_data_start(rows: &[(usize, Vec<String>)]) -> Option<usize> {
    for (idx, (_, row)) in rows.iter().enumerate() {
        if is_data_row(row) {
            return Some(idx);
        }
    }
    None
}

fn is_data_row(row: &[String]) -> bool {
    let mut reference_like = 0;
    let mut non_empty = 0;
    for value in row {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            continue;
        }
        non_empty += 1;
        if looks_like_reference(trimmed) {
            reference_like += 1;
        }
    }
    non_empty > 0 && reference_like > 0
}

fn is_potential_header(row: &[String]) -> bool {
    let mut non_empty = 0;
    for value in row {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            continue;
        }
        non_empty += 1;
        if looks_like_reference(trimmed) {
            return false;
        }
    }
    non_empty > 0
}

struct ColumnAnalysis {
    reference_candidates: Vec<usize>,
    part_candidates: Vec<usize>,
    manufacturer_candidates: Vec<usize>,
}

fn analyze_columns(rows: &[(usize, Vec<String>)], max_columns: usize) -> ColumnAnalysis {
    let mut stats = vec![ColumnStats::default(); max_columns];

    for (_, row) in rows.iter().take(MAX_SAMPLE_ROWS) {
        for col_idx in 0..max_columns {
            let value = row.get(col_idx).map(|s| s.trim()).unwrap_or("");
            if value.is_empty() {
                continue;
            }
            let stat = &mut stats[col_idx];
            stat.non_empty += 1;

            if looks_like_reference(value) {
                stat.reference_like += 1;
            }
            if looks_like_part_number(value) {
                stat.part_like += 1;
            }
            if looks_like_manufacturer(value) {
                stat.manufacturer_like += 1;
            }
        }
    }

    let reference_candidates = stats
        .iter()
        .enumerate()
        .filter(|(_, stat)| stat.reference_like > 0 && stat.reference_like * 2 >= stat.non_empty)
        .map(|(idx, _)| idx)
        .collect::<Vec<_>>();

    let part_candidates = stats
        .iter()
        .enumerate()
        .filter(|(_, stat)| stat.part_like > 0 && stat.part_like * 2 >= stat.non_empty)
        .map(|(idx, _)| idx)
        .collect::<Vec<_>>();

    let manufacturer_candidates = stats
        .iter()
        .enumerate()
        .filter(|(_, stat)| {
            stat.manufacturer_like > 0 && stat.manufacturer_like * 2 >= stat.non_empty
        })
        .map(|(idx, _)| idx)
        .collect::<Vec<_>>();

    ColumnAnalysis {
        reference_candidates,
        part_candidates,
        manufacturer_candidates,
    }
}

#[derive(Default, Clone)]
struct ColumnStats {
    non_empty: usize,
    reference_like: usize,
    part_like: usize,
    manufacturer_like: usize,
}

fn assign_role(
    label: &str,
    role_key: &str,
    candidates: &[usize],
    column_roles: &mut HashMap<String, Vec<String>>,
    errors: &mut Vec<String>,
    structured_errors: &mut Vec<ParseError>,
    priority_order: &mut Vec<usize>,
) -> Vec<usize> {
    match candidates.len() {
        0 => {
            let message =
                format!("{label}列を自動判定できませんでした。編集モードで指定してください。");
            push_warning(errors, structured_errors, message, None, None);
            Vec::new()
        }
        1 => {
            let idx = candidates[0];
            column_roles.insert(role_key.to_string(), vec![format!("col-{idx}")]);
            priority_order.push(idx);
            vec![idx]
        }
        _ => {
            let human_candidates = candidates
                .iter()
                .map(|idx| format!("Column {}", idx + 1))
                .collect::<Vec<_>>()
                .join(", ");
            let message = format!(
                "{label}列の候補が複数見つかりました（{human_candidates}）。編集モードで指定してください。"
            );
            push_warning(errors, structured_errors, message, None, None);
            Vec::new()
        }
    }
}

fn validate_rows(
    rows: &[(usize, Vec<String>)],
    ref_indices: &[usize],
    part_indices: &[usize],
    errors: &mut Vec<String>,
    structured_errors: &mut Vec<ParseError>,
) {
    let mut seen_refs: HashSet<String> = HashSet::new();

    for (line_number_zero, row) in rows {
        let line_number = line_number_zero + 1;

        for (col_idx, cell) in row.iter().enumerate() {
            if let Some(invalid_char) = find_invalid_char(cell) {
                let message = format!(
                    "{line_number}行目(列{}): 無効な文字 '{}' を検出しました。",
                    col_idx + 1,
                    invalid_char
                );
                push_warning(
                    errors,
                    structured_errors,
                    message,
                    Some(line_number),
                    Some(col_idx),
                );
            }
        }

        if !ref_indices.is_empty() {
            let mut reference_values: Vec<String> = Vec::new();
            for &idx in ref_indices {
                if let Some(value) = row.get(idx) {
                    let trimmed = value.trim();
                    if trimmed.is_empty() {
                        let message =
                            format!("{line_number}行目: Reference列のデータが不足しています。");
                        push_error(
                            errors,
                            structured_errors,
                            message,
                            Some(line_number),
                            Some(idx),
                        );
                        continue;
                    }
                    reference_values.push(trimmed.to_string());
                } else {
                    let message =
                        format!("{line_number}行目: Reference列のデータが不足しています。");
                    push_error(
                        errors,
                        structured_errors,
                        message,
                        Some(line_number),
                        Some(idx),
                    );
                }
            }

            if !reference_values.is_empty() {
                let reference = reference_values.join(", ");
                if reference.is_empty() {
                    let message = format!("{line_number}行目: Referenceが空です。");
                    push_warning(
                        errors,
                        structured_errors,
                        message,
                        Some(line_number),
                        ref_indices.first().copied(),
                    );
                } else if !seen_refs.insert(reference.clone()) {
                    let message =
                        format!("{line_number}行目: Reference '{reference}' が重複しています。");
                    push_warning(
                        errors,
                        structured_errors,
                        message,
                        Some(line_number),
                        ref_indices.first().copied(),
                    );
                }
            }
        }

        if !part_indices.is_empty() {
            let part_is_empty = part_indices
                .iter()
                .all(|&idx| row.get(idx).map(|v| v.trim().is_empty()).unwrap_or(true));
            if part_is_empty {
                let message =
                    format!("{line_number}行目: 部品型番が空です。編集モードで指定してください。");
                push_warning(
                    errors,
                    structured_errors,
                    message,
                    Some(line_number),
                    part_indices.first().copied(),
                );
            }
        }
    }
}

fn looks_like_reference(value: &str) -> bool {
    let tokens: Vec<&str> = value.split(|c| c == ',' || c == ';').collect();
    let mut matched_any = false;

    for token in tokens {
        let token = token.trim();
        if token.is_empty() {
            continue;
        }

        let mut chars = token.chars();
        let Some(first) = chars.next() else {
            continue;
        };
        if !first.is_ascii_alphabetic() {
            return false;
        }

        let mut has_digit = false;
        for c in chars {
            if c.is_ascii_digit() {
                has_digit = true;
            }
            if !(c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '/') {
                return false;
            }
        }

        if !has_digit {
            return false;
        }
        matched_any = true;
    }

    matched_any
}

fn looks_like_part_number(value: &str) -> bool {
    if value.is_empty() || value.contains(char::is_whitespace) {
        return false;
    }

    let mut has_letter = false;
    let mut has_digit = false;

    for c in value.chars() {
        if c.is_ascii_alphanumeric() {
            if c.is_ascii_digit() {
                has_digit = true;
            } else {
                has_letter = true;
            }
        } else if c == '-' || c == '_' || c == '/' || c == '.' {
            continue;
        } else {
            return false;
        }
    }

    has_letter && has_digit
}

fn looks_like_manufacturer(value: &str) -> bool {
    if value.is_empty() {
        return false;
    }
    if looks_like_part_number(value) {
        return false;
    }

    let mut letters = 0;
    let mut digits = 0;
    let mut spaces = 0;

    for c in value.chars() {
        if c.is_ascii_alphabetic() {
            letters += 1;
        } else if c.is_ascii_digit() {
            digits += 1;
        } else if c.is_whitespace() {
            spaces += 1;
        }
    }

    letters > 0 && (spaces > 0 || digits == 0 || letters >= digits)
}

fn push_warning(
    errors: &mut Vec<String>,
    structured: &mut Vec<ParseError>,
    message: String,
    row: Option<usize>,
    column: Option<usize>,
) {
    errors.push(message.clone());
    structured.push(ParseError {
        message,
        row,
        column,
        severity: "warning".to_string(),
    });
}

fn push_error(
    errors: &mut Vec<String>,
    structured: &mut Vec<ParseError>,
    message: String,
    row: Option<usize>,
    column: Option<usize>,
) {
    errors.push(message.clone());
    structured.push(ParseError {
        message,
        row,
        column,
        severity: "error".to_string(),
    });
}

fn is_blank_row(row: &[String]) -> bool {
    row.iter().all(|cell| cell.trim().is_empty())
}
