pub mod models;
pub mod utils;

mod diff;
mod exporters;
mod matchers;
mod parsers;
mod processors;
mod storage;

use models::{
    AppError, BomRow, ColumnMeta, DiffRow, ExceptionMasterEntry, ExportOptions, FormatOptions,
    IpcMasterRule, ParseResult,
};
use std::collections::HashMap;
use serde_json;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
fn parse_bom_file(path: String) -> Result<ParseResult, AppError> {
    parsers::parse_bom_file(path)
}

#[tauri::command]
fn compare_boms(bom_a: Vec<BomRow>, bom_b: Vec<BomRow>) -> Vec<DiffRow> {
    diff::compare::compare_boms(bom_a, bom_b)
}

#[tauri::command]
fn expand_reference(rows: Vec<BomRow>) -> Result<Vec<BomRow>, AppError> {
    processors::reference::expand_reference(rows)
}

#[tauri::command]
fn normalize_bom_data(
    columns: Vec<ColumnMeta>,
    rows: Vec<Vec<String>>,
    column_roles: HashMap<String, String>,
) -> Result<Vec<BomRow>, AppError> {
    processors::normalizer::normalize_bom_data(columns, rows, column_roles)
}

#[tauri::command]
fn split_reference_rows(rows: Vec<BomRow>) -> Result<Vec<BomRow>, AppError> {
    processors::reference::split_reference_rows(rows)
}

#[tauri::command]
fn fill_blank_cells(rows: Vec<BomRow>) -> Result<Vec<BomRow>, AppError> {
    processors::cleaner::fill_blank_cells(rows)
}

#[tauri::command]
fn apply_format_rules(rows: Vec<BomRow>, options: FormatOptions) -> Result<Vec<BomRow>, AppError> {
    processors::formatter::apply_format_rules(rows, options)
}

#[tauri::command]
fn update_and_append_boms(bom_a: Vec<BomRow>, bom_b: Vec<BomRow>) -> Result<Vec<BomRow>, AppError> {
    diff::merge::update_and_append_boms(bom_a, bom_b)
}

#[tauri::command]
fn apply_ipc_names(
    bom: Vec<BomRow>,
    ipc_rules: Vec<IpcMasterRule>,
    exceptions: Vec<ExceptionMasterEntry>,
) -> Result<Vec<BomRow>, AppError> {
    matchers::ipc::apply_ipc_names(bom, ipc_rules, exceptions)
}

#[tauri::command]
fn cleanse_text_data(bom: Vec<BomRow>) -> Vec<BomRow> {
    processors::cleaner::cleanse_text_data(bom)
}

#[tauri::command]
fn load_dictionary(app: tauri::AppHandle, dictionary_name: String) -> Result<String, AppError> {
    storage::dictionary::load_dictionary(app, dictionary_name)
}

#[tauri::command]
fn save_dictionary(
    app: tauri::AppHandle,
    dictionary_name: String,
    content: String,
) -> Result<(), AppError> {
    storage::dictionary::save_dictionary(app, dictionary_name, content)
}

#[tauri::command]
fn save_session_to_file(path: String, content: String) -> Result<(), AppError> {
    storage::session::save_session_to_file(path, content)
}

#[tauri::command]
fn load_session_from_file(path: String) -> Result<String, AppError> {
    storage::session::load_session_from_file(path)
}

#[tauri::command]
fn export_bom_file(bom: Vec<BomRow>, options: ExportOptions) -> Result<String, AppError> {
    exporters::export_bom_file(bom, options)
}

#[tauri::command]
fn open_project_window(app: tauri::AppHandle, project_id: String) -> Result<(), AppError> {
    let sanitized_base: String = project_id
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_owned();

    let base_label = if sanitized_base.is_empty() {
        "project".to_string()
    } else {
        sanitized_base
    };

    let mut label = base_label.clone();
    let mut counter = 0usize;
    while app.get_webview_window(&label).is_some() {
        counter += 1;
        label = format!("{}-{}", base_label, counter);
    }

    let project_json = serde_json::to_string(&project_id)
        .map_err(|err| AppError::new(format!("プロジェクト情報のエンコードに失敗しました: {}", err)))?;

    WebviewWindowBuilder::new(&app, label, WebviewUrl::App("index.html".into()))
        .title(format!("BOMSyncTool - {}", project_id))
        .initialization_script(&format!(
            "window.__INITIAL_PROJECT_ID__ = {}; window.dispatchEvent(new CustomEvent('initial-project-ready'));",
            project_json
        ))
        .build()
        .map_err(|err| AppError::new(format!("タブを開けませんでした: {}", err)))?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            parse_bom_file,
            compare_boms,
            expand_reference,
            split_reference_rows,
            fill_blank_cells,
            apply_format_rules,
            update_and_append_boms,
            normalize_bom_data,
            cleanse_text_data,
            load_dictionary,
            save_dictionary,
            save_session_to_file,
            load_session_from_file,
            apply_ipc_names,
            export_bom_file,
            open_project_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
