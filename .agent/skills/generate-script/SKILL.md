---
name: generate-script
description: How to generate video scripts for the Sproutern Video Generator from user prompts.
---

# Video Script Generation Skill

This skill provides instructions on how to transform a user's storytelling prompt into a valid `input-scripts.json` entry for the video generator.

## 1. JSON Structure

Every script must be an object within the main array in `input/input-scripts.json`.

```json
{
  "id": "unique-id",
  "title": "Display Title",
  "orientation": "landscape" | "portrait",
  "voice": "en-US-JennyNeural" | "en-US-GuyNeural",
  "script": "The actual narrative content..."
}
```

## 2. Director Mode (Manual Visual Cues)

To ensure high-quality, relevant stock footage, use "Director Mode" tags. Place them **at the start** of the sentence or block they describe.

- **Syntax:** `[Visual: Descriptive Query]`
- **Best Practice:** Be specific. Instead of `[Visual: nature]`, use `[Visual: green forest sunlight rays]`.
- **Placement:** The visual will stay active until the next `[Visual: ]` tag appears.

**Example:**
> "[Visual: futuristic city neon night] The city never sleeps. [Visual: robotic arm assembly] High-tech manufacturing is the backbone of the economy."

### 3. Audio & Voice Settings

You can choose from several high-quality neural voices. Specify these in the `voice` field of your JSON job.

#### Available Voices

| Gender | Voice ID | Style/Region |
| :--- | :--- | :--- |
| 👨 Male | `en-US-GuyNeural` | Deep, Authoritative (Recommended) |
| 👨 Male | `en-US-ChristopherNeural` | Calm, Steady |
| 👨 Male | `en-GB-RyanNeural` | British Accent |
| 👨 Male | `en-IN-PrabhatNeural` | Indian Accent |
| 👩 Female | `en-US-JennyNeural` | Warm, Professional (Recommended) |
| 👩 Female | `en-US-AriaNeural` | Friendly, Helpful |
| 👩 Female | `en-US-SaraNeural` | Cheerful, Bright |
| 👩 Female | `en-GB-SoniaNeural` | British Accent |

### 4. Job Settings Keys

| Key | Type | Description |
| :--- | :--- | :--- |
| `id` | String | Unique slug for the video (used for the folder name). |
| `title` | String | The main title displayed in the video. |
| `orientation` | String | `landscape` (16:9) or `portrait` (9:16). |
| `voice` | String | Use one of the Voice IDs from the table above. |
| `script` | String | The content to be spoken, including `[Visual: ...]` tags. |

### 5. Script Writing Rules

1.  **Scene Breaks:** Aim for scene changes every 5-10 seconds. Longer scenes can get repetitive.
2.  **Voiceovers:** The `script` text is exactly what will be spoken. Do NOT include instructions like `(Scene 1)` in the script text, as the TTS will read it.
3.  **Troubleshooting Visuals:** If a search is too specific and returns 0 results, the system will automatically try fallbacks (Pixabay -> Generic).
    *   **Tip:** Use keywords that describe the *action* or *vibe* (e.g., "morning sunrise", "fast car driving").
