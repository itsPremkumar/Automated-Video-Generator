/**
 * Caption localization for non-English voiceovers.
 *
 * Reuses the Brain's sanctioned LLM completion path (completeJSON) so it
 * respects the same zero-cost / configured-model constraints as metadata
 * generation. If the model is unavailable or the call fails, callers should
 * treat the result as "no translation" and fall back to the original text.
 */

import type { AgentBrain } from '../ai/brain.js';

const LANG_NAMES: Record<string, string> = {
  hi: 'Hindi', ta: 'Tamil', fr: 'French', de: 'German', es: 'Spanish',
  'hi-in': 'Hindi', 'ta-in': 'Tamil', 'fr-fr': 'French', 'de-de': 'German',
  'es-es': 'Spanish', spanish: 'Spanish', german: 'German', french: 'French',
  hindi: 'Hindi', tamil: 'Tamil', english: 'English',
};

/**
 * Translate an array of scene caption strings into `lang`.
 * Returns an array of the same length; entries equal the input when the
 * language is English, translation is skipped, or the call fails.
 */
export async function translateScenes(
  texts: string[],
  lang: string,
  brain: AgentBrain,
): Promise<string[]> {
  const target = LANG_NAMES[lang.toLowerCase().replace(/_/g, '-')] || LANG_NAMES[lang.toLowerCase()] || lang;
  if (!texts.length || target === 'English') return texts.slice();

  const system = `You are a professional subtitle translator. Translate the given video caption lines into ${target}. Preserve meaning, tone, and punctuation. Return ONLY a JSON object: {"lines": string[]} with exactly one translated line per input line, in order. Do not add notes or commentary.`;

  const joined = texts.map((t, i) => `${i + 1}. ${t}`).join('\n');

  try {
    // brain.completeJSON is the public, guarded LLM entry point.
    const out = await brain.completeJSON<{ lines: string[] }>(
      system,
      `Translate each numbered line into ${target}:\n${joined}`,
      '{"lines":["...","..."]}',
    );
    if (out && Array.isArray(out.lines) && out.lines.length === texts.length) {
      return out.lines.map((l: string, i: number) => (typeof l === 'string' && l.trim()) ? l.trim() : texts[i]);
    }
    return texts.slice();
  } catch {
    return texts.slice();
  }
}
