use crate::models::{AppError, BomRow, FormatOptions};
use crate::utils::text::{color_to_status, is_truthy};

pub fn apply_format_rules(rows: Vec<BomRow>, options: FormatOptions) -> Result<Vec<BomRow>, AppError> {
    let mut processed = Vec::new();

    for mut row in rows {
        if options.use_strikethrough {
            if let Some(flag) = row.attributes.get("format.strikethrough") {
                if is_truthy(flag) {
                    continue;
                }
            }
        }

        if options.use_cell_color {
            if let Some(color) = row.attributes.get("format.cell_color") {
                if let Some(status) = color_to_status(color) {
                    row.attributes
                        .insert("status".to_string(), status.to_string());
                }
            }
        }

        processed.push(row);
    }

    Ok(processed)
}
