$ErrorActionPreference = 'Stop'

$nodeExe = if (Test-Path 'C:\nvm4w\nodejs\node.exe') { 'C:\nvm4w\nodejs\node.exe' } elseif ($IsWindows -or $env:OS -eq 'Windows_NT') { 'node.exe' } else { 'node' }

function Get-NormalizedPath([string]$path) {
    return $path.Replace('\', '/')
}

$appRoot = Join-Path $PSScriptRoot '..\app'

$explicitFiles = @(
    (Join-Path $appRoot 'app.vue'),
    (Join-Path $appRoot 'components\ui\SessionPickerModal.vue')
)

$folderTargets = @(
    (Join-Path $appRoot 'components\pages'),
    (Join-Path $appRoot 'components\electron')
)

$files = @()
foreach ($filePath in $explicitFiles) {
    if (Test-Path $filePath) {
        $files += Get-Item -LiteralPath $filePath
    }
}
foreach ($folderPath in $folderTargets) {
    if (Test-Path $folderPath) {
        $files += Get-ChildItem -Path $folderPath -Filter '*.vue' -File -Recurse
    }
}

$legacyPatterns = @(
    'useTelemetryData\(',
    'useSessionPager\('
)

# Pagine esentate dal requisito useTelemetryGateway: NON consumano telemetria,
# quindi forzare il gateway sarebbe una chiamata a vuoto solo per zittire il check.
# Aggiungere qui SOLO con motivo scritto.
$gatewayExempt = @(
    'PilotAreaPage.vue'   # solo useFirebaseAuth per copy/visibilita per ruolo; nessuna telemetria (PIP-131)
)

$missingGateway = @()
$legacyHits = @()

foreach ($file in $files) {
    $content = Get-Content -LiteralPath $file.FullName -Raw
    $normalized = Get-NormalizedPath $file.FullName

    if ($normalized -like '*/components/pages/*' -and ($content -notmatch 'useTelemetryGateway\(')) {
        $fileName = Split-Path $normalized -Leaf
        if ($gatewayExempt -notcontains $fileName) {
            $missingGateway += $normalized
        }
    }

    foreach ($pattern in $legacyPatterns) {
        if ($content -match $pattern) {
            $legacyHits += "$normalized :: $pattern"
        }
    }
}

if ($missingGateway.Count -gt 0 -or $legacyHits.Count -gt 0) {
    # NB: stampare i dettagli PRIMA di uscire. Con $ErrorActionPreference='Stop'
    # un Write-Error qui terminerebbe lo script prima di elencare i colpevoli
    # (reporting cieco). Usiamo Write-Host per l'elenco e poi exit 1.
    Write-Host '[PIPELINE_CHECK] FAILED'
    if ($missingGateway.Count -gt 0) {
        Write-Host '[PIPELINE_CHECK] Missing useTelemetryGateway in pages:'
        $missingGateway | ForEach-Object { Write-Host " - $_" }
    }
    if ($legacyHits.Count -gt 0) {
        Write-Host '[PIPELINE_CHECK] Legacy pipeline references found:'
        $legacyHits | ForEach-Object { Write-Host " - $_" }
    }
    exit 1
}

Write-Output "[PIPELINE_CHECK] Structural checks OK - files checked: $($files.Count)"

# Il typecheck Nuxt e' gia uno step bloccante separato del green gate.
# Tenerlo anche qui su Windows puo' lasciare processi appesi dentro PowerShell.
Write-Output '[PIPELINE_CHECK] Nuxt typecheck covered by FE: typecheck gate step'

$parityScript = Join-Path $PSScriptRoot 'check_projection_parity.mjs'
& $nodeExe $parityScript
if ($LASTEXITCODE -ne 0) {
    Write-Error '[PIPELINE_CHECK] Projection parity check failed'
    exit 1
}

$firebaseTrackingScript = Join-Path $PSScriptRoot 'check_firebase_tracking.mjs'
& $nodeExe $firebaseTrackingScript
if ($LASTEXITCODE -ne 0) {
    Write-Error '[PIPELINE_CHECK] Firebase tracking coverage failed'
    exit 1
}

$syncRuntimeScript = Join-Path $PSScriptRoot 'check_sync_runtime.mjs'
& $nodeExe $syncRuntimeScript
if ($LASTEXITCODE -ne 0) {
    Write-Error '[PIPELINE_CHECK] Sync runtime contract failed'
    exit 1
}

$syncTrackBestsAggregateScript = Join-Path $PSScriptRoot 'check_sync_trackbests_aggregate.mjs'
& $nodeExe $syncTrackBestsAggregateScript
if ($LASTEXITCODE -ne 0) {
    Write-Error '[PIPELINE_CHECK] Sync trackBests aggregate contract failed'
    exit 1
}

$sessionModesScript = Join-Path $PSScriptRoot 'check_session_detail_modes.mjs'
& $nodeExe $sessionModesScript
if ($LASTEXITCODE -ne 0) {
    Write-Error '[PIPELINE_CHECK] Session detail access-mode contract failed'
    exit 1
}

$sessionPagerMergeScript = Join-Path $PSScriptRoot 'check_session_pager_merge.mjs'
& $nodeExe $sessionPagerMergeScript
if ($LASTEXITCODE -ne 0) {
    Write-Error '[PIPELINE_CHECK] Session pager mixed-source contract failed'
    exit 1
}

$sessionElectronReadsScript = Join-Path $PSScriptRoot 'check_session_electron_reads.mjs'
& $nodeExe $sessionElectronReadsScript
if ($LASTEXITCODE -ne 0) {
    Write-Error '[PIPELINE_CHECK] Session Electron read contract failed'
    exit 1
}

$projectionFirstScript = Join-Path $PSScriptRoot 'check_projection_first_sources.mjs'
& $nodeExe $projectionFirstScript
if ($LASTEXITCODE -ne 0) {
    Write-Error '[PIPELINE_CHECK] Projection-first source contract failed'
    exit 1
}

$pilotsPaginationScript = Join-Path $PSScriptRoot 'check_pilots_pagination.mjs'
& $nodeExe $pilotsPaginationScript
if ($LASTEXITCODE -ne 0) {
    Write-Error '[PIPELINE_CHECK] Pilots pagination contract failed'
    exit 1
}

$pilotDirectorySyncScript = Join-Path $PSScriptRoot 'check_pilot_directory_sync.mjs'
& $nodeExe $pilotDirectorySyncScript
if ($LASTEXITCODE -ne 0) {
    Write-Error '[PIPELINE_CHECK] Pilot directory sync contract failed'
    exit 1
}

$ownerRebuildScript = Join-Path $PSScriptRoot 'check_owner_rebuild_contract.mjs'
& $nodeExe $ownerRebuildScript
if ($LASTEXITCODE -ne 0) {
    Write-Error '[PIPELINE_CHECK] Owner rebuild contract failed'
    exit 1
}

$ownerMaintenanceGateScript = Join-Path $PSScriptRoot 'check_owner_maintenance_gate.mjs'
& $nodeExe $ownerMaintenanceGateScript
if ($LASTEXITCODE -ne 0) {
    Write-Error '[PIPELINE_CHECK] Owner maintenance gate contract failed'
    exit 1
}

$noStartupRawPrefetchScript = Join-Path $PSScriptRoot 'check_no_startup_raw_prefetch.mjs'
& $nodeExe $noStartupRawPrefetchScript
if ($LASTEXITCODE -ne 0) {
    Write-Error '[PIPELINE_CHECK] Startup raw prefetch regression failed'
    exit 1
}

$firestoreIndexesScript = Join-Path $PSScriptRoot 'check_firestore_indexes.mjs'
& $nodeExe $firestoreIndexesScript
if ($LASTEXITCODE -ne 0) {
    Write-Error '[PIPELINE_CHECK] Firestore indexes contract failed'
    exit 1
}

$devToolsAccessScript = Join-Path $PSScriptRoot 'check_dev_tools_access.mjs'
& $nodeExe $devToolsAccessScript
if ($LASTEXITCODE -ne 0) {
    Write-Error '[PIPELINE_CHECK] Dev tools access contract failed'
    exit 1
}

$overviewGripBadgesScript = Join-Path $PSScriptRoot 'check_overview_grip_badges.mjs'
& $nodeExe $overviewGripBadgesScript
if ($LASTEXITCODE -ne 0) {
    Write-Error '[PIPELINE_CHECK] Overview grip badges contract failed'
    exit 1
}

Write-Output "[PIPELINE_CHECK] OK - files checked: $($files.Count)"
