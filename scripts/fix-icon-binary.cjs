const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function convert() {
  console.log('Converting logo-automation.png to icon.ico...');
  
  const input = path.join(__dirname, '..', 'assets', 'logo-automation.png');
  const output = path.join(__dirname, '..', 'assets', 'icon.ico');
  
  if (!fs.existsSync(input)) {
    console.error(`Input file not found: ${input}`);
    process.exit(1);
  }

  try {
    // Run npx png-to-ico and capture the raw binary buffer from stdout
    // Use { encoding: 'buffer' } to prevent any string encoding/corruption
    const icoBuffer = execSync(`npx -y png-to-ico assets/logo-automation.png`, { 
      encoding: 'buffer',
      maxBuffer: 50 * 1024 * 1024 // 50MB max
    });

    if (icoBuffer.length === 0) {
      console.error('Generated icon buffer is empty');
      process.exit(1);
    }

    // Write the bit-perfect buffer to disk
    fs.writeFileSync(output, icoBuffer);
    
    console.log(`Successfully created icon.ico (${icoBuffer.length} bytes)`);
    
    // Quick sanity check: ICO header starts with 00 00 01 00
    if (icoBuffer[0] === 0x00 && icoBuffer[1] === 0x00 && icoBuffer[2] === 0x01 && icoBuffer[3] === 0x00) {
      console.log('✓ ICO file header looks valid');
    } else {
      console.warn('⚠ Warning: ICO file header might be unusual:', icoBuffer.slice(0, 4).toString('hex'));
    }
  } catch (error) {
    console.error('Failed to convert icon:', error.message);
    process.exit(1);
  }
}

convert();
