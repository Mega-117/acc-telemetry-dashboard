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

Write-Output "[PIPELINE_CHECK] OK - files checked: $($files.Count)"
