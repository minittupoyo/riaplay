use discord_rich_presence::{
    activity::{Activity, Assets, ActivityType, Timestamps},
    DiscordIpc, DiscordIpcClient,
};
use std::{
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

/// Discord Developer Portal で作成したアプリケーションID。ビルド時に環境変数で渡す（未設定なら無効）
const CLIENT_ID: Option<&str> = option_env!("DISCORD_CLIENT_ID");

#[derive(Default)]
pub struct Discord(Mutex<Option<DiscordIpcClient>>);

impl Discord {
    /// 接続していなければ繋ぐ。Discord が起動していないときは None
    fn client<'a>(slot: &'a mut Option<DiscordIpcClient>) -> Option<&'a mut DiscordIpcClient> {
        if slot.is_none() {
            let mut c = DiscordIpcClient::new(CLIENT_ID?);
            c.connect().ok()?;
            *slot = Some(c);
        }
        slot.as_mut()
    }

    fn run(&self, f: impl Fn(&mut DiscordIpcClient) -> Result<(), discord_rich_presence::error::Error>) {
        let mut slot = self.0.lock().unwrap();
        let Some(c) = Self::client(&mut slot) else { return };
        if f(c).is_err() {
            // Discord が終了・再起動した場合は繋ぎ直して一度だけ再送する
            *slot = None;
            if let Some(c) = Self::client(&mut slot) {
                if f(c).is_err() {
                    *slot = None;
                }
            }
        }
    }
}

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// 再生中は経過時間バー付きで表示し、一時停止中は時間なしで表示する
#[tauri::command]
pub fn discord_update(state: tauri::State<Discord>, title: String, artist: String, album: String, cover_url: Option<String>, duration: f64, position: f64, playing: bool) {
    state.run(|c| {
        let mut a = Activity::new()
            .activity_type(ActivityType::Listening)
            .details(title.as_str())
            .state(artist.as_str());
        let mut assets = Assets::new();
        let mut has_assets = false;
        if !album.is_empty() {
            assets = assets.large_text(album.as_str());
            has_assets = true;
        }
        // 公開URL（https）のみ受け付ける。認証情報を含みうる URL は渡さない
        if let Some(u) = cover_url.as_deref().filter(|u| u.starts_with("https://") && !u.contains('@')) {
            assets = assets.large_image(u);
            has_assets = true;
        }
        if has_assets {
            a = a.assets(assets);
        }
        if playing && duration > 0.0 {
            let start = now_ms() - (position.max(0.0) * 1000.0) as i64;
            a = a.timestamps(Timestamps::new().start(start).end(start + (duration * 1000.0) as i64));
        }
        c.set_activity(a)
    });
}

#[tauri::command]
pub fn discord_clear(state: tauri::State<Discord>) {
    state.run(|c| c.clear_activity());
}
