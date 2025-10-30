use std::collections::HashMap;

use crate::models::{AppError, ParseResult};
use crate::utils::text::cleanse_string;

/// 空白セルを前の行の値で埋める
pub fn fill_blank_cells(parse: &ParseResult) -> Result<ParseResult, AppError> {
    let mut filled_rows = Vec::new();
    let mut prev_row: Option<Vec<String>> = None;

    for row in &parse.rows {
        let mut new_row = row.clone();

        if let Some(prev) = &prev_row {
            for (col_idx, cell) in new_row.iter_mut().enumerate() {
                if cell.trim().is_empty() {
                    if let Some(prev_cell) = prev.get(col_idx) {
                        *cell = prev_cell.clone();
                    }
                }
            }
        }

        prev_row = Some(new_row.clone());
        filled_rows.push(new_row);
    }

    Ok(ParseResult {
        rows: filled_rows,
        column_roles: parse.column_roles.clone(),
        column_order: parse.column_order.clone(),
        #[allow(deprecated)]
        guessed_columns: HashMap::new(),
        #[allow(deprecated)]
        guessed_roles: HashMap::new(),
        errors: vec![],
        headers: parse.headers.clone(),
        columns: parse.columns.clone(),
        row_numbers: parse.row_numbers.clone(),
        structured_errors: None,
    })
}

/// テキストデータをクレンジング（不要な空白・特殊文字を削除）
pub fn cleanse_text_data(parse: &ParseResult) -> ParseResult {
    let cleansed_rows: Vec<Vec<String>> = parse
        .rows
        .iter()
        .map(|row| row.iter().map(|cell| cleanse_string(cell)).collect())
        .collect();

    ParseResult {
        rows: cleansed_rows,
        column_roles: parse.column_roles.clone(),
        column_order: parse.column_order.clone(),
        #[allow(deprecated)]
        guessed_columns: HashMap::new(),
        #[allow(deprecated)]
        guessed_roles: HashMap::new(),
        errors: vec![],
        headers: parse.headers.clone(),
        columns: parse.columns.clone(),
        row_numbers: parse.row_numbers.clone(),
        structured_errors: None,
    }
}
