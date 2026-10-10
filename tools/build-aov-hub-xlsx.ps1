# build-aov-hub-xlsx.ps1
# Builds AOV_HUB.xlsx from aov-hub-data.json without any external module.
# The script itself is ASCII-only; all Vietnamese text lives in the UTF-8 JSON.
# Output is written with System.IO.Compression.ZipArchive (raw OOXML).

param(
    [string]$DataPath = (Join-Path $PSScriptRoot 'aov-hub-data.json'),
    [string]$OutPath  = (Join-Path (Split-Path $PSScriptRoot -Parent) 'AOV_HUB.xlsx')
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null

function ConvertTo-ColName {
    param([int]$Index)
    $name = ''
    while ($Index -gt 0) {
        $rem = ($Index - 1) % 26
        $name = [string][char](65 + $rem) + $name
        $Index = [int][math]::Floor(($Index - 1) / 26)
    }
    return $name
}

function ConvertTo-XmlText {
    param([string]$Text)
    if ($null -eq $Text) { return '' }
    $out = $Text -replace '&', '&amp;'
    $out = $out -replace '<', '&lt;'
    $out = $out -replace '>', '&gt;'
    $out = $out -replace '"', '&quot;'
    $out = $out -replace "'", '&apos;'
    $out = [System.Text.RegularExpressions.Regex]::Replace($out, '[\x00-\x08\x0B\x0C\x0E-\x1F]', '')
    $out = $out.Replace("`r`n", '&#10;').Replace("`n", '&#10;')
    return $out
}

# Exact-match status keywords (escaped as \uXXXX so this file stays ASCII).
$statusRules = @(
    @{ Re = '^\u0110\u00E3 xong$';                       Style = 3 },  # Da xong -> green
    @{ Re = '^\u0110\u00E3 tri\u1EC3n khai$';            Style = 3 },  # Da trien khai -> green
    @{ Re = '^\u0110\u00E3 c\u00F3$';                    Style = 3 },  # Da co -> green
    @{ Re = '^M\u1ED9t ph\u1EA7n$';                      Style = 4 },  # Mot phan -> yellow
    @{ Re = '^Ch\u01B0a l\u00E0m$';                      Style = 5 },  # Chua lam -> red
    @{ Re = '^Thay \u0111\u1ED5i h\u01B0\u1EDBng$';      Style = 6 }   # Thay doi huong -> blue
)

function Get-CellStyle {
    param([string]$Text)
    foreach ($rule in $statusRules) {
        if ($Text -match $rule.Re) { return $rule.Style }
    }
    return 2
}

function Build-SheetXml {
    param($Sheet)

    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
    [void]$sb.Append('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">')
    [void]$sb.Append('<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>')
    [void]$sb.Append('<sheetFormatPr defaultRowHeight="15"/>')

    $widths = @($Sheet.widths)
    [void]$sb.Append('<cols>')
    for ($i = 0; $i -lt $widths.Count; $i++) {
        $cn = $i + 1
        [void]$sb.Append(('<col min="{0}" max="{0}" width="{1}" customWidth="1"/>' -f $cn, $widths[$i]))
    }
    [void]$sb.Append('</cols>')

    [void]$sb.Append('<sheetData>')

    $header = @($Sheet.header)
    $colCount = $header.Count
    [void]$sb.Append('<row r="1" ht="24" customHeight="1">')
    for ($i = 0; $i -lt $colCount; $i++) {
        $col = ConvertTo-ColName ($i + 1)
        $text = ConvertTo-XmlText ([string]$header[$i])
        [void]$sb.Append(('<c r="{0}1" s="1" t="inlineStr"><is><t xml:space="preserve">{1}</t></is></c>' -f $col, $text))
    }
    [void]$sb.Append('</row>')

    $rowNum = 1
    foreach ($row in @($Sheet.rows)) {
        $rowNum++
        [void]$sb.Append(('<row r="{0}">' -f $rowNum))
        $values = @($row)
        for ($i = 0; $i -lt $values.Count; $i++) {
            $value = $values[$i]
            if ($null -eq $value) { continue }
            $col = ConvertTo-ColName ($i + 1)
            $ref = "$col$rowNum"

            if ($value -is [bool]) {
                $b = if ($value) { 'TRUE' } else { 'FALSE' }
                [void]$sb.Append(('<c r="{0}" s="2" t="inlineStr"><is><t xml:space="preserve">{1}</t></is></c>' -f $ref, $b))
            }
            elseif ($value -is [string]) {
                if ($value.Length -eq 0) { continue }
                $style = Get-CellStyle $value
                $text = ConvertTo-XmlText $value
                [void]$sb.Append(('<c r="{0}" s="{1}" t="inlineStr"><is><t xml:space="preserve">{2}</t></is></c>' -f $ref, $style, $text))
            }
            elseif ($value -is [ValueType]) {
                [void]$sb.Append(('<c r="{0}" s="2"><v>{1}</v></c>' -f $ref, $value))
            }
            else {
                $text = ConvertTo-XmlText ([string]$value)
                [void]$sb.Append(('<c r="{0}" s="2" t="inlineStr"><is><t xml:space="preserve">{1}</t></is></c>' -f $ref, $text))
            }
        }
        [void]$sb.Append('</row>')
    }

    [void]$sb.Append('</sheetData>')

    $lastCol = ConvertTo-ColName $colCount
    [void]$sb.Append(('<autoFilter ref="A1:{0}{1}"/>' -f $lastCol, $rowNum))
    [void]$sb.Append('<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>')
    [void]$sb.Append('</worksheet>')

    return $sb.ToString()
}

function Build-WorkbookXml {
    param($Sheets)

    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
    [void]$sb.Append('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">')
    [void]$sb.Append('<workbookPr/><bookViews><workbookView activeTab="0"/></bookViews><sheets>')
    for ($i = 0; $i -lt $Sheets.Count; $i++) {
        $name = ConvertTo-XmlText ([string]$Sheets[$i].name)
        [void]$sb.Append(('<sheet name="{0}" sheetId="{1}" r:id="rId{1}"/>' -f $name, ($i + 1)))
    }
    [void]$sb.Append('</sheets></workbook>')
    return $sb.ToString()
}

function Build-WorkbookRels {
    param([int]$SheetCount)

    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
    [void]$sb.Append('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">')
    for ($i = 1; $i -le $SheetCount; $i++) {
        [void]$sb.Append(('<Relationship Id="rId{0}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{0}.xml"/>' -f $i))
    }
    $styleId = $SheetCount + 1
    [void]$sb.Append(('<Relationship Id="rId{0}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' -f $styleId))
    [void]$sb.Append('</Relationships>')
    return $sb.ToString()
}

function Build-ContentTypes {
    param([int]$SheetCount)

    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
    [void]$sb.Append('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">')
    [void]$sb.Append('<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>')
    [void]$sb.Append('<Default Extension="xml" ContentType="application/xml"/>')
    [void]$sb.Append('<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>')
    [void]$sb.Append('<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>')
    for ($i = 1; $i -le $SheetCount; $i++) {
        [void]$sb.Append(('<Override PartName="/xl/worksheets/sheet{0}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' -f $i))
    }
    [void]$sb.Append('</Types>')
    return $sb.ToString()
}

$stylesXml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="6"><font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font><font><sz val="11"/><color rgb="FF1B7F3B"/><name val="Calibri"/><family val="2"/></font><font><sz val="11"/><color rgb="FF9C6500"/><name val="Calibri"/><family val="2"/></font><font><sz val="11"/><color rgb="FFC00000"/><name val="Calibri"/><family val="2"/></font><font><sz val="11"/><color rgb="FF1F4E79"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2F5496"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFB4C6E7"/></left><right style="thin"><color rgb="FFB4C6E7"/></right><top style="thin"><color rgb="FFB4C6E7"/></top><bottom style="thin"><color rgb="FFB4C6E7"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>
'@

# --- Load data -------------------------------------------------------------

$jsonText = [System.IO.File]::ReadAllText($DataPath, [System.Text.Encoding]::UTF8)
$data = $jsonText | ConvertFrom-Json
$sheets = @($data.sheets)
$sheetCount = $sheets.Count

if ($sheetCount -lt 1) { throw "No sheets found in $DataPath" }

# --- Assemble parts --------------------------------------------------------

$rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'

$parts = [ordered]@{}
$parts['[Content_Types].xml'] = Build-ContentTypes $sheetCount
$parts['_rels/.rels'] = $rootRels
$parts['xl/workbook.xml'] = Build-WorkbookXml $sheets
$parts['xl/_rels/workbook.xml.rels'] = Build-WorkbookRels $sheetCount
$parts['xl/styles.xml'] = $stylesXml
for ($i = 0; $i -lt $sheetCount; $i++) {
    $parts[('xl/worksheets/sheet{0}.xml' -f ($i + 1))] = Build-SheetXml $sheets[$i]
}

# --- Write the zip ---------------------------------------------------------

$fullOut = [System.IO.Path]::GetFullPath($OutPath)
$outDir = Split-Path $fullOut -Parent
if (-not (Test-Path -LiteralPath $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
if (Test-Path -LiteralPath $fullOut) { Remove-Item -LiteralPath $fullOut -Force }

$enc = New-Object System.Text.UTF8Encoding($false)
$fs = [System.IO.File]::Open($fullOut, [System.IO.FileMode]::CreateNew)
$zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($key in $parts.Keys) {
        $entry = $zip.CreateEntry($key, [System.IO.Compression.CompressionLevel]::Optimal)
        $stream = $entry.Open()
        $writer = New-Object System.IO.StreamWriter($stream, $enc)
        try {
            $writer.Write([string]$parts[$key])
            $writer.Flush()
        }
        finally {
            $writer.Dispose()
        }
    }
}
finally {
    $zip.Dispose()
    $fs.Dispose()
}

# --- Report ----------------------------------------------------------------

$size = (Get-Item -LiteralPath $fullOut).Length
Write-Output ("Created: {0} ({1} bytes, {2} sheets)" -f $fullOut, $size, $sheetCount)
for ($i = 0; $i -lt $sheetCount; $i++) {
    $s = $sheets[$i]
    Write-Output ("  [{0}] {1} - {2} cols x {3} rows" -f ($i + 1), $s.name, @($s.header).Count, @($s.rows).Count)
}
