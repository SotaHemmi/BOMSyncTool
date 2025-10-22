use std::path::Path;

use calamine::{open_workbook_auto, DataType, Reader};

use crate::models::{AppError, ParseResult};

use super::build_bom_rows;

pub fn parse_excel_file(path: &Path) -> Result<ParseResult, AppError> {
    let mut workbook = open_workbook_auto(path)
        .map_err(|err| AppError::new(format!("Excelファイルの読み込みに失敗しました: {err}")))?;

    let range = workbook
        .worksheet_range_at(0)
        .ok_or_else(|| AppError::new("ワークシートが見つかりませんでした。"))?
        .map_err(|err| AppError::new(format!("ワークシートの解析に失敗しました: {err}")))?;

    let rows = range
        .rows()
        .map(|row| row.iter().map(data_type_to_string).collect())
        .collect();

    build_bom_rows(rows)
}

fn data_type_to_string(cell: &DataType) -> String {
    match cell {
        DataType::Empty => String::new(),
        DataType::String(s) => s.trim().to_string(),
        DataType::Float(f) => {
            if f.fract().abs() < f64::EPSILON {
                format!("{:.0}", f)
            } else {
                f.to_string()
            }
        }
        DataType::Int(v) => v.to_string(),
        DataType::Bool(v) => v.to_string(),
        DataType::DateTime(_) => cell.to_string(),
        DataType::Error(_) => String::new(),
        _ => cell.to_string(),
    }
}
