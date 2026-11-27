# libmpv の同梱

再生エンジンに libmpv を使っています（`src/audio.rs`）。配布物には次のように含めます。

## Linux
`tauri.conf.json` の `bundle.linux` で、deb は `libmpv2`（libmpv1 は API が古く、使えない）、rpm は `mpv-libs` に依存させています（利用者の環境にあれば入れ直しは不要）。
AppImage は `linuxdeploy` がリンク先の共有ライブラリ（libmpv とその依存）を自動で取り込みます。

## Windows
ビルド時とバンドル時に、次の 2 つが必要です（リポジトリには含めていません）。
1. リンク用: `mpv.lib` — libmpv の開発用アーカイブ（[shinchiro のビルド](https://github.com/shinchiro/mpv-winbuild-cmake/releases) などの `mpv-dev-x86_64-*.7z`）に含まれる `libmpv.dll.a` から作る（`lib /def:mpv.def /machine:x64 /out:mpv.lib`）。置き場所を環境変数 `LIB` に通す。
2. 実行時: `libmpv-2.dll`（同アーカイブの `libmpv-2.dll`）を `src-tauri/libs/windows/libmpv-2.dll` に置く。`tauri.windows.conf.json` が、実行ファイルの隣へ同梱します。

> Windows 向けのビルドは、この環境では試していません。手順は libmpv2 クレートの案内に沿ったものです。

## macOS
`brew install mpv` でビルドできます。配布時は `libmpv.2.dylib` とその依存を `.app` の Frameworks へ入れ、`install_name_tool` で参照先を書き換える必要があります（`dylibbundler` が使えます）。設定はまだ入れていません。
