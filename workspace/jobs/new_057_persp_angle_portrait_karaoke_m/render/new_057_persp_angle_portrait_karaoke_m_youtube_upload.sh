#!/usr/bin/env bash
# Zero-cost YouTube upload helper (YouTube Data API v3, free quota).
# 1) Create an OAuth client at https://console.cloud.google.com/ (free).
# 2) Obtain an access token and set YOUTUBE_ACCESS_TOKEN.
# 3) Run: bash new_057_persp_angle_portrait_karaoke_m_youtube_upload.sh
set -e
: "${YOUTUBE_ACCESS_TOKEN:?set YOUTUBE_ACCESS_TOKEN to your OAuth access token}"
VIDEO="C:\one\Automated-Video-Generator\workspace\jobs\new_057_persp_angle_portrait_karaoke_m\render\_seg_new_057_persp_angle_portrait_karaoke_m_0.mp4"
curl -s -X POST "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=resumable" \
  -H "Authorization: Bearer $YOUTUBE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"snippet":{"title":"New persp_angle portrait karaoke music","description":"Perspective scene one.

• Perspective scene two.

#Shorts #AI #facts","tags":["perspanglepng","perspangleportrait","wildperspanglepng","perspanglepngnature","perspanglepngcloseup","persptoppng","wildpersptoppng","persptoppngnature","ai","shorts","viral"]},"status":{"privacyStatus":"private"}}' \
  -D - -o /dev/null | grep -i "location" || echo "Upload session URL not returned; check token/expiry."
echo "Resumable upload session created. Stream the binary with: curl -X PUT <location> --data-binary @$VIDEO"
