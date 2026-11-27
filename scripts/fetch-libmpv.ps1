# Fetch libmpv for Windows (libmpv-2.dll and mpv.lib) into src-tauri/libs/windows.
# Usage: powershell -File scripts/fetch-libmpv.ps1
# Keep this file ASCII-only: Windows PowerShell 5.1 misreads BOM-less UTF-8.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$dest = Join-Path $PSScriptRoot '..\src-tauri\libs\windows'
if ((Test-Path "$dest\libmpv-2.dll") -and (Test-Path "$dest\mpv.lib")) { Write-Host 'libmpv already present'; exit 0 }
New-Item -ItemType Directory -Force $dest | Out-Null

$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'aarch64' } else { 'x86_64' }
$rel = Invoke-RestMethod 'https://api.github.com/repos/shinchiro/mpv-winbuild-cmake/releases/latest'
$asset = $rel.assets | Where-Object { $_.name -match "^mpv-dev-$arch-\d" } | Select-Object -First 1
if (-not $asset) { throw "mpv-dev-$arch not found in the latest release" }

$tmp = Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
New-Item -ItemType Directory $tmp | Out-Null
try {
    $archive = Join-Path $tmp $asset.name
    Invoke-WebRequest $asset.browser_download_url -OutFile $archive
    $cmd = Get-Command 7z -ErrorAction SilentlyContinue
    $sevenZip = if ($cmd) { $cmd.Source } else { "$env:ProgramFiles\7-Zip\7z.exe" }
    & $sevenZip x $archive "-o$tmp\x" -y | Out-Null
    if ($LASTEXITCODE -ne 0) { throw '7z extraction failed' }
    Copy-Item "$tmp\x\libmpv-2.dll" $dest
    # MSVC's linker reads MinGW import libraries (.dll.a) as-is
    Copy-Item "$tmp\x\libmpv.dll.a" "$dest\mpv.lib"
} finally { Remove-Item -Recurse -Force $tmp }
Write-Host "libmpv placed in $dest"
