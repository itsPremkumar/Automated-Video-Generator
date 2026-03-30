# 🖼️ Local Asset Support Guide

This document explains how to use your own images and videos in the video generation pipeline.

## 📁 Where to Put Your Files
Place all your local images and videos in the following directory:
`input/input-assests/`

> [!NOTE]
> All files in this folder are ignored by Git (configured in the root `.gitignore`) so they won't bloat your repository.

## 📝 How to Use in Scripts
To use a local asset, include its **exact filename** inside a `[Visual: ...]` tag in your script.

### Examples:
- **Local Image**: `[Visual: my-photo.jpg] Hello, this is my photo.`
- **Local Video**: `[Visual: intro-clip.mp4] Welcome to the presentation.`

### 💡 Features
1.  **Automatic Removal**: The `[Visual: filename]` tag is automatically removed from the video's text overlay. Only your text will appear on screen.
2.  **Smart Detection**: The system automatically detects if the file is an image or a video.
3.  **Automatic Duration**: For local videos, the system detects the length of the video file and adjusts the scene duration to match.
4.  **Flexible Orientation**: Works in both Portrait and Landscape modes.

---

## 🔄 Smart Fallback (Backward Compatibility)
The system is designed to be intelligent. When it sees a `[Visual: ...]` tag:
1.  **Step 1**: It checks if a file with that name exists in `input/input-assests/`.
2.  **Step 2**: If the file **exists**, it uses your local asset.
3.  **Step 3**: If the file **does not exist**, it uses the text as keywords to search for high-quality stock videos/images (Pexels/Pixabay).

### Mixing Local & Stock Media:
You can mix both in a single script:
```json
{
  "script": "[Visual: my-product.jpg] This is our new product. [Visual: happy customers cheering] Look how much people love it!"
}
```
*Scene 1 will use your local image, Scene 2 will search for a stock video.*

---

## 🛡️ Global Default Video Fallback
The system supports a safety fallback to ensure your videos always have visuals, even if the script keywords return no results from the APIs.

### 📝 How to Configure
You can define a `defaultVideo` property inside your job config within `input-scripts.json`.

**Example:**
```json
{
  "title": "My Video",
  "defaultVideo": "fallback.mp4"
}
```

### ⚙️ How it Works
1.  **Hierarchy**: The system first tries the `[Visual: ...]` tag or searches Pexels/Pixabay for a match.
2.  **Fallback Trigger**: If no visual is found and no API results are returned, the system looks for the file specified in `defaultVideo` inside `input/input-assests/`.
3.  **Default Behavior**: If you do not provide a `defaultVideo` config, the system will automatically look for a file named `default.mp4` in your assets folder as a last resort.

## 🛠️ Supported File Types
- **Images**: `.jpg`, `.jpeg`, `.png`, `.webp`
- **Videos**: `.mp4`, `.mov`, `.webm`, `.m4v`
