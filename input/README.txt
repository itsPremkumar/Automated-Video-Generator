INPUT FORMAT & GUIDELINES
=========================

1. JSON FORMAT
--------------
Modiy 'input-scripts.json' to add your videos.

[
  {
    "id": "video_unique_id",
    "title": "Video Title",
    "script": "Your full script text here..."
  }
]

2. SCRIPT LENGTH GUIDE
----------------------
Estimate your video duration based on script word count:

- 1 Minute Video:  ~135-140 words
- 5 Minute Video:  ~700 words
- 10 Minute Video: ~1,400 words

(Based on standard TTS speaking rate of ~136 words/min)

3. MANUAL VISUAL CUES (DIRECTOR MODE) 🎨
---------------------------------------
You can specify exactly what video to find using [Visual: ...] tags.
The text inside the brackets is used for searching but NOT spoken.

Format: [Visual: Search Keywords] Spoken text.

Example:
"[Visual: Sad lonely girl] She felt alone."
-> System searches for "Sad lonely girl"
-> Voiceover reads "She felt alone."
