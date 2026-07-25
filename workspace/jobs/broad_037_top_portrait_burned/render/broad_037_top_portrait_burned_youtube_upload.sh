#!/usr/bin/env bash
# Zero-cost YouTube upload helper (YouTube Data API v3, free quota).
# 1) Create an OAuth client at https://console.cloud.google.com/ (free).
# 2) Obtain an access token and set YOUTUBE_ACCESS_TOKEN.
# 3) Run: bash broad_037_top_portrait_burned_youtube_upload.sh
set -e
: "${YOUTUBE_ACCESS_TOKEN:?set YOUTUBE_ACCESS_TOKEN to your OAuth access token}"
VIDEO="C:\one\Automated-Video-Generator\workspace\jobs\broad_037_top_portrait_burned\render\_seg_broad_037_top_portrait_burned_0.mp4"
curl -s -X POST "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=resumable" \
  -H "Authorization: Bearer $YOUTUBE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"snippet":{"title":"Broad top portrait burned","description":"Scene one from top view.

• Scene two continues.

#Shorts #AI #facts","tags":["persptoppng","broadportraitburned","wildpersptoppng","persptoppngnature","persptoppngcloseup","perspaerialpng","wildperspaerialpng","perspaerialpngnature","ai","shorts","viral"]},"status":{"privacyStatus":"private"}}' \
  -D - -o /dev/null | grep -i "location" || echo "Upload session URL not returned; check token/expiry."
echo "Resumable upload session created. Stream the binary with: curl -X PUT <location> --data-binary @$VIDEO"
