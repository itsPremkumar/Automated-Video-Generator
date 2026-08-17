/**
 * scripts/templates.ts — Pre-built video script templates for niches.
 *
 * Identity-preserving: all templates built-in, no external deps.
 */

export type NicheType = 'tech' | 'finance' | 'health' | 'education' | 'entertainment' | 'travel' | 'food' | 'motivation' | 'news' | 'gaming';

export interface ScriptTemplate {
    name: string;
    niche: NicheType;
    description: string;
    structure: string[];
    suggestedDuration: number;
    suggestedMusic: string;
    suggestedTone: string;
}

export const SCRIPT_TEMPLATES: Record<NicheType, ScriptTemplate> = {
    tech: {
        name: 'Tech Review',
        niche: 'tech',
        description: 'Product review or tech news format',
        structure: ['Hook', 'Problem', 'Solution', 'Features', 'Pros/Cons', 'Verdict', 'CTA'],
        suggestedDuration: 60,
        suggestedMusic: 'upbeat',
        suggestedTone: 'informative',
    },
    finance: {
        name: 'Finance Tips',
        niche: 'finance',
        description: 'Financial advice or market update',
        structure: ['Hook', 'Context', 'Key Point', 'Example', 'Action Step', 'Disclaimer', 'CTA'],
        suggestedDuration: 45,
        suggestedMusic: 'corporate',
        suggestedTone: 'professional',
    },
    health: {
        name: 'Health & Wellness',
        niche: 'health',
        description: 'Health tips or fitness advice',
        structure: ['Hook', 'Myth', 'Fact', 'Tips', 'Example', 'Encouragement', 'CTA'],
        suggestedDuration: 50,
        suggestedMusic: 'calm',
        suggestedTone: 'encouraging',
    },
    education: {
        name: 'Educational',
        niche: 'education',
        description: 'Teach a concept or skill',
        structure: ['Hook', 'Overview', 'Explanation', 'Example', 'Practice', 'Summary', 'CTA'],
        suggestedDuration: 60,
        suggestedMusic: 'inspiring',
        suggestedTone: 'clear',
    },
    entertainment: {
        name: 'Entertainment',
        niche: 'entertainment',
        description: 'Fun facts or listicle format',
        structure: ['Hook', 'Setup', 'List Item 1', 'List Item 2', 'List Item 3', 'Punchline', 'CTA'],
        suggestedDuration: 40,
        suggestedMusic: 'fun',
        suggestedTone: 'humorous',
    },
    travel: {
        name: 'Travel Vlog',
        niche: 'travel',
        description: 'Destination guide or travel tips',
        structure: ['Hook', 'Location Intro', 'Highlight 1', 'Highlight 2', 'Local Tip', 'Best Time', 'CTA'],
        suggestedDuration: 55,
        suggestedMusic: 'adventurous',
        suggestedTone: 'enthusiastic',
    },
    food: {
        name: 'Food & Recipe',
        niche: 'food',
        description: 'Recipe or restaurant review',
        structure: ['Hook', 'Ingredients', 'Step 1', 'Step 2', 'Step 3', 'Final Dish', 'CTA'],
        suggestedDuration: 50,
        suggestedMusic: 'upbeat',
        suggestedTone: 'warm',
    },
    motivation: {
        name: 'Motivational',
        niche: 'motivation',
        description: 'Inspirational content or quotes',
        structure: ['Hook', 'Struggle', 'Turning Point', 'Lesson', 'Quote', 'Call to Action', 'CTA'],
        suggestedDuration: 45,
        suggestedMusic: 'epic',
        suggestedTone: 'inspiring',
    },
    news: {
        name: 'News Update',
        niche: 'news',
        description: 'Breaking news or weekly recap',
        structure: ['Headline', 'Context', 'Key Detail', 'Impact', 'Expert Quote', 'Next Steps', 'CTA'],
        suggestedDuration: 40,
        suggestedMusic: 'neutral',
        suggestedTone: 'objective',
    },
    gaming: {
        name: 'Gaming',
        niche: 'gaming',
        description: 'Game review or highlight reel',
        structure: ['Hook', 'Game Intro', 'Gameplay', 'Highlights', 'Verdict', 'Rating', 'CTA'],
        suggestedDuration: 55,
        suggestedMusic: 'intense',
        suggestedTone: 'energetic',
    },
};

/** Get template by niche */
export function getTemplate(niche: NicheType): ScriptTemplate {
    return SCRIPT_TEMPLATES[niche] || SCRIPT_TEMPLATES.education;
}

/** List all available niches */
export function listNiches(): NicheType[] {
    return Object.keys(SCRIPT_TEMPLATES) as NicheType[];
}

/** Generate a script structure from template */
export function generateScriptStructure(niche: NicheType, topic: string): string[] {
    const template = getTemplate(niche);
    return template.structure.map(step => `${step}: ${topic}`);
}

/** Get music suggestion for a niche */
export function getMusicSuggestion(niche: NicheType): string {
    return getTemplate(niche).suggestedMusic;
}
