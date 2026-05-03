$ErrorActionPreference = 'Stop'

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

$missingGateway = @()
$legacyHits = @()

foreach ($file in $files) {
    $content = Get-Content -LiteralPath $file.FullName -Raw
    $normalized = Get-NormalizedPath $file.FullName

    if ($normalized -like '*/components/pages/*' -and ($content -notmatch 'useTelemetryGateway\(')) {
        $missingGateway += $normalized
    }

    foreach ($pattern in $legacyPatterns) {
        if ($content -match $pattern) {
            $legacyHits += "$normalized :: $pattern"
        }
    }
}

if ($missingGateway.Count -gt 0 -or $legacyHits.Count -gt 0) {
    Write-Error "[PIPELINE_CHECK] FAILED"
    if ($missingGateway.Count -gt 0) {
        Write-Output '[PIPELINE_CHECK] Missing useTelemetryGateway in pages:'
        $missingGateway | ForEach-Object { Write-Output " - $_" }
    }
    if ($legacyHits.Count -gt 0) {
        Write-Output '[PIPELINE_CHECK] Legacy pipeline references found:'
        $legacyHits | ForEach-Object { Write-Output " - $_" }
    }
    exit 1
}

Write-Output "[PIPELINE_CHECK] Structural checks OK - files checked: $($files.Count)"

$parityScript = Join-Path $PSScriptRoot 'check_projection_parity.mjs'
node $parityScript
if ($LASTEXITCODE -ne 0) {
    Write-Error '[PIPELINE_CHECK] Projection parity check failed'
    exit 1
}

$firebaseTrackingScript = Join-Path $PSScriptRoot 'check_firebase_tracking.mjs'
node $firebaseTrackingScript
if ($LASTEXITCODE -ne 0) {
    Write-Error '[PIPELINE_CHECK] Firebase tracking coverage failed'
    exit 1
}

$syncRuntimeScript = Join-Path $PSScriptRoot 'check_sync_runtime.mjs'
node $syncRuntimeScript
if ($LASTEXITCODE -ne 0) {
    Write-Error '[PIPELINE_CHECK] Sync runtime contract failed'
    exit 1
}

$syncTrackBestsAggregateScript = Join-Path $PSScriptRoot 'check_sync_trackbests_aggregate.mjs'
node $syncTrackBestsAggregateScript
if ($LASTEXITCODE -ne 0) {
    Write-Error '[PIPELINE_CHECK] Sync trackBests aggregate contract failed'
    exit 1
}

$sessionModesScript = Join-Path $PSScriptRoot 'check_session_detail_modes.mjs'
node $sessionModesScript
if ($LASTEXITCODE -ne 0) {
    Write-Error '[PIPELINE_CHECK] Session detail access-mode contract failed'
    exit 1
}

$sessionPagerMergeScript = Join-Path $PSScriptRoot 'check_session_pager_merge.mjs'
node $sessionPagerMergeScript
if ($LASTEXITCODE -ne 0) {
    Write-Error '[PIPELINE_CHECK] Session pager mixed-source contract failed'
    exit 1
}

$projectionFirstScript = Join-Path $PSScriptRoot 'check_projection_first_sources.mjs'
node $projectionFirstScript
if ($LASTEXITCODE -ne 0) {
    Write-Error '[PIPELINE_CHECK] Projection-first source contract failed'
    exit 1
}

$pilotsPaginationScript = Join-Path $PSScriptRoot 'check_pilots_pagination.mjs'
node $pilotsPaginationScript
if ($LASTEXITCODE -ne 0) {
    Write-Error '[PIPELINE_CHECK] Pilots pagination contract failed'
    exit 1
}

$pilotDirectorySyncScript = Join-Path $PSScriptRoot 'check_pilot_directory_sync.mjs'
node $pilotDirectorySyncScript
if ($LASTEXITCODE -ne 0) {
    Write-Error '[PIPELINE_CHECK] Pilot directory sync contract failed'
    exit 1
}

$ownerRebuildScript = Join-Path $PSScriptRoot 'check_owner_rebuild_contract.mjs'
node $ownerRebuildScript
if ($LASTEXITCODE -ne 0) {
    Write-Error '[PIPELINE_CHECK] Owner rebuild contract failed'
    exit 1
}

$ownerMaintenanceGateScript = Join-Path $PSScriptRoot 'check_owner_maintenance_gate.mjs'
node $ownerMaintenanceGateScript
if ($LASTEXITCODE -ne 0) {
    Write-Error '[PIPELINE_CHECK] Owner maintenance gate contract failed'
    exit 1
}

$noStartupRawPrefetchScript = Join-Path $PSScriptRoot 'check_no_startup_raw_prefetch.mjs'
node $noStartupRawPrefetchScript
if ($LASTEXITCODE -ne 0) {
    Write-Error '[PIPELINE_CHECK] Startup raw prefetch regression failed'
    exit 1
}

$firestoreIndexesScript = Join-Path $PSScriptRoot 'check_firestore_indexes.mjs'
node $firestoreIndexesScript
if ($LASTEXITCODE -ne 0) {
    Write-Error '[PIPELINE_CHECK] Firestore indexes contract failed'
    exit 1
}

$devToolsAccessScript = Join-Path $PSScriptRoot 'check_dev_tools_access.mjs'
node $devToolsAccessScript
if ($LASTEXITCODE -ne 0) {
    Write-Error '[PIPELINE_CHECK] Dev tools access contract failed'
    exit 1
}

$overviewGripBadgesScript = Join-Path $PSScriptRoot 'check_overview_grip_badges.mjs'
node $overviewGripBadgesScript
if ($LASTEXITCODE -ne 0) {
    Write-Error '[PIPELINE_CHECK] Overview grip badges contract failed'
    exit 1
}

Write-Output "[PIPELINE_CHECK] OK - files checked: $($files.Count)"
