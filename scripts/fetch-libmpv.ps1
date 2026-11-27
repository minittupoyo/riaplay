# Windows 用の libmpv（libmpv-2.dll と mpv.lib）を src-tauri/libs/windows へ取得する。
# 使い方: powershell -File scripts/fetch-libmpv.ps1
$ErrorActionPreference = 'Stop'
$dest = Join-Path $PSScriptRoot '..\src-tauri\libs\windows'
if ((Test-Path "$dest\libmpv-2.dll") -and (Test-Path "$dest\mpv.lib")) { Write-Host 'libmpv は取得済みです'; exit 0 }
New-Item -ItemType Directory -Force $dest | Out-Null

$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'aarch64' } else { 'x86_64' }
$rel = Invoke-RestMethod 'https://api.github.com/repos/shinchiro/mpv-winbuild-cmake/releases/latest'
$asset = $rel.assets | Where-Object { $_.name -match "^mpv-dev-$arch-\d" } | Select-Object -First 1
if (-not $asset) { throw "mpv-dev-$arch が見つかりません" }

$tmp = Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid())
New-Item -ItemType Directory $tmp | Out-Null
try {
    $archive = Join-Path $tmp $asset.name
    Invoke-WebRequest $asset.browser_download_url -OutFile $archive
    $sevenZip = (Get-Command 7z -ErrorAction SilentlyContinue)?.Source
    if (-not $sevenZip) { $sevenZip = "$env:ProgramFiles\7-Zip\7z.exe" }
    & $sevenZip x $archive "-o$tmp\x" -y | Out-Null
    Copy-Item "$tmp\x\libmpv-2.dll" $dest
    # MSVC のリンカーは MinGW のインポートライブラリ（.dll.a）もそのまま読める
    Copy-Item "$tmp\x\libmpv.dll.a" "$dest\mpv.lib"
} finally { Remove-Item -Recurse -Force $tmp }
Write-Host "libmpv を $dest に置きました"
