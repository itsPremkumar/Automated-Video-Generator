# 🛠️ Setup Guide

Detailed instructions for setting up the development environment.

## System Requirements

-   **OS:** Windows, macOS, or Linux
-   **Node.js:** v18.0.0 or higher
-   **Python:** v3.8.0 or higher (required for AI voice generation)
-   **RAM:** 8GB minimum (16GB recommended for rendering)
-   **Disk Space:** 1GB+ for project and dependencies

## Step-by-Step Installation

### 1. Install Node.js
Download and install from [nodejs.org](https://nodejs.org/).

Verify installation:
```bash
node -v
npm -v
```

### 2. Install FFmpeg
FFmpeg is required for Remotion to render videos.

-   **Windows:**
    1.  Download from [ffmpeg.org/download.html](https://ffmpeg.org/download.html).
    2.  Extract the zip file.
    3.  Add the `bin` folder to your System PATH environment variable.
    4.  Restart your terminal.

-   **macOS (Homebrew):**
    ```bash
    brew install ffmpeg
    ```

-   **Linux:**
    ```bash
    sudo apt update
    sudo apt install ffmpeg
    ```

Verify installation:
```bash
ffmpeg -version
```

### 3. Clone and Install
```bash
git clone <repo_url>
cd automated-video-generator
npm install
```

### 4. Install AI Voice Dependencies
```bash
pip install -r requirements.txt
```
*(This ensures `edge-tts` and related Python libraries are available)*

### 5. API Keys
1.  Go to [Pexels API](https://www.pexels.com/api/) and sign up.
2.  Generate a new API key.
3.  Create `.env` file in the project root.
4.  Paste the key: `PEXELS_API_KEY=your_key_here`

## Verification

Run the test command to verify everything is working:

```bash
npm run test
```
*(Note: Ensure you have `test` script defined or try running a simple generation)*
