# 開発ガイド

riaplayのビルド、テスト、リリースの手順です。

## ビルド

BunとRust 1.85以降が必要です。[Tauriの前提パッケージ](https://tauri.app/start/prerequisites/)も入れておきます。

```sh
bun install
bun run tauri dev     # 開発用に起動
bun run tauri build   # インストーラーを作る
bun run build         # 型チェック(vue-tsc)とフロントエンドのビルドだけ行う
```

libmpvの用意はプラットフォームごとに違います。

**Windows**は、先にlibmpvを取得します。`src-tauri/libs/windows/`に置かれ、ビルド時に同梱されます。

```powershell
powershell -ExecutionPolicy Bypass -File scripts/fetch-libmpv.ps1
```

**Linux**は開発用パッケージを入れます。libmpvのclient APIが新しめなので、CIはUbuntu 24.04を使っています。

```sh
sudo apt-get install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev \
  librsvg2-dev libssl-dev libdbus-1-dev libmpv-dev patchelf rpm
```

**macOS**は`brew install mpv`でコンパイルできます。libmpvを`.app`に入れる設定がまだなく、配布用のバンドルは作れません。

同梱の詳細は[src-tauri/libs/README.md](src-tauri/libs/README.md)にあります。

Rich Presenceを使うビルドでは、Discord Developer Portalで作ったアプリケーションのIDを、環境変数`DISCORD_CLIENT_ID`で渡します。

## テスト

```sh
cargo test --manifest-path src-tauri/Cargo.toml
```

キーチェーンの保存と取得を実機のOSで確かめるテストが含まれます。LinuxのCIにはSecret Serviceがないため、このテストだけ飛ばしています。

## リリース

`package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`のバージョンを揃えてコミットし、タグをプッシュします。CIがビルドして、ドラフトのリリースを作ります。

```sh
git tag v0.2.0
git push origin v0.2.0
```

リポジトリのシークレットに`DISCORD_CLIENT_ID`を登録しておくと、リリース版でもRich Presenceが動きます。
