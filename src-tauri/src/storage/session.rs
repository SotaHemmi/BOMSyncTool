use std::fs;
use std::path::PathBuf;

use crate::models::AppError;

pub fn save_session_to_file(path: String, content: String) -> Result<(), AppError> {
    let path = PathBuf::from(path);

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| {
            AppError::new(format!(
                "セッション保存先ディレクトリの作成に失敗しました: {err}"
            ))
        })?;
    }

    fs::write(&path, content).map_err(|err| {
        AppError::new(format!("セッションファイルの書き込みに失敗しました: {err}"))
    })?;

    Ok(())
}

pub fn load_session_from_file(path: String) -> Result<String, AppError> {
    let path = PathBuf::from(path);

    if !path.exists() {
        return Err(AppError::new(format!(
            "セッションファイルが見つかりません: {}",
            path.display()
        )));
    }

    let content = fs::read_to_string(&path).map_err(|err| {
        AppError::new(format!("セッションファイルの読み込みに失敗しました: {err}"))
    })?;

    Ok(content)
}
