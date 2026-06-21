param(
    [string]$OutputPath = "dist/amino-arcade-source.zip"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$rootPath = [System.IO.Path]::GetFullPath($root).TrimEnd("\", "/")
$output = if ([System.IO.Path]::IsPathRooted($OutputPath)) {
    $OutputPath
} else {
    Join-Path $root $OutputPath
}
$output = [System.IO.Path]::GetFullPath($output)
$stage = Join-Path $root ".release-stage"
$stagePath = [System.IO.Path]::GetFullPath($stage).TrimEnd("\", "/")

if (Test-Path $stage) {
    Remove-Item -LiteralPath $stage -Recurse -Force
}
New-Item -ItemType Directory -Path $stage | Out-Null
New-Item -ItemType Directory -Path ([System.IO.Path]::GetDirectoryName($output)) -Force | Out-Null

$excludeDirs = @(
    ".git",
    ".release-stage",
    ".tokenop",
    ".venv",
    ".venv-*",
    ".pytest_cache",
    "__pycache__",
    "node_modules",
    "dist",
    "playwright-report",
    "test-results",
    "models",
    "model-cache",
    "prediction-cache",
    "work",
    "work*",
    ".agents",
    ".stitch"
)
$excludeFiles = @("*.log", "*.pyc", "*.pyo", "*.zip", "*.7z", "*.pdb", "*.cif", "*.bcif", "*.mmcif", "*.a3m", "*.npz")

function Test-ExcludedPath {
    param([System.IO.FileSystemInfo]$Item)

    $fullName = [System.IO.Path]::GetFullPath($Item.FullName)
    if ($fullName.StartsWith($stagePath, [System.StringComparison]::OrdinalIgnoreCase)) {
        $relative = $fullName.Substring($stagePath.Length).TrimStart("\", "/").Replace("\", "/")
    } else {
        $relative = $fullName.Substring($rootPath.Length).TrimStart("\", "/").Replace("\", "/")
    }
    if (-not $Item.PSIsContainer -and $relative -like "e2e_tests/mock_data/*.pdb") {
        return $false
    }
    foreach ($pattern in $excludeDirs) {
        if ($Item.PSIsContainer -and $Item.Name -like $pattern) {
            return $true
        }
    }
    foreach ($pattern in $excludeFiles) {
        if (-not $Item.PSIsContainer -and $Item.Name -like $pattern) {
            return $true
        }
    }
    return $false
}

Get-ChildItem -LiteralPath $root -Force | ForEach-Object {
    if (Test-ExcludedPath $_) {
        return
    }
    Copy-Item -LiteralPath $_.FullName -Destination $stage -Recurse -Force -Container
}

Get-ChildItem -LiteralPath $stage -Recurse -Force | Sort-Object FullName -Descending | ForEach-Object {
    if (Test-ExcludedPath $_) {
        Remove-Item -LiteralPath $_.FullName -Recurse:($_.PSIsContainer) -Force
    }
}

if (Test-Path $output) {
    Remove-Item -LiteralPath $output -Force
}
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $output -Force
Remove-Item -LiteralPath $stage -Recurse -Force

Write-Host "Created source release: $output"
