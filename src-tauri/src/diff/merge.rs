use std::collections::{HashMap, HashSet};

use crate::models::{AppError, BomRow};

pub fn update_and_append_boms(
    mut bom_a: Vec<BomRow>,
    bom_b: Vec<BomRow>,
) -> Result<Vec<BomRow>, AppError> {
    let mut map_b: HashMap<String, BomRow> = HashMap::new();
    for row in bom_b {
        map_b.insert(row.r#ref.clone(), row);
    }

    let mut used_refs: HashSet<String> = HashSet::new();

    for row_a in bom_a.iter_mut() {
        if let Some(row_b) = map_b.get(&row_a.r#ref) {
            used_refs.insert(row_a.r#ref.clone());

            if !row_b.part_no.trim().is_empty() {
                row_a.part_no = row_b.part_no.clone();
            }

            for (key, value) in &row_b.attributes {
                if !value.trim().is_empty() {
                    row_a.attributes.insert(key.clone(), value.clone());
                }
            }
        }
    }

    for (reference, row_b) in map_b {
        if !used_refs.contains(&reference) {
            bom_a.push(row_b);
        }
    }

    Ok(bom_a)
}
