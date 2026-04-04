import { resolveProjectPath } from '../runtime';
import { AVAILABLE_VOICES } from '../lib/voice-generator';

export { AVAILABLE_VOICES };

export const PORT = Number(process.env.PORT || 3001);
export const OUTPUT_ROOT = resolveProjectPath('output');
export const ENV_FILE = resolveProjectPath('.env');
export const DEFAULT_TITLE = 'Generated Video';
export const DEFAULT_VOICE = 'en-US-JennyNeural';
export const DEFAULT_FALLBACK_VIDEO = 'default.mp4';
export const MAX_TITLE_LENGTH = 80;
export const PROJECT_NAME = 'Automated Video Generator';
export const PROJECT_REPOSITORY_URL = 'https://github.com/itsPremkumar/Automated-Video-Generator';
export const PROJECT_LICENSE_URL = 'https://opensource.org/licenses/MIT';
export const DEFAULT_SITE_DESCRIPTION = 'Free and open-source AI text-to-video generator built with Remotion, Edge-TTS, stock footage APIs, and a local web portal for YouTube Shorts, TikTok videos, explainers, and marketing content.';
export const DEFAULT_SITE_KEYWORDS = 'free video generator, open-source video generator, ai video generator, text to video, remotion video generator, self-hosted video generator, youtube shorts generator, tiktok video generator, mcp video automation';
export const BRAND_COLOR = '#d8642a';

export const HELLO_WORLD_TITLE = 'Hello World - My First Video';

export const HELLO_WORLD_SCRIPT = `[Visual: beautiful sunrise over a mountain]
Welcome to your very first video! The installation was completely successful.

[Visual: fast typing on computer keyboard]
This script was automatically generated as a test to prove that your local text-to-video studio works perfectly.

[Visual: happy person celebrating success]
You can now edit this text to whatever you want, pick a voice, and start creating!`;

export const DEMO_SCRIPT = `[Visual: sunrise city skyline drone]
Artificial intelligence is no longer a distant idea. It already helps cities, schools, hospitals, and businesses work faster and smarter.

[Visual: software engineer coding on laptop]
Behind the scenes, machine learning systems organize huge amounts of information, detect patterns, and turn messy data into useful decisions.

[Visual: doctor reviewing digital health monitor]
In healthcare, AI can support doctors by highlighting unusual scans, tracking patient risk, and reducing the time needed to review critical cases.

[Visual: teacher using tablet in classroom]
In education, adaptive tools can help teachers explain difficult topics, personalize lessons, and give students more confidence as they learn step by step.

[Visual: warehouse robots moving packages]
Inside factories and warehouses, intelligent software coordinates robots, predicts maintenance, and keeps products moving smoothly from one station to the next.

[Visual: cybersecurity analyst monitoring screens]
Security teams also use AI to detect unusual behavior, respond to threats faster, and monitor systems that would be impossible to review manually all day.

[Visual: diverse team discussing ethics in office]
The next challenge is not only building more powerful systems, but using them responsibly, transparently, and in ways that genuinely improve human life.`;

export const EDITABLE_ENV_KEYS = ['PEXELS_API_KEY', 'PIXABAY_API_KEY', 'GEMINI_API_KEY', 'PUBLIC_BASE_URL'] as const;

export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const RATE_LIMIT_MAX = 10;
