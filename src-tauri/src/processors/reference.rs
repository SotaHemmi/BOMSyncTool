use std::collections::HashMap;

use crate::models::{AppError, ParseResult};

/// Reference展開（C1-C5 → C1, C2, C3, C4, C5）
///
/// ParseResultの元データを操作し、範囲指定を展開します
pub fn expand_reference(parse: &ParseResult) -> Result<ParseResult, AppError> {
    let mut expanded_rows = Vec::new();

    for (idx, row) in parse.rows.iter().enumerate() {
        let ref_value = parse.get_ref(idx);
        let normalized = ref_value.replace(' ', "");

        if let Some((prefix, start, end)) = parse_reference_range(&normalized) {
            if end < start {
                return Err(AppError::new(format!(
                    "Refの範囲指定が不正です: {}",
                    ref_value
                )));
            }

            // 範囲を展開
            for index in start..=end {
                let mut new_row = row.clone();
                // Reference列を更新
                let ref_indices = parse.get_column_indices("ref");
                for &col_idx in &ref_indices {
                    if col_idx < new_row.len() {
                        new_row[col_idx] = format!("{}{}", prefix, index);
                    }
                }
                expanded_rows.push(new_row);
            }
        } else {
            expanded_rows.push(row.clone());
        }
    }

    let row_count = expanded_rows.len();

    Ok(ParseResult {
        rows: expanded_rows,
        column_roles: parse.column_roles.clone(),
        column_order: parse.column_order.clone(),
        #[allow(deprecated)]
        guessed_columns: HashMap::new(),
        #[allow(deprecated)]
        guessed_roles: HashMap::new(),
        errors: vec![],
        headers: parse.headers.clone(),
        columns: parse.columns.clone(),
        row_numbers: (1..=row_count).collect(),
        structured_errors: None,
    })
}

/// Reference分割（"C1, C2, C3" → 3行に分割）
pub fn split_reference_rows(parse: &ParseResult) -> Result<ParseResult, AppError> {
    let mut result_rows = Vec::new();

    for (idx, row) in parse.rows.iter().enumerate() {
        let ref_value = parse.get_ref(idx);
        let references: Vec<&str> = ref_value
            .split(',')
            .map(|part| part.trim())
            .filter(|part| !part.is_empty())
            .collect();

        if references.len() <= 1 {
            result_rows.push(row.clone());
            continue;
        }

        // 複数のReferenceに分割
        for reference in references {
            let mut new_row = row.clone();
            let ref_indices = parse.get_column_indices("ref");
            for &col_idx in &ref_indices {
                if col_idx < new_row.len() {
                    new_row[col_idx] = reference.to_string();
                }
            }
            result_rows.push(new_row);
        }
    }

    let row_count = result_rows.len();

    Ok(ParseResult {
        rows: result_rows,
        column_roles: parse.column_roles.clone(),
        column_order: parse.column_order.clone(),
        #[allow(deprecated)]
        guessed_columns: HashMap::new(),
        #[allow(deprecated)]
        guessed_roles: HashMap::new(),
        errors: vec![],
        headers: parse.headers.clone(),
        columns: parse.columns.clone(),
        row_numbers: (1..=row_count).collect(),
        structured_errors: None,
    })
}

fn parse_reference_range(reference: &str) -> Option<(String, u32, u32)> {
    let parts: Vec<&str> = reference.split('-').collect();
    if parts.len() != 2 {
        return None;
    }

    let start_raw = parts[0];
    let end_raw = parts[1];

    if start_raw.is_empty() || end_raw.is_empty() {
        return None;
    }

    let (start_prefix, start_digits) = split_prefix_digits(start_raw);
    if start_digits.is_empty() {
        return None;
    }

    let (end_prefix, end_digits) = split_prefix_digits(end_raw);
    if end_digits.is_empty() {
        return None;
    }

    let prefix = if !start_prefix.is_empty() {
        start_prefix.clone()
    } else if !end_prefix.is_empty() {
        end_prefix.clone()
    } else {
        return None;
    };

    if !end_prefix.is_empty() && end_prefix != prefix {
        return None;
    }

    let start = start_digits.parse::<u32>().ok()?;
    let end = end_digits.parse::<u32>().ok()?;

    Some((prefix, start, end))
}

fn split_prefix_digits(value: &str) -> (String, String) {
    let prefix: String = value
        .chars()
        .take_while(|c| c.is_ascii_alphabetic())
        .collect();
    let digits = value.get(prefix.len()..).unwrap_or("").to_string();
    (prefix, digits)
}
