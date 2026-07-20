import ff from 'ffmpeg-static';
import fp from 'ffprobe-static';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';

const img = os.tmpdir() + '/ct.png';
execFileSync(ff, ['-f', 'lavfi', '-i', 'color=c=blue:s=720x1280:d=0.1', '-frames:v', '1', '-y', img], { stdio: 'ignore' });

function probeDurAndFrames(out) {
  const raw = execFileSync(fp.path, ['-v', 'error', '-show_entries', 'format=duration:stream=nb_frames', '-of', 'default=noprint_wrappers=1', out], { stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8');
  const d = (raw.match(/duration=([\d.]+)/) || [])[1];
  const f = (raw.match(/nb_frames=(\d+)/) || [])[1];
  return `dur=${d}s frames=${f}`;
}

function render(label, vf, trimSec) {
  const out = os.tmpdir() + '/o_' + Math.random().toString(36).slice(2) + '.mp4';
  try {
    execFileSync(ff, ['-loop', '1', '-i', img, '-vf', vf, '-t', String(trimSec), '-y', out], { stdio: 'ignore' });
  } catch (e) {
    const se = e.stderr ? e.stderr.toString() : '';
    const line = se.split('\n').find((l) => /rror|invalid|No such|expected|trailing|unable|not.*option/i.test(l)) || se.split('\n').slice(-3).join(' ');
    console.log(label + ': RENDER-ERR ' + line);
    return;
  }
  console.log(label + ': ' + probeDurAndFrames(out));
}

render('A zoompan d=1          (want 4s/100f)', 'scale=720:1280,trim=duration=4,setpts=PTS-STARTPTS,zoompan=z=min(zoom+0.0008,1.04):d=1:s=720x1280,format=yuv420p', 4);
render('B no zoompan           (want 4s/100f)', 'scale=720:1280,trim=duration=4,setpts=PTS-STARTPTS,format=yuv420p', 4);
render("C min unescaped comma  (want 4s/100f)", "scale=720:1280,zoompan=z='min(zoom+0.0008,1.04)':d=1:s=720x1280,format=yuv420p", 4);
render("D min escaped comma    (want 4s/100f)", "scale=720:1280,zoompan=z='min(zoom+0.0008\\,1.04)':d=1:s=720x1280,format=yuv420p", 4);
