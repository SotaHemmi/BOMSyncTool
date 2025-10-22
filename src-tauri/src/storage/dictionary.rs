use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

use tauri::Manager;

use crate::models::{AppError, IpcMasterRule};

fn ensure_dictionary_path(
    app: &tauri::AppHandle,
    dictionary_name: &str,
) -> Result<(PathBuf, PathBuf), AppError> {
    let file_name = dictionary_file_name(dictionary_name)
        .ok_or_else(|| AppError::new(format!("未知の辞書名です: {dictionary_name}")))?;

    let base_dir = app
        .path()
        .app_config_dir()
        .map_err(|err| AppError::new(format!("設定ディレクトリの取得に失敗しました: {err}")))?;

    let dictionaries_dir = base_dir.join("dictionaries");
    let file_path = dictionaries_dir.join(file_name);

    Ok((dictionaries_dir, file_path))
}

fn dictionary_file_name(name: &str) -> Option<&'static str> {
    match name {
        "ipc_master" => Some("ipc_master.json"),
        "exception_master" => Some("exception_master.json"),
        "column_alias" => Some("column_alias.json"),
        _ => None,
    }
}

pub fn load_dictionary(app: tauri::AppHandle, dictionary_name: String) -> Result<String, AppError> {
    let (dictionaries_dir, file_path) = ensure_dictionary_path(&app, &dictionary_name)?;

    if !file_path.exists() {
        fs::create_dir_all(&dictionaries_dir)
            .map_err(|err| AppError::new(format!("辞書ディレクトリの作成に失敗しました: {err}")))?;
        return Ok("[]".to_string());
    }

    let content = fs::read_to_string(&file_path)
        .map_err(|err| AppError::new(format!("辞書ファイルの読み込みに失敗しました: {err}")))?;

    Ok(content)
}

pub fn save_dictionary(
    app: tauri::AppHandle,
    dictionary_name: String,
    content: String,
) -> Result<(), AppError> {
    let (dictionaries_dir, file_path) = ensure_dictionary_path(&app, &dictionary_name)?;

    if dictionary_name == "ipc_master" {
        let rules: Vec<IpcMasterRule> = serde_json::from_str(&content)
            .map_err(|err| AppError::new(format!("登録名マスタの解析に失敗しました: {err}")))?;
        let mut seen = HashSet::new();
        for rule in rules {
            let name = rule.rule_name.trim();
            if name.is_empty() {
                continue;
            }
            if !seen.insert(name.to_string()) {
                return Err(AppError::new(format!("ルール名'{}'が重複しています。", name)));
            }
        }
    }

    fs::create_dir_all(&dictionaries_dir)
        .map_err(|err| AppError::new(format!("辞書ディレクトリの作成に失敗しました: {err}")))?;

    fs::write(&file_path, content)
        .map_err(|err| AppError::new(format!("辞書ファイルの書き込みに失敗しました: {err}")))?;

    Ok(())
}
