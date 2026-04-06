import * as fs from 'fs';
import { parse } from 'dotenv';
import { ENV_FILE, EDITABLE_ENV_KEYS } from '../constants/config';
import { EditableEnvKey, SetupStatus } from '../types/server.types';
import { resolveProjectPath } from '../shared/runtime/paths';
import { getVoiceEngineStatus } from '../lib/voice-generator';

export function readEnvValues(): Record<string, string> {
    if (!fs.existsSync(ENV_FILE)) {
        return {};
    }

    try {
        return parse(fs.readFileSync(ENV_FILE, 'utf8'));
    } catch {
        return {};
    }
}

export function normalizeEnvValue(value: unknown): string {
    return typeof value === 'string' ? value.trim().replace(/\r?\n/g, ' ') : '';
}

function setEnvFileValue(contents: string, key: EditableEnvKey, value: string): string {
    const normalizedLine = `${key}=${value}`;
    const matcher = new RegExp(`^\\s*#?\\s*${key}=.*$`, 'm');

    if (matcher.test(contents)) {
        return contents.replace(matcher, () => normalizedLine);
    }

    const suffix = contents.trimEnd().length > 0 ? '\n' : '';
    return `${contents.trimEnd()}${suffix}${normalizedLine}\n`;
}

export function updateEnvValues(updates: Partial<Record<EditableEnvKey, string>>): void {
    let contents = fs.existsSync(ENV_FILE)
        ? fs.readFileSync(ENV_FILE, 'utf8')
        : (fs.existsSync(resolveProjectPath('.env.example')) ? fs.readFileSync(resolveProjectPath('.env.example'), 'utf8') : '');

    for (const key of EDITABLE_ENV_KEYS) {
        if (!(key in updates)) {
            continue;
        }

        const value = normalizeEnvValue(updates[key]);
        contents = setEnvFileValue(contents, key, value);
        process.env[key] = value;
    }

    const tempEnvFile = `${ENV_FILE}.tmp`;
    fs.writeFileSync(tempEnvFile, contents);
    fs.renameSync(tempEnvFile, ENV_FILE);
}

export function getSetupStatus(): SetupStatus {
    const envValues = readEnvValues();
    const hasPexelsKey = Boolean(envValues.PEXELS_API_KEY?.trim());
    const hasPixabayKey = Boolean(envValues.PIXABAY_API_KEY?.trim());
    const hasGeminiKey = Boolean(envValues.GEMINI_API_KEY?.trim());
    const hasPublicBaseUrl = Boolean(envValues.PUBLIC_BASE_URL?.trim());
    const voiceEngine = getVoiceEngineStatus();

    return {
        envFileExists: fs.existsSync(ENV_FILE),
        hasPexelsKey,
        hasPixabayKey,
        hasGeminiKey,
        hasPublicBaseUrl,
        edgeTtsReady: voiceEngine.edgeTtsReady,
        voiceFallbackReady: voiceEngine.fallbackReady,
        voiceGenerationReady: voiceEngine.generationReady,
        voiceEngineMode: voiceEngine.activeEngine,
        voiceEngineMessage: voiceEngine.detail,
        readyForGeneration: hasPexelsKey && voiceEngine.generationReady,
    };
}
