use std::collections::HashMap;

use crate::models::{BomRow, DiffRow};

pub fn compare_boms(bom_a: Vec<BomRow>, bom_b: Vec<BomRow>) -> Vec<DiffRow> {
    let map_a: HashMap<String, BomRow> = bom_a
        .iter()
        .cloned()
        .map(|row| (row.r#ref.clone(), row))
        .collect();
    let map_b: HashMap<String, BomRow> = bom_b
        .iter()
        .cloned()
        .map(|row| (row.r#ref.clone(), row))
        .collect();

    let mut diffs = Vec::new();

    for row_a in &bom_a {
        if let Some(row_b) = map_b.get(&row_a.r#ref) {
            let status = if row_a.part_no == row_b.part_no
                && row_a.attributes == row_b.attributes
            {
                "同一"
            } else {
                "変更"
            };

            diffs.push(DiffRow {
                status: status.to_string(),
                a: Some(row_a.clone()),
                b: Some(row_b.clone()),
            });
        } else {
            diffs.push(DiffRow {
                status: "削除".to_string(),
                a: Some(row_a.clone()),
                b: None,
            });
        }
    }

    for row_b in &bom_b {
        if !map_a.contains_key(&row_b.r#ref) {
            diffs.push(DiffRow {
                status: "追加".to_string(),
                a: None,
                b: Some(row_b.clone()),
            });
        }
    }

    diffs
}
