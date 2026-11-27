# libmpv の同梱

再生エンジンに libmpv を使っています（`src/audio.rs`）。配布物には次のように含めます。

## Linux
`tauri.conf.json` の `bundle.linux` で、deb は `libmpv2`（libmpv1 は API が古く、使えない）、rpm は `mpv-libs` に依存させています（利用者の環境にあれば入れ直しは不要）。
AppImage は `linuxdeploy` がリンク先の共有ライブラリ（libmpv とその依存）を自動で取り込みます。

## Windows
ビルド時とバンドル時に、`src-tauri/libs/windows/` へ次の 2 つが必要です（リポジトリには含めていません）。
- `mpv.lib`: リンク用のインポートライブラリ（shinchiro のビルドの `libmpv.dll.a` をそのまま改名したもの。MSVC のリンカーが読める）
- `libmpv-2.dll`: 実行時に使う DLL。`tauri.windows.conf.json` が、実行ファイルの隣へ同梱します

どちらも次のスクリプトで取得できます。`build.rs` がこのフォルダをリンク検索パスに加えるので、`LIB` の設定は要りません。

```powershell
powershell -File scripts/fetch-libmpv.ps1
```

> `cargo test` は Windows では起動時に `STATUS_ENTRYPOINT_NOT_FOUND` で落ちます（Tauri のテストに必要なマニフェストが無いため）。ビルドと実行には影響しません。

## macOS
`brew install mpv` でビルドできます。配布時は `libmpv.2.dylib` とその依存を `.app` の Frameworks へ入れ、`install_name_tool` で参照先を書き換える必要があります（`dylibbundler` が使えます）。設定はまだ入れていません。
