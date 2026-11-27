use keyring::{Entry, Error};

/// OS のキーチェーン（macOS Keychain / Windows 資格情報マネージャー / Linux Secret Service）上のサービス名
const SERVICE: &str = "net.minittu.riaplay";

fn entry(key: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, key).map_err(|e| e.to_string())
}

// keyring は同期 API（Linux では D-Bus 通信でブロックする）なので、
// UI スレッドを止めないよう async コマンド + spawn_blocking で実行する。

/// パスワード等の秘密情報を保存（既存なら上書き）
#[tauri::command]
async fn secret_set(key: String, value: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || entry(&key)?.set_password(&value).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

/// 秘密情報を取得。存在しなければ None
#[tauri::command]
async fn secret_get(key: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || match entry(&key)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 秘密情報を削除。存在しなくてもエラーにしない
#[tauri::command]
async fn secret_delete(key: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || match entry(&key)?.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---- OS のメディアコントロール（Linux: MPRIS / macOS: Now Playing / Windows: SMTC）----
// WebKit 任せの Media Session だとシークなどが効かないので、souvlaki で直接公開する。
// OS からの操作は "media-control" イベントとしてフロントへ渡し、フロント側で再生を操作する。
mod audio;
use audio::Audio;
use souvlaki::{MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, MediaPosition, PlatformConfig, SeekDirection};
use std::{sync::Mutex, time::Duration};
use tauri::{Emitter, Manager};

/// 再生エンジンのスレッドからも位置を送るので Arc で共有する
pub type SharedControls = std::sync::Arc<Mutex<Option<MediaControls>>>;
struct Media(SharedControls);

fn control_payload(e: MediaControlEvent) -> Option<serde_json::Value> {
    use serde_json::json;
    let dir = |d: SeekDirection| if matches!(d, SeekDirection::Forward) { 1 } else { -1 };
    Some(match e {
        MediaControlEvent::Play => json!({ "kind": "play" }),
        MediaControlEvent::Pause => json!({ "kind": "pause" }),
        MediaControlEvent::Toggle => json!({ "kind": "toggle" }),
        MediaControlEvent::Next => json!({ "kind": "next" }),
        MediaControlEvent::Previous => json!({ "kind": "previous" }),
        MediaControlEvent::Stop => json!({ "kind": "stop" }),
        MediaControlEvent::Seek(d) => json!({ "kind": "seek_by", "dir": dir(d), "secs": 10.0 }),
        MediaControlEvent::SeekBy(d, t) => json!({ "kind": "seek_by", "dir": dir(d), "secs": t.as_secs_f64() }),
        MediaControlEvent::SetPosition(MediaPosition(t)) => json!({ "kind": "seek_to", "secs": t.as_secs_f64() }),
        _ => return None,
    })
}

fn setup_media(app: &tauri::App, shared: &SharedControls) -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(target_os = "windows")]
    let hwnd = app.get_webview_window("main").and_then(|w| w.hwnd().ok()).map(|h| h.0 as *mut std::ffi::c_void);
    #[cfg(not(target_os = "windows"))]
    let hwnd = None;
    let mut controls = MediaControls::new(PlatformConfig { dbus_name: "riaplay", display_name: "riaplay", hwnd })
        .map_err(|e| format!("{e:?}"))?;
    let handle = app.handle().clone();
    controls
        .attach(move |e| {
            if let Some(p) = control_payload(e) {
                let _ = handle.emit("media-control", p);
            }
        })
        .map_err(|e| format!("{e:?}"))?;
    *shared.lock().unwrap() = Some(controls);
    Ok(())
}

/// 再生エンジン。初期化に失敗したときは None（フロントは <audio> にフォールバックする）
struct Engine(Option<Audio>);
impl Engine {
    fn get(&self) -> Result<&Audio, String> { self.0.as_ref().ok_or_else(|| "no-engine".to_string()) }
}

#[tauri::command]
fn audio_load(a: tauri::State<Engine>, url: String, paused: bool) -> Result<(), String> { a.get()?.load(&url, paused) }
#[tauri::command]
fn audio_pause(a: tauri::State<Engine>, paused: bool) -> Result<(), String> { a.get()?.set_pause(paused) }
#[tauri::command]
fn audio_seek(a: tauri::State<Engine>, secs: f64) -> Result<(), String> { a.get()?.seek(secs) }
#[tauri::command]
fn audio_stop(a: tauri::State<Engine>) -> Result<(), String> { a.get()?.stop() }
#[tauri::command]
fn audio_volume(a: tauri::State<Engine>, volume: f64) -> Result<(), String> { a.get()?.set_volume(volume) }
#[tauri::command]
fn audio_mute(a: tauri::State<Engine>, muted: bool) -> Result<(), String> { a.get()?.set_mute(muted) }

#[tauri::command]
fn media_update(state: tauri::State<Media>, title: String, artist: String, album: String, cover_url: Option<String>, duration: f64) {
    if let Some(c) = state.0.lock().unwrap().as_mut() {
        let _ = c.set_metadata(MediaMetadata {
            title: Some(&title),
            artist: Some(&artist),
            album: Some(&album),
            cover_url: cover_url.as_deref(),
            duration: (duration > 0.0).then(|| Duration::from_secs_f64(duration)),
        });
    }
}

/// status: "playing" | "paused" | "stopped"。position は秒
#[tauri::command]
fn media_playback(state: tauri::State<Media>, status: String, position: f64) {
    if let Some(c) = state.0.lock().unwrap().as_mut() {
        let progress = Some(MediaPosition(Duration::from_secs_f64(position.max(0.0))));
        let _ = c.set_playback(match status.as_str() {
            "playing" => MediaPlayback::Playing { progress },
            "paused" => MediaPlayback::Paused { progress },
            _ => MediaPlayback::Stopped,
        });
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            // 再生エンジン（libmpv）。失敗したらフロントは <audio> に切り替わる（audio_load が失敗する）
            let shared: SharedControls = Default::default();
            app.manage(Media(shared.clone()));
            let engine = Audio::new(app.handle().clone(), shared.clone()).map_err(|e| eprintln!("再生エンジンを初期化できませんでした: {e}")).ok();
            app.manage(Engine(engine));
            // OS 連携に失敗してもアプリ自体は動かす
            if let Err(e) = setup_media(app, &shared) {
                eprintln!("メディアコントロールを初期化できませんでした: {e}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![secret_set, secret_get, secret_delete, media_update, media_playback, audio_load, audio_pause, audio_seek, audio_stop, audio_volume, audio_mute])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::test::{get_ipc_response, mock_builder, mock_context, noop_assets, INVOKE_KEY};
    use tauri::webview::InvokeRequest;
    use tauri::{ipc::{CallbackFn, InvokeBody}, WebviewWindowBuilder};

    /// アプリと同じ invoke 経路で、実際の OS キーチェーンに対して保存・取得・上書き・削除を確かめる
    #[test]
    fn secrets_roundtrip_through_invoke() {
        let app = mock_builder()
            .invoke_handler(tauri::generate_handler![secret_set, secret_get, secret_delete])
            .build(mock_context(noop_assets()))
            .unwrap();
        let webview = WebviewWindowBuilder::new(&app, "main", Default::default()).build().unwrap();

        let call = |cmd: &str, body: serde_json::Value| {
            get_ipc_response(
                &webview,
                InvokeRequest {
                    cmd: cmd.into(),
                    callback: CallbackFn(0),
                    error: CallbackFn(1),
                    // アプリ本体と同じ「ローカル」オリジン。Windows は http://tauri.localhost、他は tauri://localhost
                    // （OS が違う方はリモート扱いで拒否される）
                    url: if cfg!(windows) { "http://tauri.localhost" } else { "tauri://localhost" }.parse().unwrap(),
                    body: InvokeBody::Json(body),
                    headers: Default::default(),
                    invoke_key: INVOKE_KEY.to_string(),
                },
            )
        };
        let key = "selftest:roundtrip";
        let get = || call("secret_get", serde_json::json!({ "key": key })).map(|r| r.deserialize::<Option<String>>().unwrap());

        let _ = call("secret_delete", serde_json::json!({ "key": key })); // 前回の残りを掃除
        assert_eq!(get().unwrap(), None, "存在しないキーは None");
        call("secret_set", serde_json::json!({ "key": key, "value": "ダミー🔑pass" })).unwrap();
        assert_eq!(get().unwrap(), Some("ダミー🔑pass".to_string()));
        call("secret_set", serde_json::json!({ "key": key, "value": "overwritten" })).unwrap();
        assert_eq!(get().unwrap(), Some("overwritten".to_string()), "上書きできる");
        call("secret_delete", serde_json::json!({ "key": key })).unwrap();
        assert_eq!(get().unwrap(), None, "削除後は None");
        call("secret_delete", serde_json::json!({ "key": key })).unwrap(); // 無くてもエラーにならない
    }
}
