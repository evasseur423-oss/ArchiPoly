const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const buildDir = path.join(__dirname, '..', 'build');
const publicDir = path.join(__dirname, '..', 'public');

if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

const newIconJpg = 'C:\\Users\\User\\.gemini\\antigravity-ide\\brain\\b144b47f-e9e5-49c6-841d-10197855f495\\archipoly_icon_1792508983214.jpg';
const iconPng512 = path.join(buildDir, 'icon.png');

console.log('Generating 512x512 master PNG from new ArchiPoly icon...');
const psConvert = `
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('${newIconJpg.replace(/\\/g, '\\\\')}')
$bmp = New-Object System.Drawing.Bitmap 512, 512
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.DrawImage($img, 0, 0, 512, 512)
$bmp.Save('${iconPng512.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Save('${path.join(publicDir, 'icon.png').replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
$img.Dispose()
`;

const tempPs1 = path.join(buildDir, 'convert_master.ps1');
fs.writeFileSync(tempPs1, psConvert);
execSync(`powershell -ExecutionPolicy Bypass -File "${tempPs1}"`);
fs.unlinkSync(tempPs1);

// Generate multiple sizes: 256, 128, 64, 48, 32, 16 using PowerShell GDI+
const sizes = [256, 128, 64, 48, 32, 16];
const psScript = `
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('${iconPng512.replace(/\\/g, '\\\\')}')
$sizes = @(256, 128, 64, 48, 32, 16)
foreach ($s in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $s, $s
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($img, 0, 0, $s, $s)
    $outPath = "${buildDir.replace(/\\/g, '\\\\')}\\icon_" + $s + ".png"
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}
$img.Dispose()
`;

const tempResizePs1 = path.join(buildDir, 'resize.ps1');
fs.writeFileSync(tempResizePs1, psScript);
execSync(`powershell -ExecutionPolicy Bypass -File "${tempResizePs1}"`);
fs.unlinkSync(tempResizePs1);

// Pack multi-resolution ICO file
const pngBuffers = sizes.map(s => {
  const filePath = path.join(buildDir, `icon_${s}.png`);
  const buf = fs.readFileSync(filePath);
  return { size: s, buffer: buf };
});

const headerSize = 6;
const dirEntrySize = 16;
const totalEntries = pngBuffers.length;
let currentOffset = headerSize + (dirEntrySize * totalEntries);

const icoBuffer = Buffer.alloc(currentOffset + pngBuffers.reduce((sum, item) => sum + item.buffer.length, 0));

// ICONDIR Header
icoBuffer.writeUInt16LE(0, 0); // Reserved
icoBuffer.writeUInt16LE(1, 2); // 1 = ICO
icoBuffer.writeUInt16LE(totalEntries, 4); // Count of images

// Directory Entries
pngBuffers.forEach((item, index) => {
  const entryOffset = headerSize + (index * dirEntrySize);
  const w = item.size >= 256 ? 0 : item.size;
  const h = item.size >= 256 ? 0 : item.size;

  icoBuffer.writeUInt8(w, entryOffset + 0); // Width (0 means 256)
  icoBuffer.writeUInt8(h, entryOffset + 1); // Height (0 means 256)
  icoBuffer.writeUInt8(0, entryOffset + 2); // Color palette
  icoBuffer.writeUInt8(0, entryOffset + 3); // Reserved
  icoBuffer.writeUInt16LE(1, entryOffset + 4); // Color planes
  icoBuffer.writeUInt16LE(32, entryOffset + 6); // Bits per pixel
  icoBuffer.writeUInt32LE(item.buffer.length, entryOffset + 8); // Size of image
  icoBuffer.writeUInt32LE(currentOffset, entryOffset + 12); // Offset of image

  item.buffer.copy(icoBuffer, currentOffset);
  currentOffset += item.buffer.length;

  fs.unlinkSync(path.join(buildDir, `icon_${item.size}.png`));
});

// Save final build/icon.ico
const icoPath = path.join(buildDir, 'icon.ico');
fs.writeFileSync(icoPath, icoBuffer);

console.log(`[ArchiPoly Icon Builder] New minimalist icon created at: ${icoPath} (${icoBuffer.length} bytes, 6 resolutions)`);
