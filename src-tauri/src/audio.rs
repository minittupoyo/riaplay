//! 音声の再生エンジン（libmpv）。キューや UI はフロント側で持ち、ここは「1 本のストリームを鳴らす」ことだけを担当する。
//! 状態の変化は次のイベントでフロントへ返す:
//!   audio-position {secs} / audio-duration {secs} / audio-paused {paused} / audio-ended / audio-error {message}

use crate::SharedControls;
use libmpv2::{events::*, mpv_end_file_reason, Format, Mpv};
use souvlaki::{MediaPlayback, MediaPosition};
use std::{sync::Arc, thread, time::Duration};
use tauri::{AppHandle, Emitter};

pub struct Audio(Arc<Mpv>);

impl Audio {
    pub fn new(app: AppHandle, controls: SharedControls) -> Result<Self, String> {
        // libmpv は LC_NUMERIC が "C" でないと初期化に失敗する（GTK が環境のロケールを設定してしまうため）
        #[cfg(unix)]
        unsafe {
            libc::setlocale(libc::LC_NUMERIC, c"C".as_ptr());
        }
        let mpv = Mpv::with_initializer(|init| {
            init.set_property("vo", "null")?; // 映像は使わない
            init.set_property("video", "no")?;
            init.set_property("audio-display", "no")?; // ジャケット画像を映像として開かない
            init.set_property("idle", "yes")?; // 何も読み込んでいなくても終了しない
            init.set_property("keep-open", "no")?;
            init.set_property("config", "no")?; // ユーザーの mpv 設定を読まない
            init.set_property("input-default-bindings", "no")?;
            init.set_property("terminal", "no")?;
            init.set_property("ytdl", "no")?;
            init.set_property("cache", "yes")?;
            init.set_property("demuxer-max-bytes", "64MiB")?;
            init.set_property("network-timeout", 15)?;
            init.set_property("user-agent", "riaplay")?;
            Ok(())
        })
        .map_err(|e| format!("{e:?}"))?;
        let mpv = Arc::new(mpv);

        // イベント用のクライアントは別スレッドへ渡す
        let client = mpv.create_client(None).map_err(|e| format!("{e:?}"))?;
        client.disable_deprecated_events().map_err(|e| format!("{e:?}"))?;
        client.observe_property("time-pos", Format::Double, 0).map_err(|e| format!("{e:?}"))?;
        client.observe_property("duration", Format::Double, 0).map_err(|e| format!("{e:?}"))?;
        client.observe_property("pause", Format::Flag, 0).map_err(|e| format!("{e:?}"))?;

        thread::spawn(move || {
            let mut last_pos = f64::NEG_INFINITY;
            let mut paused = false;
            // OS（MPRIS など）へ、libmpv の実際の位置をそのまま送る。フロント経由だと補間でぶれるため
            let push = |pos: f64, paused: bool| {
                if let Some(c) = controls.lock().unwrap().as_mut() {
                    let progress = Some(MediaPosition(Duration::from_secs_f64(pos.max(0.0))));
                    let _ = c.set_playback(if paused { MediaPlayback::Paused { progress } } else { MediaPlayback::Playing { progress } });
                }
            };
            loop {
                let Some(ev) = client.wait_event(1.0) else { continue };
                match ev {
                    Ok(Event::Shutdown) => break,
                    Ok(Event::PropertyChange { name, change, .. }) => match (name, change) {
                        ("time-pos", PropertyData::Double(p)) => {
                            // 更新が非常に細かいので、0.2 秒以上動いたときだけ送る（フロントで補間する）
                            if (p - last_pos).abs() >= 0.2 || p < last_pos {
                                last_pos = p;
                                let _ = app.emit("audio-position", serde_json::json!({ "secs": p }));
                                push(p, paused);
                            }
                        }
                        ("duration", PropertyData::Double(d)) => {
                            let _ = app.emit("audio-duration", serde_json::json!({ "secs": d }));
                        }
                        ("pause", PropertyData::Flag(p)) => {
                            paused = p;
                            let _ = app.emit("audio-paused", serde_json::json!({ "paused": p }));
                        }
                        _ => {}
                    },
                    Ok(Event::StartFile) => last_pos = f64::NEG_INFINITY,
                    Ok(Event::EndFile(r)) => {
                        if r == mpv_end_file_reason::Eof {
                            let _ = app.emit("audio-ended", ());
                        } else if r == mpv_end_file_reason::Error {
                            let _ = app.emit("audio-error", serde_json::json!({ "message": "再生できませんでした" }));
                        }
                        // Stop / Redirect は、読み込み直しなどによる意図した停止
                    }
                    _ => {}
                }
            }
        });
        Ok(Audio(mpv))
    }

    fn cmd(&self, name: &str, args: &[&str]) -> Result<(), String> {
        self.0.command(name, args).map_err(|e| format!("{e:?}"))
    }

    pub fn load(&self, url: &str, paused: bool) -> Result<(), String> {
        self.0.set_property("pause", paused).map_err(|e| format!("{e:?}"))?;
        self.cmd("loadfile", &[url, "replace"])
    }
    pub fn set_pause(&self, p: bool) -> Result<(), String> {
        self.0.set_property("pause", p).map_err(|e| format!("{e:?}"))
    }
    pub fn seek(&self, secs: f64) -> Result<(), String> {
        self.cmd("seek", &[&secs.to_string(), "absolute"])
    }
    pub fn stop(&self) -> Result<(), String> {
        self.cmd("stop", &[])
    }
    /// 0.0〜1.0
    pub fn set_volume(&self, v: f64) -> Result<(), String> {
        self.0.set_property("volume", (v.clamp(0.0, 1.0) * 100.0).round() as i64).map_err(|e| format!("{e:?}"))
    }
    pub fn set_mute(&self, m: bool) -> Result<(), String> {
        self.0.set_property("mute", m).map_err(|e| format!("{e:?}"))
    }
}
