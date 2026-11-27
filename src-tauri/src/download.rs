//! オフライン再生用のダウンロード。ファイルの取得と保存・削除だけを担当し、
//! どの曲を保存したかの管理（一覧・メタデータ）はフロント側が持つ。
//! 進捗は download-progress {id, received, total} イベントで返す。

use serde::Serialize;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_http::reqwest;
use tokio::io::AsyncWriteExt;

/// 実行中のダウンロードの中止フラグ（id ごと）
#[derive(Default)]
pub struct Downloads(Mutex<HashMap<String, Arc<AtomicBool>>>);

#[derive(Serialize)]
pub struct Downloaded {
    path: String,
    size: u64,
}

/// 保存先のルート。アプリのデータフォルダの下の downloads
fn root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map(|p| p.join("downloads")).map_err(|e| e.to_string())
}

/// パスの一部として安全な文字だけにする（サーバー由来の ID に ".." や区切り文字が入っても外へ出られないように）
fn sanitize(s: &str) -> String {
    let t: String = s.chars().take(100).map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' }).collect();
    if t.is_empty() { "_".into() } else { t }
}

/// 拡張子を Content-Disposition のファイル名、なければ Content-Type から決める。mpv は中身で判別するので、分からなければ bin のまま
fn ext_of(h: &reqwest::header::HeaderMap) -> String {
    if let Some(cd) = h.get(reqwest::header::CONTENT_DISPOSITION).and_then(|v| v.to_str().ok()) {
        let lower = cd.to_ascii_lowercase(); // ASCII だけ変えるので、長さは元の文字列と同じ
        if let Some(i) = lower.rfind("filename") {
            let rest = &cd[i..];
            if let Some(eq) = rest.find('=') {
                let name = rest[eq + 1..].trim().trim_start_matches("UTF-8''").trim_matches(|c| c == '"' || c == ';' || c == ' ');
                if let Some(dot) = name.rfind('.') {
                    let e: String = name[dot + 1..].chars().filter(|c| c.is_ascii_alphanumeric()).collect();
                    if !e.is_empty() && e.len() <= 5 {
                        return e.to_lowercase();
                    }
                }
            }
        }
    }
    let ct = h.get(reqwest::header::CONTENT_TYPE).and_then(|v| v.to_str().ok()).unwrap_or("").to_ascii_lowercase();
    match ct.split(';').next().unwrap_or("").trim() {
        "audio/flac" | "audio/x-flac" => "flac",
        "audio/mpeg" | "audio/mp3" => "mp3",
        "audio/mp4" | "audio/x-m4a" | "audio/m4a" | "audio/aac" => "m4a",
        "audio/ogg" | "application/ogg" => "ogg",
        "audio/opus" => "opus",
        "audio/wav" | "audio/x-wav" | "audio/wave" => "wav",
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/webp" => "webp",
        _ => "bin",
    }
    .to_string()
}

/// URL を dir/name.<拡張子> に保存する。途中は .part に書き、完了したら名前を付け替える
async fn run(url: reqwest::Url, dir: &Path, name: &str, cancel: &AtomicBool, on_progress: impl Fn(u64, u64)) -> Result<Downloaded, String> {
    tokio::fs::create_dir_all(dir).await.map_err(|e| e.to_string())?;
    let client = reqwest::Client::builder().user_agent("riaplay").connect_timeout(Duration::from_secs(15)).build().map_err(|e| e.to_string())?;
    let mut resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }
    // Subsonic はエラーのときも 200 で JSON を返す
    let ct = resp.headers().get(reqwest::header::CONTENT_TYPE).and_then(|v| v.to_str().ok()).unwrap_or("").to_ascii_lowercase();
    if ct.starts_with("application/json") || ct.starts_with("text/") {
        return Err("サーバーがファイルを返しませんでした".into());
    }
    let ext = ext_of(resp.headers());
    let dest = dir.join(format!("{name}.{ext}"));
    let part = dir.join(format!("{name}.{ext}.part"));
    let total = resp.content_length().unwrap_or(0);
    let mut file = tokio::fs::File::create(&part).await.map_err(|e| e.to_string())?;
    let mut received = 0u64;
    let mut last = Instant::now();
    let res: Result<(), String> = async {
        loop {
            if cancel.load(Ordering::Relaxed) {
                return Err("cancelled".into());
            }
            match resp.chunk().await.map_err(|e| e.to_string())? {
                Some(c) => {
                    file.write_all(&c).await.map_err(|e| e.to_string())?;
                    received += c.len() as u64;
                    if last.elapsed() >= Duration::from_millis(150) {
                        last = Instant::now();
                        on_progress(received, total);
                    }
                }
                None => break,
            }
        }
        file.flush().await.map_err(|e| e.to_string())
    }
    .await;
    drop(file);
    if let Err(e) = res {
        let _ = tokio::fs::remove_file(&part).await;
        return Err(e);
    }
    let _ = tokio::fs::remove_file(&dest).await;
    tokio::fs::rename(&part, &dest).await.map_err(|e| e.to_string())?;
    on_progress(received, total.max(received));
    Ok(Downloaded { path: dest.to_string_lossy().into_owned(), size: received })
}

/// dir: 保存先のサブフォルダ（サーバーごと）、name: 拡張子を除いたファイル名。どちらも安全な文字に直して使う
#[tauri::command]
pub async fn download_file(app: AppHandle, state: State<'_, Downloads>, id: String, url: String, dir: String, name: String) -> Result<Downloaded, String> {
    let url = reqwest::Url::parse(&url).map_err(|e| e.to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("http(s) 以外は取得できません".into());
    }
    let dir = root(&app)?.join(sanitize(&dir));
    let cancel = Arc::new(AtomicBool::new(false));
    state.0.lock().unwrap().insert(id.clone(), cancel.clone());
    let handle = app.clone();
    let key = id.clone();
    let result = run(url, &dir, &sanitize(&name), &cancel, move |received, total| {
        let _ = handle.emit("download-progress", serde_json::json!({ "id": key, "received": received, "total": total }));
    })
    .await;
    state.0.lock().unwrap().remove(&id);
    result
}

#[tauri::command]
pub fn download_cancel(state: State<'_, Downloads>, id: String) {
    if let Some(flag) = state.0.lock().unwrap().get(&id) {
        flag.store(true, Ordering::Relaxed);
    }
}

/// 保存したファイルを消す。downloads フォルダの外は消さない。すでに無ければ成功扱い
#[tauri::command]
pub async fn download_delete(app: AppHandle, path: String) -> Result<(), String> {
    let Ok(root) = root(&app)?.canonicalize() else { return Ok(()) };
    let file = match PathBuf::from(&path).canonicalize() {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e.to_string()),
    };
    if !file.starts_with(&root) {
        return Err("保存フォルダの外は削除できません".into());
    }
    tokio::fs::remove_file(&file).await.map_err(|e| e.to_string())?;
    if let Some(parent) = file.parent() {
        let _ = tokio::fs::remove_dir(parent).await; // 空になったときだけ消える
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    #[test]
    fn sanitize_removes_path_characters() {
        assert_eq!(sanitize("../../etc/passwd"), "______etc_passwd");
        assert_eq!(sanitize("a1-B_2"), "a1-B_2");
        assert_eq!(sanitize(""), "_");
    }

    #[test]
    fn ext_from_disposition_then_content_type() {
        let mut h = reqwest::header::HeaderMap::new();
        h.insert(reqwest::header::CONTENT_DISPOSITION, "attachment; filename=\"01 Song.FLAC\"".parse().unwrap());
        assert_eq!(ext_of(&h), "flac");
        let mut h = reqwest::header::HeaderMap::new();
        h.insert(reqwest::header::CONTENT_DISPOSITION, "attachment; filename*=UTF-8''%E6%9B%B2.m4a".parse().unwrap());
        assert_eq!(ext_of(&h), "m4a");
        let mut h = reqwest::header::HeaderMap::new();
        h.insert(reqwest::header::CONTENT_TYPE, "audio/mpeg".parse().unwrap());
        assert_eq!(ext_of(&h), "mp3");
        assert_eq!(ext_of(&reqwest::header::HeaderMap::new()), "bin");
    }

    /// 1 回だけ応答する HTTP サーバー。URL を返す
    fn serve(headers: &'static str, body: &'static [u8]) -> String {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = l.local_addr().unwrap();
        std::thread::spawn(move || {
            let (mut s, _) = l.accept().unwrap();
            let mut buf = [0u8; 2048];
            let _ = s.read(&mut buf);
            let _ = s.write_all(format!("HTTP/1.1 200 OK\r\n{headers}Content-Length: {}\r\nConnection: close\r\n\r\n", body.len()).as_bytes());
            let _ = s.write_all(body);
        });
        format!("http://{addr}/rest/download")
    }

    fn temp_dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("riaplay-test-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        d
    }

    #[test]
    fn downloads_a_file_and_reports_progress() {
        let url = serve("Content-Type: audio/flac\r\n", b"fLaC-test-data");
        let dir = temp_dir("ok");
        let seen = Mutex::new(Vec::new());
        let r = tauri::async_runtime::block_on(run(url.parse().unwrap(), &dir, "song1", &AtomicBool::new(false), |r, t| seen.lock().unwrap().push((r, t)))).unwrap();
        assert!(r.path.ends_with("song1.flac"));
        assert_eq!(r.size, 14);
        assert_eq!(std::fs::read(&r.path).unwrap(), b"fLaC-test-data");
        assert!(!dir.join("song1.flac.part").exists(), "途中ファイルは残らない");
        assert_eq!(*seen.lock().unwrap().last().unwrap(), (14, 14));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_a_json_error_response() {
        let url = serve("Content-Type: application/json\r\n", b"{\"subsonic-response\":{\"status\":\"failed\"}}");
        let dir = temp_dir("json");
        let r = tauri::async_runtime::block_on(run(url.parse().unwrap(), &dir, "x", &AtomicBool::new(false), |_, _| {}));
        assert!(r.is_err());
        assert!(!dir.join("x.json").exists() && !dir.join("x.bin").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn cancelled_download_leaves_no_file() {
        let url = serve("Content-Type: audio/mpeg\r\n", b"abc");
        let dir = temp_dir("cancel");
        let r = tauri::async_runtime::block_on(run(url.parse().unwrap(), &dir, "c", &AtomicBool::new(true), |_, _| {}));
        assert_eq!(r.err().as_deref(), Some("cancelled"));
        let left: Vec<_> = std::fs::read_dir(&dir).map(|d| d.flatten().collect()).unwrap_or_default();
        assert!(left.is_empty(), "{left:?}");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
