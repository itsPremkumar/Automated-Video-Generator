#!/usr/bin/env node
/**
 * Convert a PNG image to ICO format.
 * ICO format spec: https://en.wikipedia.org/wiki/ICO_(file_format)
 * 
 * Usage: node scripts/png-to-ico.cjs <input.png> <output.ico>
 */
const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
    console.error('Usage: node png-to-ico.cjs <input.png> <output.ico>');
    process.exit(1);
}

const pngData = fs.readFileSync(path.resolve(inputPath));

// Verify it's a valid PNG (magic bytes: 89 50 4E 47)
if (pngData[0] !== 0x89 || pngData[1] !== 0x50 || pngData[2] !== 0x4E || pngData[3] !== 0x47) {
    console.error('Error: Input file is not a valid PNG');
    process.exit(1);
}

// Read PNG dimensions from IHDR chunk (starts at byte 16)
const width = pngData.readUInt32BE(16);
const height = pngData.readUInt32BE(20);

console.log(`Input: ${inputPath} (${width}x${height}, ${pngData.length} bytes)`);

// ICO files with PNG data > 256x256 use 0 for width/height fields
const icoWidth = width >= 256 ? 0 : width;
const icoHeight = height >= 256 ? 0 : height;

// Build ICO file
// ICO Header: 6 bytes
const headerSize = 6;
// ICO Directory Entry: 16 bytes per image
const dirEntrySize = 16;
// We'll include 1 image
const numImages = 1;
const dataOffset = headerSize + (dirEntrySize * numImages);

const icoBuffer = Buffer.alloc(dataOffset + pngData.length);

// ICO Header
icoBuffer.writeUInt16LE(0, 0);         // Reserved, must be 0
icoBuffer.writeUInt16LE(1, 2);         // Type: 1 = ICO
icoBuffer.writeUInt16LE(numImages, 4); // Number of images

// ICO Directory Entry
icoBuffer.writeUInt8(icoWidth, 6);      // Width (0 = 256)
icoBuffer.writeUInt8(icoHeight, 7);     // Height (0 = 256)
icoBuffer.writeUInt8(0, 8);             // Color palette: 0 = no palette
icoBuffer.writeUInt8(0, 9);             // Reserved
icoBuffer.writeUInt16LE(1, 10);         // Color planes
icoBuffer.writeUInt16LE(32, 12);        // Bits per pixel
icoBuffer.writeUInt32LE(pngData.length, 14); // Size of PNG data
icoBuffer.writeUInt32LE(dataOffset, 18);     // Offset to PNG data

// Copy PNG data
pngData.copy(icoBuffer, dataOffset);

fs.writeFileSync(path.resolve(outputPath), icoBuffer);
console.log(`Output: ${outputPath} (${icoBuffer.length} bytes)`);
console.log('✓ ICO file created successfully');
