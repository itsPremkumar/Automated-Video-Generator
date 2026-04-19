import * as fs from 'fs';
import * as path from 'path';
import { INPUT_ASSET_ROOT } from './src/lib/path-safety';

function testAssets() {
    console.log('Checking INPUT_ASSET_ROOT:', INPUT_ASSET_ROOT);
    if (fs.existsSync(INPUT_ASSET_ROOT)) {
        const mediaExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.mp4', '.mov', '.webm', '.gif'];
        const foundAssets = fs.readdirSync(INPUT_ASSET_ROOT)
            .filter(file => mediaExtensions.includes(path.extname(file).toLowerCase()))
            .sort();
        
        console.log('Found Assets:', foundAssets);
    } else {
        console.log('INPUT_ASSET_ROOT does not exist!');
    }
}

testAssets();
