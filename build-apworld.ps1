# Rebuilds composeapelago.apworld from the composeapelago/ folder and
# installs it into the local Archipelago's custom_worlds. Run this after
# adding a song (npm run add-song) or editing any apworld file.

$repo = $PSScriptRoot
$staging = Join-Path $env:TEMP "composeapelago_apworld_build"

if (Test-Path $staging) { Remove-Item -Recurse -Force $staging }
New-Item -ItemType Directory -Force "$staging\composeapelago" | Out-Null
Copy-Item -Path "$repo\composeapelago\*" -Destination "$staging\composeapelago" -Recurse
Compress-Archive -Path "$staging\composeapelago" -DestinationPath "$staging\composeapelago.zip" -Force

Copy-Item "$staging\composeapelago.zip" "$repo\composeapelago.apworld" -Force
Write-Output "built $repo\composeapelago.apworld"

$customWorlds = "C:\ProgramData\Archipelago\custom_worlds"
if (Test-Path $customWorlds) {
    Copy-Item "$staging\composeapelago.zip" "$customWorlds\composeapelago.apworld" -Force
    Write-Output "installed to $customWorlds (restart Archipelago tools to pick it up)"
}
