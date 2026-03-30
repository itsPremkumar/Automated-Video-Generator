# ⚡ Quickstart Guide for Automated Video Generator

[Automated Video Generator](https://github.com/itsPremkumar/Automated-Video-Generator) is designed for speed. Get your first automated text-to-video rendered in under 5 minutes.

## 1. Install Dependencies

```bash
# 1. Install Node dependencies
npm install

# 2. Install Python voice dependencies
pip install -r requirements.txt
```

## 2. Set Up Environment

Create a `.env` file and add your Pexels API key:

```env
PEXELS_API_KEY=your_key_here
```

## 3. Create a Script

Open `input/input-scripts.json` and add:

```json
[
  {
    "id": "quickstart_video",
    "title": "Quickstart Demo",
    "script": "Welcome to the quickstart video. This is a fast way to test the system."
  }
]
```

## 4. Generate Video

```bash
npm run generate
```

## 5. View Result

Find your video at: `output/quickstart_video/out.mp4`
