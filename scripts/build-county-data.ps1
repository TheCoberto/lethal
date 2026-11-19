# Builds data/counties.json from the County Health Rankings yearly CSV.
#
#   powershell -ExecutionPolicy Bypass -File scripts/build-county-data.ps1 [-Year 2025]
#
# Run it once a year when a new release comes out (usually spring):
# https://www.countyhealthrankings.org/health-data/methodology-and-sources/data-documentation
#
# Output: { "_source": "...", "US": [homicide, crash], "01001": [homicide, crash], ... }
# Both values are deaths per 100,000 residents; null where CHR suppresses small counts.

param([int]$Year = 2025)

$ErrorActionPreference = 'Stop'
$url = "https://www.countyhealthrankings.org/sites/default/files/media/document/analytic_data$Year.csv"
$csvPath = Join-Path $env:TEMP "chr_analytic_data$Year.csv"
$outPath = Join-Path $PSScriptRoot '..\data\counties.json'

Write-Host "Downloading $url"
Invoke-WebRequest -Uri $url -OutFile $csvPath -UseBasicParsing

$lines = [System.IO.File]::ReadAllLines($csvPath)
# Row 1 = readable headers, row 2 = variable codes (v015 = homicides, v039 = motor vehicle crash deaths).
$codes = $lines[1].Split(',')
$fipsCol = [array]::IndexOf($codes, 'fipscode')
$homicideCol = [array]::IndexOf($codes, 'v015_rawvalue')
$crashCol = [array]::IndexOf($codes, 'v039_rawvalue')
if ($fipsCol -lt 0 -or $homicideCol -lt 0 -or $crashCol -lt 0) {
  throw "Expected columns not found (fipscode, v015_rawvalue, v039_rawvalue). Check the $Year file layout."
}

function Format-Rate($raw) {
  if ([string]::IsNullOrWhiteSpace($raw)) { return 'null' }
  return [math]::Round([double]$raw, 1).ToString([System.Globalization.CultureInfo]::InvariantCulture)
}

$entries = New-Object System.Collections.Generic.List[string]
$entries.Add("`"_source`":`"County Health Rankings $Year (CDC NVSS): homicide and motor vehicle crash deaths per 100,000, multi-year averages`"")
for ($i = 2; $i -lt $lines.Length; $i++) {
  $cols = $lines[$i].Split(',')
  $fips = $cols[$fipsCol]
  $key = if ($fips -eq '00000') { 'US' } elseif ($fips.EndsWith('000')) { $null } else { $fips } # skip state rows
  if ($key) { $entries.Add("`"$key`":[$(Format-Rate $cols[$homicideCol]),$(Format-Rate $cols[$crashCol])]") }
}

[System.IO.File]::WriteAllText($outPath, "{`n" + ($entries -join ",`n") + "`n}`n")
Write-Host "Wrote $($entries.Count - 1) rows to $outPath"
