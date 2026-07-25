#!/usr/bin/env bash
# Zero-cost YouTube upload helper (YouTube Data API v3, free quota).
# 1) Create an OAuth client at https://console.cloud.google.com/ (free).
# 2) Obtain an access token and set YOUTUBE_ACCESS_TOKEN.
# 3) Run: bash combo_014_render_square_burned_mus_youtube_upload.sh
set -e
: "${YOUTUBE_ACCESS_TOKEN:?set YOUTUBE_ACCESS_TOKEN to your OAuth access token}"
VIDEO="C:\one\Automated-Video-Generator\workspace\jobs\combo_014_render_square_burned_mus\render\_seg_combo_014_render_square_burned_mus_0.mp4"
curl -s -X POST "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=resumable" \
  -H "Authorization: Bearer $YOUTUBE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"snippet":{"title":"Render square burned music","description":"First scene of the test.

• Second scene continues.

#Shorts #AI #facts","tags":["githubprofilepng","rendersquareburned","wildgithubprofilepng","githubprofilepngnature","githubprofilepngcloseup","logoautomationpng","wildlogoautomationpng","logoautomationpngnature","ai","shorts","viral"]},"status":{"privacyStatus":"private"}}' \
  -D - -o /dev/null | grep -i "location" || echo "Upload session URL not returned; check token/expiry."
echo "Resumable upload session created. Stream the binary with: curl -X PUT <location> --data-binary @$VIDEO"
