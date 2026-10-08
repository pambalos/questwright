# Sets up Questwright Studio from a fresh checkout:
#   1. copies Epic's Manny and Quinn mannequins from the engine's Third Person template
#   2. builds the C++ module for the editor
#   3. builds the studio's materials with Scripts/setup_content.py
# Usage: powershell -File Scripts/setup.ps1 [-Engine "E:\Program Files\Epic Games\UE_5.5"] [-SkipBuild]
param(
    [string]$Engine = "",
    [switch]$SkipBuild
)
$ErrorActionPreference = "Stop"
$Project = Split-Path -Parent $PSScriptRoot
$Uproject = Join-Path $Project "QuestwrightStudio.uproject"

if (-not $Engine) {
    $launcher = "C:\ProgramData\Epic\UnrealEngineLauncher\LauncherInstalled.dat"
    if (Test-Path $launcher) {
        $Engine = ((Get-Content $launcher -Raw | ConvertFrom-Json).InstallationList | Where-Object AppName -eq "UE_5.5" | Select-Object -First 1).InstallLocation
    }
}
if (-not $Engine -or -not (Test-Path "$Engine\Engine\Binaries\Win64\UnrealEditor.exe")) {
    throw "Unreal Engine 5.5 not found. Pass -Engine <install folder>."
}
Write-Host "Engine: $Engine"

$characters = Join-Path $Project "Content\Characters"
if (-not (Test-Path "$characters\Mannequins\Meshes\SKM_Manny.uasset")) {
    Write-Host "Copying the mannequins from the Third Person template..."
    New-Item -ItemType Directory -Force $characters | Out-Null
    Copy-Item -Recurse -Force "$Engine\Templates\TemplateResources\High\Characters\Content\*" $characters
}

if (-not $SkipBuild) {
    Write-Host "Building the editor module..."
    & "$Engine\Engine\Build\BatchFiles\Build.bat" QuestwrightStudioEditor Win64 Development "-Project=$Uproject" -WaitMutex -NoHotReload
    if ($LASTEXITCODE -ne 0) { throw "Build failed ($LASTEXITCODE)" }
}

Write-Host "Building materials..."
& "$Engine\Engine\Binaries\Win64\UnrealEditor-Cmd.exe" $Uproject -run=pythonscript "-script=$PSScriptRoot\setup_content.py" -unattended -nop4 -nosplash -stdout -FullStdOutLogOutput | Select-String -Pattern "Questwright:|Error|error:"
Write-Host "Done. Run with: Scripts\run.ps1"
