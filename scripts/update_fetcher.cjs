const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'lib', 'visual-fetcher.ts');
let code = fs.readFileSync(filePath, 'utf8');

// 1. Insert optimizeKeywordsWithGemini BEFORE fetchVisualsForScene
if (!code.includes('optimizeKeywordsWithGemini')) {
    const optimizeStr = `
/**
 * Use Gemini AI to optimize search keywords based on scene text.
 * Falls back to default keywords if API key is missing or on error.
 */
export async function optimizeKeywordsWithGemini(
    sceneText: string,
    defaultKeywords: string[]
): Promise<string[]> {
    if (!GEMINI_API_KEY) {
        return defaultKeywords;
    }

    try {
        const prompt = \`You are an expert AI video director.
I have this voiceover text for a video scene: "\${sceneText}"

Return a JSON array of up to 3 highly optimized, cinematic search queries (strings) to find the best matching B-roll footage on Pexels or Pixabay.
The queries should be concise but descriptive (e.g. "cinematic dark moody rain window", "aerial drone city sunset").
Only return the JSON array, no other text or formatting. DO NOT wrap with \\\`\\\`\\\`json.\`;

        const response = await axios.post(
            \\\`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=\${GEMINI_API_KEY}\\\`,
            {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7 }
            },
            { timeout: 10000 }
        );

        let responseText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (!responseText) return defaultKeywords;

        responseText = responseText.replace(/\\\`\\\`\\\`json/g, '').replace(/\\\`\\\`\\\`/g, '').trim();

        const optimizedKeywords = JSON.parse(responseText);
        if (Array.isArray(optimizedKeywords) && optimizedKeywords.length > 0) {
            return optimizedKeywords;
        }
    } catch (error: any) {
    }
    return defaultKeywords;
}

`;
    // Find fetchVisualsForScene block and inject before it
    code = code.replace(/(\/\*\*\s*\* Fetch visuals for a scene based on keywords \(with caching\)\s*\*\/)/, optimizeStr + '$1');
}

// 2. Update searchVideos perPage default to 15, orientation to 'none' support
code = code.replace(
    /export async function searchVideos\(\s*query:\s*string,\s*perPage:\s*number\s*=\s*\d+,\s*retries:\s*number\s*=\s*\d+,\s*orientation:\s*'portrait'\s*\|\s*'landscape'\s*=\s*'portrait'\s*\)/g,
    "export async function searchVideos(query: string, perPage: number = 15, retries: number = 3, orientation: 'portrait' | 'landscape' | 'none' = 'portrait')"
);

// Pexels API orientation passing
code = code.replace(
    /per_page:\s*perPage,\s*orientation,?\s*\},/g,
    "per_page: perPage, ...(orientation !== 'none' ? { orientation } : {}) },"
);

// 3. Update searchPixabayVideos perPage default to 15, orientation to 'none' support
code = code.replace(
    /export async function searchPixabayVideos\(\s*query:\s*string,\s*perPage:\s*number\s*=\s*\d+,\s*retries:\s*number\s*=\s*\d+,\s*orientation:\s*'portrait'\s*\|\s*'landscape'\s*=\s*'portrait'\s*\)/g,
    "export async function searchPixabayVideos(query: string, perPage: number = 15, retries: number = 3, orientation: 'portrait' | 'landscape' | 'none' = 'portrait')"
);

// Pixabay mapping and orientation resolving
code = code.replace(
    /const pixabayOrientation = orientation === 'landscape' \? 'horizontal' : 'vertical';/g,
    "const pixabayOrientation = orientation === 'landscape' ? 'horizontal' : (orientation === 'portrait' ? 'vertical' : '');"
);

code = code.replace(
    /video_type:\s*'film',\s*orientation:\s*pixabayOrientation,/g,
    "video_type: 'film', ...(pixabayOrientation ? { orientation: pixabayOrientation } : {}),"
);

// 4. Pixabay proper sort returning
if (!code.includes('return sortVideoAssets(assets)')) {
    code = code.replace(
        /return response\.data\.hits\.map\(\(hit: any\) => \{([\s\S]*?)videoDuration:\s*hit\.duration\s*\};\s*\}\);/g,
        "const assets = response.data.hits.map((hit: any) => {$1videoDuration: hit.duration\n                };\n            });\n            return sortVideoAssets(assets);"
    );
}

// 5. Update fetchVisualsForScene signature to accept sceneText
code = code.replace(
    /export async function fetchVisualsForScene\(\s*keywords:\s*string\[\],\s*preferVideo:\s*boolean\s*=\s*true,\s*orientation:\s*'portrait'\s*\|\s*'landscape'\s*=\s*'portrait'\s*\):\s*Promise<MediaAsset \| null>\s*\{/g,
    "export async function fetchVisualsForScene(keywords: string[], preferVideo: boolean = true, orientation: 'portrait' | 'landscape' | 'none' = 'portrait', sceneText?: string): Promise<MediaAsset | null> {"
);

// Update fetchVisualsForScene implementation loop with AI fallback logic
const fetchLoopPattern = /try\s*\{\s*if\s*\(preferVideo\)\s*\{\s*const videos = await searchVideos\(query, 1[\s\S]*?if\s*\(images\.length > 0\)\s*\{\s*\/\/\s*console\.log[^\n]+\n\s*cache\[cacheKey\] = images\[0\];\s*saveCache\(cache\);\s*return images\[0\];\s*\}/g;

const newFetchLoop = `    const queriesToTry = sceneText ? await optimizeKeywordsWithGemini(sceneText, [query]) : [query];

    try {
        if (preferVideo) {
            for (const q of queriesToTry) {
                const orientationsToTry: ('portrait' | 'landscape' | 'none')[] = orientation !== 'none' ? [orientation, 'none'] : ['none'];

                for (const orient of orientationsToTry) {
                    const videos = await searchVideos(q, 15, 2, orient);
                    if (videos.length > 0) {
                        cache[cacheKey] = videos[0];
                        saveCache(cache);
                        return videos[0];
                    }

                    const pixabayVideos = await searchPixabayVideos(q, 15, 2, orient);
                    if (pixabayVideos.length > 0) {
                        cache[cacheKey] = pixabayVideos[0];
                        saveCache(cache);
                        return pixabayVideos[0];
                    }
                }
            }
        }

        // Fallback to images using original query
        const images = await searchImages(query, 1, 3, orientation === 'none' ? 'portrait' : orientation);
        if (images.length > 0) {
            cache[cacheKey] = images[0];
            saveCache(cache);
            return images[0];
        }`;

code = code.replace(fetchLoopPattern, newFetchLoop);

// 6. Update downloadMedia chunk validation size
code = code.replace(
    /const stats = fs\.statSync\(outputPath\);\s*if\s*\(stats\.size\s*>\s*1024\)\s*\{\s*\/\/\s*Ignore\s*>\s*1KB\s*files/g,
    "const stats = fs.statSync(outputPath);\n            if (stats.size > 100 * 1024) { // Ignore > 100KB files"
);

fs.writeFileSync(filePath, code);
console.log('Update script completed successfully.');
