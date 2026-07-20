import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { MusicGenerationRequest, MusicGenerationResult, AceMusicStatus } from './models.js';

const DEFAULT_ACE_PORT = 8001;
const REQUEST_TIMEOUT = 300_000;

export class AceMusicGenerator {
    readonly name = 'ACE-Step';

    private get apiBase(): string {
        const port = process.env.ACE_STEP_PORT ? parseInt(process.env.ACE_STEP_PORT, 10) : DEFAULT_ACE_PORT;
        return `http://127.0.0.1:${port}`;
    }

    async isAvailable(): Promise<boolean> {
        try {
            const res = await axios.get(`${this.apiBase}/health`, { timeout: 5000 });
            return res.status === 200;
        } catch {
            return false;
        }
    }

    async getStatus(): Promise<AceMusicStatus> {
        try {
            const res = await axios.get(`${this.apiBase}/health`, { timeout: 5000 });
            return {
                running: true,
                port: parseInt(process.env.ACE_STEP_PORT || String(DEFAULT_ACE_PORT), 10),
                version: res.data?.version || null,
                message: 'ACE-Step server is running',
            };
        } catch {
            return {
                running: false,
                port: parseInt(process.env.ACE_STEP_PORT || String(DEFAULT_ACE_PORT), 10),
                version: null,
                message: `ACE-Step server not available at ${this.apiBase}`,
            };
        }
    }

    async generate(request: MusicGenerationRequest): Promise<MusicGenerationResult> {
        const available = await this.isAvailable();
        if (!available) {
            return {
                id: `ace_failed_${Date.now()}`,
                prompt: request.prompt,
                downloadUrl: '',
                localPath: null,
                durationSeconds: 0,
                title: 'Generation Failed',
                success: false,
                error: 'ACE-Step server is not running',
            };
        }

        try {
            const payload: any = { prompt: request.prompt };
            if (request.duration) payload.duration = request.duration;
            if (request.genre) payload.genre = request.genre;
            if (request.bpm) payload.bpm = request.bpm;
            if (request.lyrics) payload.lyrics = request.lyrics;
            if (request.style) payload.style = request.style;

            const res = await axios.post(`${this.apiBase}/v1/generate`, payload, {
                timeout: REQUEST_TIMEOUT,
                responseType: 'arraybuffer',
            });

            const outputDir = path.resolve(process.cwd(), 'output', 'ace-generated');
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            const sanitized = request.prompt
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '')
                .slice(0, 50);
            const filename = `ace_${sanitized}_${Date.now()}.mp3`;
            const filePath = path.join(outputDir, filename);

            fs.writeFileSync(filePath, Buffer.from(res.data));

            return {
                id: `ace_${Date.now()}`,
                prompt: request.prompt,
                downloadUrl: `/output/ace-generated/${filename}`,
                localPath: filePath,
                durationSeconds: request.duration || 30,
                title: sanitized.replace(/-/g, ' '),
                success: true,
                error: null,
            };
        } catch (err: any) {
            return {
                id: `ace_failed_${Date.now()}`,
                prompt: request.prompt,
                downloadUrl: '',
                localPath: null,
                durationSeconds: 0,
                title: 'Generation Failed',
                success: false,
                error: err.message,
            };
        }
    }

    async listGenres(): Promise<string[]> {
        try {
            const res = await axios.get(`${this.apiBase}/v1/genres`, { timeout: 5000 });
            return res.data?.genres || [];
        } catch {
            return [];
        }
    }
}

export const aceMusicGenerator = new AceMusicGenerator();
