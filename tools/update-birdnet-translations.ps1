param(
    [string]$Repository = "Nachtzuster/BirdNET-Pi",
    [string]$Branch = "main",
    [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\lang")
)

# Stop immediately when a download, conversion, or file write fails.
$ErrorActionPreference = "Stop"

# Resolve the output path once so every generated file stays inside the project language directory.
$resolvedOutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
[System.IO.Directory]::CreateDirectory($resolvedOutputDirectory) | Out-Null

# Identify the exact upstream commit so an update can be audited and reproduced later.
$commitApiUrl = "https://api.github.com/repos/$Repository/commits/$Branch"
$commit = Invoke-RestMethod -Uri $commitApiUrl -Headers @{ "User-Agent" = "Bird-Encyclopedia-Translation-Updater" }

# Request the current localization file list instead of maintaining a duplicate hard-coded language list.
$contentsApiUrl = "https://api.github.com/repos/$Repository/contents/model/l18n?ref=$Branch"
$upstreamFiles = Invoke-RestMethod -Uri $contentsApiUrl -Headers @{ "User-Agent" = "Bird-Encyclopedia-Translation-Updater" }
$translationFiles = $upstreamFiles |
    Where-Object { $_.type -eq "file" -and $_.name -match '^labels_.+\.json$' } |
    Sort-Object name

if (-not $translationFiles) {
    throw "No BirdNET-Pi translation files were found at $contentsApiUrl"
}

# Write UTF-8 without a byte-order mark so browsers read every translated name consistently.
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)

foreach ($translationFile in $translationFiles) {
    # Download the upstream JSON dictionary whose keys are scientific names and values are localized names.
    $translations = Invoke-RestMethod -Uri $translationFile.download_url -Headers @{ "User-Agent" = "Bird-Encyclopedia-Translation-Updater" }
    $outputName = [System.IO.Path]::ChangeExtension($translationFile.name, ".txt")
    $outputPath = Join-Path $resolvedOutputDirectory $outputName

    # Convert each JSON property to the underscore-delimited format consumed by the encyclopedia.
    $lines = foreach ($property in $translations.PSObject.Properties) {
        $scientificName = $property.Name.Trim()
        $localizedName = ([string]$property.Value).Replace("`r", " ").Replace("`n", " ").Trim()
        "${scientificName}_${localizedName}"
    }

    [System.IO.File]::WriteAllLines($outputPath, $lines, $utf8WithoutBom)
    Write-Host "Updated $outputName ($($lines.Count) entries)"

    # Keep the previous generic Chinese filename synchronized with Simplified Chinese for compatibility.
    if ($translationFile.name -eq "labels_zh_CN.json") {
        $legacyChinesePath = Join-Path $resolvedOutputDirectory "labels_zh.txt"
        [System.IO.File]::WriteAllLines($legacyChinesePath, $lines, $utf8WithoutBom)
        Write-Host "Updated labels_zh.txt compatibility alias"
    }
}

# Record the source revision and update time beside the generated files.
$sourceRecord = @(
    "Source repository: https://github.com/$Repository/tree/$Branch/model/l18n"
    "Source commit: $($commit.sha)"
    "Updated UTC: $([DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ'))"
)
[System.IO.File]::WriteAllLines((Join-Path $resolvedOutputDirectory "UPSTREAM.txt"), $sourceRecord, $utf8WithoutBom)

Write-Host "Translation update complete at commit $($commit.sha)."
