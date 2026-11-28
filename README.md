# riaplay

Navidrome用のデスクトップ音楽プレイヤーです。画面はTauri 2とVue 3、音声はlibmpvで作っています。

![アルバム一覧](screenshots/album_list.png)

## 画面

アルバムを開くと曲が並びます。再生中の曲には、行の左にスピーカーのアイコンが付きます。

![アルバム詳細](screenshots/album_detail.png)

歌詞は右のパネルに出ます。同期歌詞では、いま歌っている行が白く浮き上がり、遠い行ほどぼけます。

![サイドバーの歌詞](screenshots/lyric_sidebar.png)

プレイヤーバーの拡大ボタンかジャケットをクリックすると、ウィンドウいっぱいの再生中画面になります。背景にはジャケットの色が広がり、前面にはシークバーと曲名だけが残ります。ジャケットにマウスを載せると、再生、前後の曲、シャッフル、リピート、音量、お気に入りが重なって出ます。

![再生中画面](screenshots/nowplay_screen.png)

## 機能

サーバーは何台でも登録して切り替えられます。パスワードはOSのキーチェーンに保存します。追加時に「パスワードを保存する」を外すと、起動中だけメモリに持ち、次の起動でまた聞かれます。

ライブラリはアルバム、アーティスト、プレイリスト、お気に入りに分かれ、検索もできます。サイドバーの更新ボタンで読み込み直せます。設定で5分から60分の間隔を選ぶと、自動でも更新します。

曲、アルバム、プレイリストの行やカードを右クリックすると、再生、次に再生、キューへの追加、プレイリストへの追加が出ます。キューはドラッグで並べ替えます。

曲はダウンロードして、オフラインで聴けます。サーバーに繋がらないときは、ダウンロード済みの曲だけでアプリが開きます。ダウンロードはデスクトップ版のみで、ブラウザで動かす開発時は使えません。

ストリーミング品質は、設定で最大ビットレートを選びます。原音以外を選ぶと、サーバーで変換した音が届きます。再生中のコーデック、サンプルレート、ビットレートは、プレイヤーバーの「i」ボタンで見られます。設定の「詳細情報を表示」をオンにすると出るボタンです。

OSのメディアキーとメディアコントロールにも繋がります。LinuxはMPRIS、WindowsはSMTC、macOSはNow Playingです。

DiscordのRich Presenceにも対応しています。Discord Developer Portalで作ったアプリケーションのIDを、ビルド時に環境変数`DISCORD_CLIENT_ID`で渡すと有効になります。未設定なら何もしません。ローカルのDiscordとIPCで通信するので、Discordを後から起動しても、次の曲の切り替えや再生操作で繋がります。
カバー画像は、サーバーのURLが認証情報を含むためそのままは使いません。代わりにアーティスト名とアルバム名だけを公開API(iTunes Search、Deezer、MusicBrainz/Cover Art Archive)に送って、ジャケット画像を探します。見つからなければ画像なしで表示します。

### 歌詞

歌詞は、サーバー(OpenSubsonicの歌詞に対応している場合)、[LRCLIB](https://lrclib.net)、NetEase Cloud Musicの順に探し、同期歌詞が見つかった時点で止めます。LRCLIBとNetEase Cloud Musicには、曲名、アーティスト名、アルバム名、再生時間が送られます。送りたくなければ、設定の「歌詞を取得する」をオフにします。

一度取った歌詞は端末のIndexedDBに残り、次からは問い合わせません。見つからなかった曲は7日後に探し直します。設定の「歌詞のキャッシュ」から消せます。

## 使い方

初回起動でサーバーのURL、ユーザー名、パスワードを入れます。2回目からは、前回のサーバーにそのまま繋がります。

## ビルド

BunとRust 1.85以降が必要です。[Tauriの前提パッケージ](https://tauri.app/start/prerequisites/)も入れておきます。

```sh
bun install
bun run tauri dev     # 開発用に起動
bun run tauri build   # インストーラーを作る
bun run build         # フロントエンドの型チェック(vue-tsc)とビルドだけ行う
```

libmpvの用意はプラットフォームごとに違います。

**Windows**は、先にlibmpvのDLLとインポートライブラリを取得します。

```powershell
powershell -ExecutionPolicy Bypass -File scripts/fetch-libmpv.ps1
```

`src-tauri/libs/windows/`に置かれ、ビルド時に実行ファイルの隣へ同梱されます。

**Linux**は開発用パッケージを入れます。libmpvは新しめのclient APIを使うので、CIはUbuntu 24.04でビルドしています。

```sh
sudo apt-get install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev \
  librsvg2-dev libssl-dev libdbus-1-dev libmpv-dev patchelf rpm
```

**macOS**は`brew install mpv`でコンパイルできます。libmpvを`.app`に入れる設定がまだなく、配布用のバンドルは作れません。

同梱の詳細は[src-tauri/libs/README.md](src-tauri/libs/README.md)にあります。

### テスト

```sh
cargo test --manifest-path src-tauri/Cargo.toml
```

キーチェーンの保存と取得を実機のOSで確かめるテストが入っています。LinuxのCIにはSecret Serviceがないため、このテストだけ飛ばしています。

## ライセンス

[MIT](LICENSE)
