use std::collections::HashMap;

use crate::models::{AppError, BomRow, ColumnMeta};

/// 列役割に基づきBOMの行データを正規化する
pub fn normalize_bom_data(
    columns: Vec<ColumnMeta>,
    rows: Vec<Vec<String>>,
    column_roles: HashMap<String, String>,
) -> Result<Vec<BomRow>, AppError> {
    let has_ref = column_roles.values().any(|role| role == "ref");
    let has_part = column_roles.values().any(|role| role == "part_no");

    if !has_ref || !has_part {
        return Err(AppError::new(
            "部品番号（ref）と部品型番（part_no）の列を指定してください。",
        ));
    }

    let mut normalized_rows = Vec::with_capacity(rows.len());

    for row in rows {
        let mut bom_row = BomRow {
            r#ref: String::new(),
            part_no: String::new(),
            attributes: HashMap::new(),
        };

        for (index, column_meta) in columns.iter().enumerate() {
            let raw_value = row.get(index).cloned().unwrap_or_default();
            let value = raw_value.trim().to_string();

            let role = column_roles
                .get(&column_meta.id)
                .map(|role| role.as_str())
                .unwrap_or("ignore");

            match role {
                "ref" => {
                    bom_row.r#ref = value;
                }
                "part_no" => {
                    bom_row.part_no = value;
                }
                "manufacturer" => {
                    if !value.is_empty() {
                        bom_row
                            .attributes
                            .insert("manufacturer".to_string(), value.clone());
                        bom_row
                            .attributes
                            .insert(column_meta.name.clone(), value);
                    }
                }
                _ => {
                    if !value.is_empty() {
                        bom_row
                            .attributes
                            .insert(column_meta.name.clone(), value);
                    }
                }
            }
        }

        normalized_rows.push(bom_row);
    }

    Ok(normalized_rows)
}
