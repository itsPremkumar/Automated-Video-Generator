import * as fs from 'fs';
import { resolveProjectPath } from './runtime';
import { z } from 'zod';

const INPUT_SCRIPTS_FILE = resolveProjectPath('input', 'input-scripts.json');

export const videoScriptSchema = z.object({
  id: z.string().describe('Unique ID for the script'),
  title: z.string().describe('Title of the video'),
  orientation: z.enum(['portrait', 'landscape']).optional(),
  voice: z.string().optional(),
  showText: z.boolean().optional(),
  script: z.string().describe('The narrative script with [Visual: query] tags'),
  defaultVideo: z.string().optional(),
});

export async function readInputScripts() {
  if (!fs.existsSync(INPUT_SCRIPTS_FILE)) {
    return [];
  }
  const content = fs.readFileSync(INPUT_SCRIPTS_FILE, 'utf-8');
  return JSON.parse(content);
}

export async function writeInputScript(script: any) {
  const scripts = await readInputScripts();
  const index = scripts.findIndex((s: any) => s.id === script.id);
  
  if (index !== -1) {
    scripts[index] = { ...scripts[index], ...script };
  } else {
    scripts.push(script);
  }
  
  fs.writeFileSync(INPUT_SCRIPTS_FILE, JSON.stringify(scripts, null, 2));
  return scripts;
}

export async function deleteInputScript(id: string) {
  const scripts = await readInputScripts();
  const filtered = scripts.filter((s: any) => s.id !== id);
  fs.writeFileSync(INPUT_SCRIPTS_FILE, JSON.stringify(filtered, null, 2));
  return filtered;
}

export function validateScriptFormat(script: any) {
  return videoScriptSchema.safeParse(script);
}
