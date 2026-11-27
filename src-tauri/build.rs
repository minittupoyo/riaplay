fn main() {
    // Windows: libmpv のインポートライブラリ（mpv.lib）を libs/windows から探す。LIB 環境変数の設定は不要
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        let dir = std::path::Path::new(&std::env::var("CARGO_MANIFEST_DIR").unwrap()).join("libs").join("windows");
        println!("cargo:rustc-link-search=native={}", dir.display());
        println!("cargo:rerun-if-changed={}", dir.display());
    }
    tauri_build::build()
}
