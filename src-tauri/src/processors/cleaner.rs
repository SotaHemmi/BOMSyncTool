use std::collections::HashMap;

use crate::models::{AppError, BomRow};
use crate::utils::text::cleanse_string;

pub fn fill_blank_cells(mut rows: Vec<BomRow>) -> Result<Vec<BomRow>, AppError> {
    let mut prev_part_no: Option<String> = None;
    let mut prev_attributes: HashMap<String, String> = HashMap::new();

    for row in rows.iter_mut() {
        if row.part_no.trim().is_empty() {
            if let Some(prev) = &prev_part_no {
                row.part_no = prev.clone();
            }
        } else {
            prev_part_no = Some(row.part_no.clone());
        }

        let attribute_keys: Vec<String> = row.attributes.keys().cloned().collect();
        for key in attribute_keys {
            if let Some(value) = row.attributes.get(&key).cloned() {
                if value.trim().is_empty() {
                    if let Some(prev) = prev_attributes.get(&key) {
                        row.attributes.insert(key.clone(), prev.clone());
                    }
                } else {
                    prev_attributes.insert(key.clone(), value);
                }
            }
        }
    }

    Ok(rows)
}

pub fn cleanse_text_data(bom: Vec<BomRow>) -> Vec<BomRow> {
    bom.into_iter()
        .map(|mut row| {
            row.r#ref = cleanse_string(&row.r#ref);
            row.part_no = cleanse_string(&row.part_no);
            row.attributes = row
                .attributes
                .into_iter()
                .map(|(key, value)| (key, cleanse_string(&value)))
                .collect();
            row
        })
        .collect()
}
