use std::collections::HashMap;

use crate::models::{AppError, BomRow, ExceptionMasterEntry, IpcMasterRule};

use super::helpers::condition_matches;
use super::ASSIGNED_NAME_KEY;

pub fn apply_ipc_names(
    bom: Vec<BomRow>,
    ipc_rules: Vec<IpcMasterRule>,
    exceptions: Vec<ExceptionMasterEntry>,
) -> Result<Vec<BomRow>, AppError> {
    let mut exception_map: HashMap<String, String> = HashMap::new();
    for entry in exceptions {
        if entry.part_no.trim().is_empty() {
            continue;
        }
        exception_map.insert(entry.part_no.to_lowercase(), entry.output_name.clone());
    }

    let mut result = Vec::with_capacity(bom.len());
    for mut row in bom.into_iter() {
        let part_lower = row.part_no.to_lowercase();
        if let Some(output_name) = exception_map.get(&part_lower) {
            row.attributes
                .insert(ASSIGNED_NAME_KEY.to_string(), output_name.clone());
            result.push(row);
            continue;
        }

        if let Some(output_name) = find_matching_ipc_name(&row, &ipc_rules) {
            row.attributes
                .insert(ASSIGNED_NAME_KEY.to_string(), output_name);
        }

        result.push(row);
    }

    Ok(result)
}

fn find_matching_ipc_name(row: &BomRow, rules: &[IpcMasterRule]) -> Option<String> {
    for rule in rules.iter().rev() {
        if rule
            .conditions
            .iter()
            .all(|condition| condition_matches(row, condition))
        {
            return Some(rule.output_name.clone());
        }
    }

    None
}
