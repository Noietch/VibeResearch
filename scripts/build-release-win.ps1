# Windows release build script (PowerShell — no WSL/bash required)
$ErrorActionPreference = "Stop"

$ROOT_DIR = Split-Path -Parent $PSScriptRoot
$releaseDir = Join-Path $ROOT_DIR "release"
$tempReleaseDir = Join-Path $ROOT_DIR "release-builder-temp"

Write-Host "==> Building ResearchClaw (Windows release)"
Set-Location $ROOT_DIR

# Step 0: Regenerate Windows ICO from the checked-in iconset
Write-Host "==> Step 0: Regenerate Windows icon"
node scripts/generate-win-icon.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Step 1: Build JS bundles
Write-Host "==> Step 1: Build JS bundles"

# Clean leftover electron-builder artifacts
$cleanPaths = @(
  "dist\win-arm64", "dist\win-unpacked", "dist\win",
  "dist\builder-debug.yml", "dist\node_modules"
)
foreach ($p in $cleanPaths) {
  $full = Join-Path $ROOT_DIR $p
  if (Test-Path $full) { Remove-Item -Recurse -Force $full }
}
if (Test-Path $tempReleaseDir) {
  Remove-Item -Recurse -Force $tempReleaseDir
}

npm.cmd run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Step 2: Copy Prisma native engine to dist/native/
Write-Host "==> Step 2: Copy Prisma native engine to dist/native/"
$nativeDir = Join-Path $ROOT_DIR "dist\native"
New-Item -ItemType Directory -Force -Path $nativeDir | Out-Null

$prismaClientDir = Join-Path $ROOT_DIR "node_modules\.prisma\client"

# Windows x64 engine
$engineX64 = Get-ChildItem -Path $prismaClientDir -Filter "query_engine-windows*.dll.node" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($engineX64) {
  Copy-Item $engineX64.FullName $nativeDir
  Write-Host "  Copied: $($engineX64.Name) -> dist/native/"
} else {
  Write-Host "  WARNING: Prisma Windows engine not found in $prismaClientDir"
}

# Step 3: Prepare .prisma/client for packaging
Write-Host "==> Step 3: Prepare .prisma/client for packaging"
if (Test-Path $prismaClientDir) {
  $prismaBackup = Join-Path $ROOT_DIR "node_modules\_prisma\client"
  New-Item -ItemType Directory -Force -Path $prismaBackup | Out-Null
  Copy-Item -Recurse -Force "$prismaClientDir\*" $prismaBackup
  Write-Host "  Copied: node_modules\.prisma\client -> node_modules\_prisma\client"
}

# Step 3.5: Temporarily remove ssh2 optional native addon that requires local VS toolchains.
# ssh2 handles missing cpu-features gracefully, and packaging should not force a rebuild for it.
$cpuFeaturesDir = Join-Path $ROOT_DIR "node_modules\cpu-features"
$cpuFeaturesBackup = Join-Path $ROOT_DIR "node_modules\_cpu-features-backup"
if (Test-Path $cpuFeaturesBackup) {
  Remove-Item -Recurse -Force $cpuFeaturesBackup
}
if (Test-Path $cpuFeaturesDir) {
  Write-Host "==> Step 3.5: Temporarily remove optional cpu-features native addon"
  Move-Item $cpuFeaturesDir $cpuFeaturesBackup
}

# Step 4: Package Windows NSIS installer (x64)
Write-Host "==> Step 4: Package Windows NSIS installer (x64)"
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
npx.cmd electron-builder --win --x64 --publish never "--config.directories.output=$tempReleaseDir"
$exitCode = $LASTEXITCODE

# Cleanup: remove the temporary _prisma directory after packaging
$prismaTemp = Join-Path $ROOT_DIR "node_modules\_prisma"
if (Test-Path $prismaTemp) { Remove-Item -Recurse -Force $prismaTemp }
$cpuFeaturesTemp = Join-Path $ROOT_DIR "node_modules\_cpu-features-backup"
if (Test-Path $cpuFeaturesTemp) { Move-Item $cpuFeaturesTemp $cpuFeaturesDir }

if ($exitCode -ne 0) { exit $exitCode }

# Copy final installer artifacts back to release/ so existing workflows keep working
Write-Host "==> Step 5: Copy packaged artifacts to release/"
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
$staleArtifactPatterns = @(
  "ResearchClaw Setup *.exe",
  "ResearchClaw Setup *.exe.blockmap",
  "ResearchClaw-Setup-*.exe",
  "ResearchClaw-Setup-*.exe.blockmap",
  "latest.yml",
  "builder-debug.yml",
  "builder-effective-config.yaml"
)
foreach ($pattern in $staleArtifactPatterns) {
  Get-ChildItem -Path $releaseDir -Filter $pattern -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-Item $_.FullName -Force
  }
}
$artifactPatterns = @("*.exe", "*.blockmap", "latest.yml", "builder-debug.yml", "builder-effective-config.yaml")
foreach ($pattern in $artifactPatterns) {
  Get-ChildItem -Path $tempReleaseDir -Filter $pattern -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-Item $_.FullName $releaseDir -Force
  }
}
Get-ChildItem -Path $releaseDir -Filter "ResearchClaw Setup *.exe" -ErrorAction SilentlyContinue | ForEach-Object {
  $hyphenName = $_.Name -replace '^ResearchClaw Setup ', 'ResearchClaw-Setup-'
  Copy-Item $_.FullName (Join-Path $releaseDir $hyphenName) -Force

  $blockmapPath = "$($_.FullName).blockmap"
  if (Test-Path $blockmapPath) {
    Copy-Item $blockmapPath (Join-Path $releaseDir "$hyphenName.blockmap") -Force
  }
}
if (Test-Path $tempReleaseDir) {
  Remove-Item -Recurse -Force $tempReleaseDir
}

Write-Host ""
Write-Host "==> Done! Output:"
$exeFiles = Get-ChildItem -Path $releaseDir -Filter "*.exe" -ErrorAction SilentlyContinue
if ($exeFiles) {
  $exeFiles | ForEach-Object { Write-Host "  $($_.FullName)  ($([math]::Round($_.Length/1MB, 1)) MB)" }
} else {
  Write-Host "  No .exe files found, check release/ directory"
}
