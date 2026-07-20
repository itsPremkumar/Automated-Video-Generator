import ff from 'ffmpeg-static';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';

const img = os.tmpdir() + '/ct.png';
execFileSync(ff, ['-f', 'lavfi', '-i', 'color=c=blue:s=720x1280:d=0.1', '-frames:v', '1', '-y', img], { stdio: 'ignore' });

function renderAndProbe(label, vf, trimSec) {
  const out = os.tmpdir() + '/o_' + Math.random().toString(36).slice(2) + '.mp4';
  try {
    execFileSync(ff, ['-loop', '1', '-i', img, '-vf', vf, '-t', String(trimSec), '-y', out], { stdio: 'ignore' });
  } catch (e) {
    const se = e.stderr ? e.stderr.toString() : '';
    const line = se.split('\n').find((l) => /rror|invalid|No such|expected|trailing|unable/i.test(l)) || se.split('\n').slice(-3).join(' ');
    console.log(label + ': RENDER-ERR ' + line);
    return;
  }
  try {
    const info = execFileSync(ff, ['-i', out, '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8');
    const m = info.match(/Duration:\s*([\d:.]+)/);
    console.log(label + ': dur=' + (m ? m[1] : '?'));
  } catch (e) {
    console.log(label + ': rendered but probe-failed');
  }
}

// 4-second intended scene
renderAndProbe('A zoompan d=1         (want 4s)', 'scale=720:1280,trim=duration=4,setpts=PTS-STARTPTS,zoompan=z=min(zoom+0.0008,1.04):d=1:s=720x1280,format=yuv420p', 4);
renderAndProbe('B no zoompan          (want 4s)', 'scale=720:1280,trim=duration=4,setpts=PTS-STARTPTS,format=yuv420p', 4);
renderAndProbe('C min unescaped comma (want 4s)', "scale=720:1280,zoompan=z='min(zoom+0.0008,1.04)':d=1:s=720x1280,format=yuv420p", 4);
renderAndProbe('D min escaped comma   (want 4s)', "scale=720:1280,zoompan=z='min(zoom+0.0008\\,1.04)':d=1:s=720x1280,format=yuv420p", 4);
