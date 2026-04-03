# Video Generator Input Format

> **File Location**: `input/input-scripts.json`
> **Format**: JSON Array of Objects

This document provides a comprehensive guide to configuring batch video generation jobs. The system processes each object in the array sequentially.

---

## 📋 JSON Structure

The file must be a valid JSON array. Each item in the array is a "job" that produces one video.

```json
[
  {
    "id": "future-of-ai-2025",
    "title": "The Future of Artificial Intelligence in 2025",
    "script": "The text to be spoken...",
    "orientation": "landscape",
    "voice": "en-US-GuyNeural"
  }
]
```

---

## 🛠️ Configuration Fields

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| **`id`** | `string` | No | A unique identifier for the video job. <br>• **Usage**: Determines the output folder name (`output/{id}`). <br>• **Best Practice**: Use `kebab-case` (e.g., `my-video-title`). <br>• **Fallback**: If omitted, the system sanitizes the `title` to create a folder name. |
| **`title`** | `string` | **Yes** | The **detailed** human-readable title of the video. <br>• **Required**: Must be specific and descriptive (e.g., "The Future of AI in 2025" instead of just "AI"). <br>• **Usage**: Used for the **output filename** (`[Title].mp4`), metadata file (`[Title] details.txt`), and logs. <br>• **Note**: Spaces are preserved in the filename.
| **`script`** | `string` | **Yes** | The full text content for the video voiceover. <br>• **Min Length**: 10 characters. <br>• **Max Length**: ~5000 characters suggested. <br>• **Parsing**: The script is analyzed to generate scenes, find relevant stock footage, and creating subtitles. |
| **`orientation`** | `string` | No | The aspect ratio of the final video. <br>• **Options**: <br> &nbsp;&nbsp; `portrait` (9:16) - Best for Shorts/Reels/TikTok. <br> &nbsp;&nbsp; `landscape` (16:9) - Best for YouTube/TV. <br>• **Default**: Falls back to the global CLI flag (`--landscape`) or the `VIDEO_ORIENTATION` environment variable. |
| **`voice`** | `string` | No | The specific voice to use for this video's narration. <br>• **See below** for the full list of available voices. <br>• **Default**: Falls back to `VIDEO_VOICE` (.env) or `en-US-GuyNeural`. |
| **`language`** | `string` | No | The language of the script. <br>• **Options**: `english`, `tamil`, `hindi`, `spanish`, `french`, `german`, and **100+ more**. <br>• **Usage**: Automatically selects a high-quality default voice for that language. |

| **`backgroundMusic`** | `string` | No | The filename of an audio file to use as background music. <br>• **Source**: Must be located in `input/input-assests/`. <br>• **Format**: `.mp3`, `.wav`, or `.m4a`. <br>• **Behavior**: Loops automatically for the duration of the video. |
| **`musicVolume`** | `number` | No | The volume level for the background music. <br>• **Range**: `0.0` (silent) to `1.0` (max). <br>• **Recommended**: `0.1` to `0.2` to keep the voiceover clear. <br>• **Default**: `0.15`. |


---

## 🗣️ Voice Selection

You can control the voice actor for each video independently.

### Priority Rules
The system determines which voice to use in this order of precedence:
1.  **`voice` field in JSON** (Specific voice key)
2.  **`language` field in JSON** (Maps to a default voice for that language)
3.  **`VIDEO_VOICE` in `.env`** (Global default for your environment)
4.  **System Default** (`en-US-JennyNeural`)


### Available Voices
Select a voice key from the tables below:

#### 🇮🇳 Indian Languages
| Language | Key | Gender | Description |
| :--- | :--- | :--- | :--- |
| **Tamil** | `ta-IN-PallaviNeural` | Female | Friendly, General (Default for Tamil) |
| **Tamil** | `ta-IN-ValluvarNeural` | Male | Authoritative |
| **Hindi** | `hi-IN-SwararaNeural` | Female | Professional (Default for Hindi) |
| **Hindi** | `hi-IN-MadhurNeural` | Male | Calm |
| **English (IN)** | `en-IN-PrabhatNeural` | Male | Clear Indian accent |

#### 🇺🇸🇬🇧 Global English
| Key | Gender | Description |
| :--- | :--- | :--- |
| **`en-US-JennyNeural`** | Female | Warm, conversational (Default) |
| **`en-US-GuyNeural`** | Male | Deep, authoritative |
| **`en-US-AriaNeural`** | Female | Versatile, News-style |
| **`en-US-ChristopherNeural`** | Male | Calm, Storytelling |
| **`en-GB-SoniaNeural`** | Female | British accent |
| **`en-GB-RyanNeural`** | Male | British accent |

#### 🇪🇦 Испанский / French / German
| Language | Key | Gender |
| :--- | :--- | :--- |
| **Spanish** | `es-ES-ElviraNeural` | Female |
| **Spanish** | `es-ES-AlvaroNeural` | Male |
| **French** | `fr-FR-DeniseNeural` | Female |
| **French** | `fr-FR-HenriNeural` | Male |
| **German** | `de-DE-KatjaNeural` | Female |
| **German** | `de-DE-ConradNeural` | Male |


---

## 📝 Script Writing Tips

To get the best results from the AI generator:

*   **Punctuation Matters**: Use periods (`.`) and commas (`,`) to control the pacing. The TTS engine pauses at punctuation.
*   **Scene Breaks**: The generator splits scenes based on sentences. Long run-on sentences might result in very long scenes with a single visual. Break complex thoughts into shorter sentences.
*   **Visual Keywords**: The system extracts keywords from your script to find stock footage. 
    *   *Bad*: "It is really cool." (Hard to visualize)
    *   *Good*: "The **blue ocean** waves crashed against the **sandy beach**." (Easy to visualize)
*   **Using [Visual: ...] Tags**: You can now manually specify the visual for any scene.
    *   **For Stock Footage**: Provide keywords like `[Visual: tech office blue]`.
    *   **For Local Assets**: Provide the filename of an image or video in `input/input-assests/` like `[Visual: logo.png]`.
    *   **Clean Subtitles**: Everything inside the square brackets is automatically removed from the on-screen text and voiceover.

---

## ❓ Troubleshooting

### Common Errors

**"Error: Script is too short"**
*   Ensure your `script` field has at least 10 characters of text.

**"JSON Parse Error"**
*   Ensure your `input-scripts.json` is valid JSON.
*   Don't use trailing commas after the last property.
*   Escape double quotes inside the script text (e.g., `"script": "She said \"Hello\" to him."`).

**Video Orientation is wrong**
*   Check if you have an environment variable `VIDEO_ORIENTATION` set in `.env` overriding your expectations, or ensure the JSON `orientation` field is spelled correctly (lowercase).

---

## 📂 Output

Generated videos are saved in the `output/` directory:

```
output/
  └── {id}/                 # Folder named after your ID
      ├── {Title}.mp4       # Final rendered video (named after title)
      ├── {Title} details.txt # Metadata (Title, Description, Hashtags)
      ├── thumbnail.jpg     # Generated thumbnail
      ├── script.txt        # Copy of the script
      └── scene-data.json   # Debug data about scenes/audio

## 📁 Local Assets
You can include your own media by placing it in:
`input/input-assests/`

Refer to the filename in your script: `[Visual: your-file.jpg]`. The system will automatically handle the layout and duration.
```
