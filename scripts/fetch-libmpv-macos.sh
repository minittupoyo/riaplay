#!/bin/sh
# Collect libmpv and its dependencies into src-tauri/libs/macos (needs: brew install mpv dylibbundler).
# Every dylib is rewritten to load its dependencies through @rpath, so the app can ship them in Contents/Frameworks.
# Usage: sh scripts/fetch-libmpv-macos.sh
set -eu
dest="$(cd "$(dirname "$0")/.." && pwd)/src-tauri/libs/macos"
if [ -f "$dest/libmpv.2.dylib" ]; then
  echo "libmpv already present"
else
  prefix="$(brew --prefix mpv)"
  mkdir -p "$dest"
  cp "$prefix/lib/libmpv.2.dylib" "$dest/libmpv.2.dylib"
  chmod u+w "$dest/libmpv.2.dylib"
  install_name_tool -id @rpath/libmpv.2.dylib "$dest/libmpv.2.dylib"
  dylibbundler -of -b -x "$dest/libmpv.2.dylib" -d "$dest" -p @rpath/ -s "$(brew --prefix)/lib"

  # dylibbundler leaves duplicate "@rpath/" LC_RPATH entries that the linker rejects. The app's own rpath is enough
  for lib in "$dest"/*.dylib; do
    [ -L "$lib" ] && continue
    otool -l "$lib" | awk '/LC_RPATH/{r=1} r&&/path /{print $2; r=0}' | while read -r rp; do
      install_name_tool -delete_rpath "$rp" "$lib" 2>/dev/null || true
    done
    codesign --force --sign - "$lib" 2>/dev/null
  done
  ln -sf libmpv.2.dylib "$dest/libmpv.dylib" # the linker looks for -lmpv
  echo "libmpv placed in $dest"
fi

# Bottles built for a newer macOS crash at launch on older ones (missing symbols)
max="${MACOS_MIN_MAJOR:-15}"
for lib in "$dest"/*.dylib; do
  minos="$(otool -l "$lib" | awk '/minos/{print $2; exit}')"
  [ "${minos%%.*}" -le "$max" ] || { echo "error: $(basename "$lib") needs macOS $minos (max $max)" >&2; exit 1; }
done
