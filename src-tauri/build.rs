fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        let root = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
        // libmpv のインポートライブラリ（mpv.lib）を libs/windows から探す。LIB 環境変数の設定は不要
        let dir = root.join("libs").join("windows");
        println!("cargo:rustc-link-search=native={}", dir.display());
        println!("cargo:rerun-if-changed={}", dir.display());
        // comctl32 v6 のマニフェストを、バイナリだけでなくテストの実行ファイルにも埋め込む。
        // Tauri 既定のマニフェストはバイナリにしか付かず、テストは起動時に STATUS_ENTRYPOINT_NOT_FOUND で落ちる。
        // 重複を避けるため Tauri 側のマニフェストは外し、同じ内容を windows.manifest として全ターゲットに付ける
        let manifest = root.join("windows.manifest");
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
        println!("cargo:rerun-if-changed={}", manifest.display());
        let attrs = tauri_build::Attributes::new().windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
        tauri_build::try_build(attrs).expect("failed to run tauri-build");
    } else {
        if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
            // scripts/fetch-libmpv-macos.sh が libs/macos に集めた libmpv があれば、それにリンクする。
            // 無ければ Homebrew の libmpv を使う（開発用）。同梱版は .app の Contents/Frameworks から読む
            let dir = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap()).join("libs").join("macos");
            if dir.join("libmpv.2.dylib").exists() {
                println!("cargo:rustc-link-search=native={}", dir.display());
                println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path/../Frameworks");
                if std::env::var("PROFILE").as_deref() == Ok("debug") {
                    println!("cargo:rustc-link-arg=-Wl,-rpath,{}", dir.display()); // tauri dev は .app にならないので
                }
            }
            println!("cargo:rerun-if-changed={}", dir.display());
        }
        tauri_build::build()
    }
}
