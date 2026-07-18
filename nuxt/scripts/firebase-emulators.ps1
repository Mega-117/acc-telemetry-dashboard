param(
    [ValidateSet('start', 'test')]
    [string]$Mode = 'start'
)

$ErrorActionPreference = 'Stop'

function Resolve-JavaHome {
    $javaCommand = Get-Command java -ErrorAction SilentlyContinue
    if ($javaCommand) {
        return $null
    }

    $candidates = Get-ChildItem -Path "$env:ProgramFiles\Microsoft" -Directory -Filter 'jdk-21*' -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending
    return $candidates | Select-Object -First 1 -ExpandProperty FullName
}

$javaHome = Resolve-JavaHome
if ($javaHome) {
    $env:JAVA_HOME = $javaHome
    $env:Path = "$javaHome\bin;$env:Path"
}

if (-not (Get-Command java -ErrorAction SilentlyContinue)) {
    throw 'Java JDK 21 non trovato. Installare Microsoft.OpenJDK.21 prima di avviare Firestore Emulator.'
}

$env:FIREBASE_CLI_DISABLE_UPDATE_CHECK = 'true'
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$exitCode = 0

Push-Location $projectRoot
try {
    if ($Mode -eq 'test') {
        firebase emulators:exec `
            --project accsuite117 `
            --only auth,firestore `
            --config firebase.json `
            "npm --prefix nuxt run test:firebase:rules"
        $exitCode = $LASTEXITCODE
    }
    else {
        firebase emulators:start `
            --project accsuite117 `
            --only auth,firestore `
            --config firebase.json
        $exitCode = $LASTEXITCODE
    }
}
finally {
    Pop-Location
    if ($Mode -eq 'test' -and $exitCode -eq 0) {
        @(
            'firestore-debug.log',
            'firebase-debug.log',
            'ui-debug.log'
        ) | ForEach-Object {
            $logPath = Join-Path $projectRoot $_
            if (Test-Path -LiteralPath $logPath) {
                Remove-Item -LiteralPath $logPath -Force
            }
        }
    }
}
exit $exitCode
