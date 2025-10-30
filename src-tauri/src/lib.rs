pub mod models;
pub mod utils;

mod diff;
mod exporters;
mod matchers;
mod parsers;
mod processors;
mod storage;

use models::{AppError, DiffRow, ExceptionMasterEntry, FormatOptions, IpcMasterRule, ParseResult};
use serde::Deserialize;
use serde_json;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
fn parse_bom_file(path: String) -> Result<ParseResult, AppError> {
    parsers::parse_bom_file(path)
}

/// 2つのBOMを比較し、差分を返す
///
/// # 引数
/// * `parse_a` - BOM A（比較元）
/// * `parse_b` - BOM B（比較先）
///
/// # 戻り値
/// 差分情報のリスト（追加/削除/変更/一致）
#[tauri::command]
fn compare_boms(parse_a: ParseResult, parse_b: ParseResult) -> Vec<DiffRow> {
    diff::compare::compare_boms(&parse_a, &parse_b)
}

/// Reference列を展開する（例: "C1-C5" → 5行に分割）
///
/// # 引数
/// * `parse` - 元のBOMデータ
///
/// # 戻り値
/// 展開後のBOMデータ
#[tauri::command]
fn expand_reference(parse: ParseResult) -> Result<ParseResult, AppError> {
    processors::reference::expand_reference(&parse)
}

/// Reference列を分割する（例: "C1,C2,C3" を含む1行 → 3行に分割）
///
/// # 引数
/// * `parse` - 元のBOMデータ
///
/// # 戻り値
/// 分割後のBOMデータ
#[tauri::command]
fn split_reference_rows(parse: ParseResult) -> Result<ParseResult, AppError> {
    processors::reference::split_reference_rows(&parse)
}

/// 空欄セルを上の行の値で埋める
///
/// # 引数
/// * `parse` - 元のBOMデータ
///
/// # 戻り値
/// 空欄補完後のBOMデータ
#[tauri::command]
fn fill_blank_cells(parse: ParseResult) -> Result<ParseResult, AppError> {
    processors::cleaner::fill_blank_cells(&parse)
}

/// 書式整形ルールを適用する
///
/// # 引数
/// * `parse` - 元のBOMデータ
/// * `options` - 書式オプション
///
/// # 戻り値
/// 整形後のBOMデータ
#[tauri::command]
fn apply_format_rules(parse: ParseResult, options: FormatOptions) -> Result<ParseResult, AppError> {
    Ok(processors::formatter::apply_format_rules(&parse, &options))
}

/// BOM AをBOM Bで更新し、Bの新規行を追加
///
/// # 引数
/// * `parse_a` - 更新元のBOM
/// * `parse_b` - 更新内容のBOM
///
/// # 戻り値
/// マージ後のBOMデータ
#[tauri::command]
fn update_and_append_boms(
    parse_a: ParseResult,
    parse_b: ParseResult,
) -> Result<ParseResult, AppError> {
    diff::merge::update_and_append_boms(&parse_a, &parse_b)
}

/// IPC登録名をBOMに適用
///
/// # 引数
/// * `parse` - 元のBOMデータ
/// * `ipc_rules` - IPC登録名ルール
/// * `exceptions` - 例外マスタエントリ
///
/// # 戻り値
/// IPC登録名が適用されたBOMデータ
#[tauri::command]
fn apply_ipc_names(
    parse: ParseResult,
    ipc_rules: Vec<IpcMasterRule>,
    exceptions: Vec<ExceptionMasterEntry>,
) -> Result<ParseResult, AppError> {
    matchers::ipc::apply_ipc_names(&parse, ipc_rules, exceptions)
}

/// テキストデータをクレンジングする（空白削除、正規化）
///
/// # 引数
/// * `parse` - 元のBOMデータ
///
/// # 戻り値
/// クレンジング後のBOMデータ
#[tauri::command]
fn cleanse_text_data(parse: ParseResult) -> ParseResult {
    processors::cleaner::cleanse_text_data(&parse)
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

/// BOMファイルをエクスポート
///
/// # 引数
/// * `parse` - エクスポートするBOMデータ
/// * `format` - 出力フォーマット（"csv", "eco", "ccf", "msf"）
/// * `diffs` - 差分情報（差分コメント用）
/// * `include_comments` - 差分コメントを含めるか
///
/// # 戻り値
/// エクスポートされたファイル内容（文字列）
#[tauri::command]
fn export_bom_file(
    parse: ParseResult,
    format: String,
    diffs: Option<Vec<DiffRow>>,
    include_comments: bool,
) -> Result<String, AppError> {
    exporters::export_bom_file(&parse, &format, diffs.as_deref(), include_comments)
}

#[derive(Deserialize)]
struct WindowPosition {
    x: f64,
    y: f64,
}

#[tauri::command]
fn open_project_window(
    app: tauri::AppHandle,
    project_id: String,
    position: Option<WindowPosition>,
) -> Result<(), AppError> {
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

    let project_json = serde_json::to_string(&project_id).map_err(|err| {
        AppError::new(format!(
            "プロジェクト情報のエンコードに失敗しました: {}",
            err
        ))
    })?;

    let mut builder = WebviewWindowBuilder::new(&app, label, WebviewUrl::App("index.html".into()))
        .title(format!("BOMSyncTool - {}", project_id))
        .initialization_script(&format!(
            "window.__INITIAL_PROJECT_ID__ = {}; window.dispatchEvent(new CustomEvent('initial-project-ready'));",
            project_json
        ));

    if let Some(pos) = position {
        builder = builder.position(pos.x, pos.y);
    }

    builder
        .build()
        .map_err(|err| AppError::new(format!("タブを開けませんでした: {}", err)))?;

    Ok(())
}

/// プロジェクトデータを別ウィンドウに転送（元ウィンドウからは削除）
///
/// # 引数
/// * `app` - Tauriアプリケーションハンドル
/// * `target_label` - 転送先ウィンドウのラベル
/// * `project_data` - プロジェクトデータ（JSON文字列）
///
/// # 戻り値
/// 成功時は Ok(())
#[tauri::command]
fn transfer_project_to_window(
    app: tauri::AppHandle,
    target_label: String,
    project_data: String,
) -> Result<(), AppError> {
    // ターゲットウィンドウを取得
    let target_window = app
        .get_webview_window(&target_label)
        .ok_or_else(|| AppError::new("ターゲットウィンドウが見つかりません".to_string()))?;

    // JavaScriptイベントを発火してプロジェクトデータを送信
    target_window
        .emit("merge-project", project_data)
        .map_err(|err| {
            AppError::new(format!(
                "プロジェクト転送イベントの送信に失敗しました: {}",
                err
            ))
        })?;

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
            cleanse_text_data,
            load_dictionary,
            save_dictionary,
            save_session_to_file,
            load_session_from_file,
            apply_ipc_names,
            export_bom_file,
            open_project_window,
            transfer_project_to_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
