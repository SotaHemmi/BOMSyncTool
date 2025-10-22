pub mod cad;
pub mod csv;

use std::collections::HashMap;

use crate::models::{AppError, BomRow, ExportOptions};
use crate::utils::header::normalize_header;

pub fn export_bom_file(bom: Vec<BomRow>, options: ExportOptions) -> Result<String, AppError> {
    let mut diff_map: HashMap<String, String> = HashMap::new();
    if let Some(diffs) = options.diffs.as_ref() {
        for diff in diffs {
            if let Some(reference) = diff
                .a
                .as_ref()
                .map(|row| row.r#ref.clone())
                .or_else(|| diff.b.as_ref().map(|row| row.r#ref.clone()))
            {
                diff_map.insert(reference, diff.status.clone());
            }
        }
    }

    let headers = if options.headers.is_empty() {
        vec![
            "Ref".to_string(),
            "部品型番".to_string(),
            "Value".to_string(),
            "コメント".to_string(),
        ]
    } else {
        options.headers.clone()
    };

    let mut filtered_rows = Vec::new();
    for row in bom.into_iter() {
        if !row_passes_filter(&row, options.filter.as_deref(), &diff_map) {
            continue;
        }
        filtered_rows.push(row);
    }

    match options.format.to_uppercase().as_str() {
        "CSV" => csv::export_csv(&filtered_rows, &headers, &diff_map, options.include_diff_comments),
        "ECO" => cad::export_eco(&filtered_rows, &diff_map, options.include_diff_comments),
        "CCF" => cad::export_ccf(&filtered_rows, &diff_map, options.include_diff_comments),
        "MSF" => cad::export_msf(&filtered_rows, &diff_map, options.include_diff_comments),
        other => Err(AppError::new(format!("未対応のエクスポート形式です: {other}"))),
    }
}

fn row_passes_filter(row: &BomRow, filter: Option<&str>, diff_map: &HashMap<String, String>) -> bool {
    match filter.unwrap_or("all").to_lowercase().as_str() {
        "changes_only" => diff_map
            .get(&row.r#ref)
            .map(|status| status != "同一")
            .unwrap_or(false),
        "missing_only" => {
            row.part_no.trim().is_empty()
                || row.r#ref.trim().is_empty()
                || row
                    .attributes
                    .values()
                    .any(|value| value.trim().is_empty())
        }
        _ => true,
    }
}

pub fn diff_comment(row: &BomRow, diff_map: &HashMap<String, String>) -> String {
    if let Some(status) = diff_map.get(&row.r#ref) {
        match status.as_str() {
            "追加" => "←追加".to_string(),
            "削除" => "←削除".to_string(),
            "変更" => "←変更".to_string(),
            other if other == "同一" => String::new(),
            other => format!("←{}", other),
        }
    } else {
        String::new()
    }
}

pub fn collect_row_values(row: &BomRow, headers: &[String]) -> Vec<String> {
    headers
        .iter()
        .map(|header| header_value(row, header))
        .collect()
}

fn header_value(row: &BomRow, header: &str) -> String {
    let normalized = normalize_header(header);
    match normalized.as_str() {
        "ref" | "reference" => row.r#ref.clone(),
        "partno" | "partnumber" | "part_no" => row.part_no.clone(),
        "manufacturer" | "maker" | "vendor" | "メーカー" => row
            .attributes
            .get("メーカー")
            .or_else(|| row.attributes.get("manufacturer"))
            .or_else(|| row.attributes.get("Maker"))
            .cloned()
            .unwrap_or_default(),
        _ => {
            let trimmed = header.trim();
            if let Some(value) = row.attributes.get(trimmed) {
                value.clone()
            } else {
                let lower = trimmed.to_lowercase();
                row.attributes
                    .iter()
                    .find(|(key, _)| key.to_lowercase() == lower)
                    .map(|(_, value)| value.clone())
                    .unwrap_or_default()
            }
        }
    }
}
