const sharp = require('sharp');
const pngToIcoModule = require('png-to-ico');
const pngToIco = pngToIcoModule.default || pngToIcoModule;
const fs = require('fs');
const path = require('path');

const sourceImage = process.argv[2];
const assetsDir = path.join(__dirname, '..', 'assets');

if (!sourceImage) {
    console.error('Usage: node create-icons.cjs <source-png>');
    process.exit(1);
}

async function main() {
    // Create 256x256 PNG for ICO conversion
    const png256 = path.join(assetsDir, 'icon-256.png');
    await sharp(sourceImage)
        .resize(256, 256, { fit: 'cover' })
        .png()
        .toFile(png256);
    console.log('Created 256x256 PNG');

    // Create ICO from 256px PNG
    const icoBuffer = await pngToIco(png256);
    fs.writeFileSync(path.join(assetsDir, 'icon.ico'), icoBuffer);
    console.log('Created icon.ico');

    // Create tray icon (32x32)
    await sharp(sourceImage)
        .resize(32, 32, { fit: 'cover' })
        .png()
        .toFile(path.join(assetsDir, 'tray-icon.png'));
    console.log('Created tray-icon.png (32x32)');

    // Cleanup temp file
    try { fs.unlinkSync(png256); } catch {}

    console.log('Done! Icons saved to assets/');
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
