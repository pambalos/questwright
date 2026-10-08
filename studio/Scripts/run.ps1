# Opens Questwright Studio as a game window (no editor UI).
#   -Character <file.json>  a character exported by Questwright (reloads when the file changes)
#   -Style painted|stylized|realistic
#   -Shots <folder>         render every style to PNGs there, then quit
param(
    [string]$Engine = "",
    [string]$Character = "",
    [string]$Style = "",
    [string]$Shots = "",
    [int]$Width = 1600,
    [int]$Height = 900
)
$Project = Split-Path -Parent $PSScriptRoot
$Uproject = Join-Path $Project "QuestwrightStudio.uproject"
if (-not $Engine) {
    $launcher = "C:\ProgramData\Epic\UnrealEngineLauncher\LauncherInstalled.dat"
    $Engine = ((Get-Content $launcher -Raw | ConvertFrom-Json).InstallationList | Where-Object AppName -eq "UE_5.5" | Select-Object -First 1).InstallLocation
}
$argList = @($Uproject, "-game", "-windowed", "-ResX=$Width", "-ResY=$Height", "-nosplash", "-log=QuestwrightStudio.log")
if ($Character) { $argList += "-Character=`"$((Resolve-Path $Character).Path)`"" }
if ($Style) { $argList += "-Style=$Style" }
if ($Shots) { New-Item -ItemType Directory -Force $Shots | Out-Null; $argList += "-Shots=`"$((Resolve-Path $Shots).Path)`"" }
$p = Start-Process -FilePath "$Engine\Engine\Binaries\Win64\UnrealEditor.exe" -ArgumentList $argList -PassThru
if ($Shots) { $p.WaitForExit() }
