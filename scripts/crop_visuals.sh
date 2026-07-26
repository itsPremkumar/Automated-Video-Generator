#!/bin/bash
cd /c/one/Automated-Video-Generator
FF="./node_modules/ffmpeg-static/ffmpeg.exe"
for f in sproutern-hero sproutern-tools sproutern-interviews sproutern-about avs-github; do
  src="input/visuals/$f.png"
  DIM=$("$FF" -i "$src" 2>&1 | grep -oE '[0-9]+x[0-9]+' | head -1)
  W=$(echo "$DIM" | cut -dx -f1)
  H=$(echo "$DIM" | cut -dx -f2)
  CH=$(( W * 16 / 9 ))
  if [ "$CH" -gt "$H" ]; then CH=$H; fi
  "$FF" -y -i "$src" -vf "crop=${W}:${CH}:0:0" "input/visuals/_c_$f.png" >/dev/null 2>&1
  mv -f "input/visuals/_c_$f.png" "$src"
  echo "$f -> ${W}x${H} cropped to ${W}x${CH}"
done
echo "ALL DONE"
