// scripts/test-upload-post.ts — quick offline smoke check for upload-post env gating.
import { isUploadConfigured, getSupportedPlatforms, isValidPlatform } from '../src/agentic/services/upload-post.js';

console.log(`isUploadConfigured (no env): ${isUploadConfigured()}`);
console.log(`getSupportedPlatforms: ${JSON.stringify(getSupportedPlatforms())}`);
console.log(`isValidPlatform('tiktok'): ${isValidPlatform('tiktok')}`);
console.log(`isValidPlatform('fakebook'): ${isValidPlatform('fakebook')}`);