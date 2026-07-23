param(
    [string]$SkillRoot = (Join-Path $PSScriptRoot "wrayboss-codex-tradingview"),
    [string]$OutputPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$expectedRoot = "wrayboss-codex-tradingview"
$validator = Join-Path $PSScriptRoot "tests\validate-skill.ps1"

if (-not $OutputPath) {
    $worktreeRoot = Split-Path -Parent $PSScriptRoot
    $dist = Join-Path $worktreeRoot "dist"
    $OutputPath = Join-Path $dist "$expectedRoot.zip"
}

if (-not (Test-Path -LiteralPath $validator -PathType Leaf)) {
    throw "Package validator is missing: $validator"
}
if (-not (Test-Path -LiteralPath $SkillRoot -PathType Container)) {
    throw "Skill root is missing: $SkillRoot"
}
if ((Split-Path -Leaf (Resolve-Path $SkillRoot)) -ne $expectedRoot) {
    throw "Skill root folder must be named $expectedRoot."
}

$sourceValidation = (& $validator -SkillRoot $SkillRoot) -join [Environment]::NewLine
$sourceValidationObject = $sourceValidation | ConvertFrom-Json -ErrorAction Stop
if ($sourceValidationObject.ok -ne $true) {
    throw "Source skill validation failed: $sourceValidation"
}

$parent = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Force -Path $parent | Out-Null
Remove-Item -LiteralPath $OutputPath -Force -ErrorAction SilentlyContinue

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::Open($OutputPath, [IO.Compression.ZipArchiveMode]::Create)
try {
    $rootPath = (Resolve-Path -LiteralPath $SkillRoot).Path
    foreach ($file in Get-ChildItem -LiteralPath $SkillRoot -File -Recurse | Sort-Object FullName) {
        $relative = $file.FullName.Substring($rootPath.Length).TrimStart('\')
        $entryName = "$expectedRoot/" + $relative.Replace('\', '/')
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive,
            $file.FullName,
            $entryName,
            [IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
    }
} finally {
    $archive.Dispose()
}

$extractRoot = Join-Path ([IO.Path]::GetTempPath()) ("wrayboss-skill-extract-{0}" -f [guid]::NewGuid())
New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null
try {
    [IO.Compression.ZipFile]::ExtractToDirectory($OutputPath, $extractRoot)
    $extractedSkill = Join-Path $extractRoot $expectedRoot
    $extractedValidation = (& $validator -SkillRoot $extractedSkill) -join [Environment]::NewLine
    $extractedValidationObject = $extractedValidation | ConvertFrom-Json -ErrorAction Stop
    if ($extractedValidationObject.ok -ne $true) {
        throw "Extracted skill validation failed: $extractedValidation"
    }

    $zip = [IO.Compression.ZipFile]::OpenRead($OutputPath)
    try {
        $entries = @($zip.Entries)
        if ($entries.Count -eq 0) { throw "ZIP contains no files." }
        $badEntries = @($entries | Where-Object {
            -not $_.FullName.StartsWith("$expectedRoot/", [StringComparison]::Ordinal)
        })
        if ($badEntries.Count -gt 0) {
            throw "ZIP contains entries outside the expected root folder."
        }
        if (@($entries | Where-Object { $_.FullName -eq "$expectedRoot/SKILL.md" }).Count -ne 1) {
            throw "ZIP must contain exactly one root SKILL.md."
        }
        $entryCount = $entries.Count
    } finally {
        $zip.Dispose()
    }

    $zipItem = Get-Item -LiteralPath $OutputPath
    $zipHash = (Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash
    $hashPath = "$OutputPath.sha256.txt"
    [IO.File]::WriteAllText(
        $hashPath,
        "$zipHash  $($zipItem.Name)`r`n",
        (New-Object Text.UTF8Encoding($false))
    )

    [ordered]@{
        ok = $true
        outputPath = $zipItem.FullName
        bytes = $zipItem.Length
        sha256 = $zipHash
        sha256File = $hashPath
        rootFolder = $expectedRoot
        entryCount = $entryCount
        sourceValidation = $sourceValidationObject
        extractedValidation = $extractedValidationObject
    } | ConvertTo-Json -Depth 15
} finally {
    Remove-Item -LiteralPath $extractRoot -Recurse -Force -ErrorAction SilentlyContinue
}
