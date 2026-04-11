import { DEMO_SCRIPT, HELLO_WORLD_SCRIPT, LOCALE_TO_LANGUAGE_NAME } from '../../../constants/config';
import { domReferences } from './dom';
import { utilityFunctions } from './utils';
import { setupLogic } from './setup';
import { voiceLogic } from './voices';
import { formLogic } from './form';
import { browserLogic } from './browser';

export function assembleHomeScript(voicesJson: string): string {
    return `
// ─── Constants ─────────────────────────────────────────────────────────────────
const sampleScript = ${JSON.stringify(DEMO_SCRIPT)};
const helloWorldScript = ${JSON.stringify(HELLO_WORLD_SCRIPT)};
const localeNames = ${JSON.stringify(LOCALE_TO_LANGUAGE_NAME)};
let allVoices = ${voicesJson};

${domReferences()}
${utilityFunctions()}
${setupLogic()}
${voiceLogic()}
${formLogic()}
${browserLogic()}

// ─── Initialization ─────────────────────────────────────────────────────────────
updateScriptMetrics();
loadSetupStatus();
renderVoices();
loadAllVoices();
loadGalleryAssets();
`;
}
