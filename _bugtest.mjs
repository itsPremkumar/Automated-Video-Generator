import ff from 'ffmpeg-static';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';

const img = os.tmpdir() + '/ct.png';
execFileSync(ff, ['-f', 'lavfi', '-i', 'color=c=blue:s=720x1280:d=0.1', '-frames:v', '1', '-y', img], { stdio: 'ignore' });

function renderDur(vf) {
  const out = os.tmpdir() + '/o_' + Math.random().toString(36).slice(2) + '.mp4';
  try {
    execFileSync(ff, ['-loop', '1', '-i', img, '-vf', vf, '-t', '4', '-y', out], { stdio: 'ignore' });
  } catch (e) {
    return 'RENDER-ERR: ' + (e.stderr?.toString() || e.message).split('\n').slice(-2).join(' ');
  }
  const info = execFileSync(ff, ['-i', out], { stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8');
  const m = info.match(/Duration:\s*([\d:.]+)/);
  return m ? m[1] : 'NO-DUR';
}

// Actual main-path zoompan (from orchestrate.ts line 1240), image scene 4s
console.log('A) zoompan d=1 (image, 4s):', renderDur('scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25,trim=duration=4,setpts=PTS-STARTPTS,settb=1/25,zoompan=z=min(zoom+0.0008,1.04):d=1:s=720x1280,format=yuv420p[vx]'));

// No zoompan control
console.log('B) no zoompan (image, 4s):', renderDur('scale=720:1280,trim=duration=4,setpts=PTS-STARTPTS,format=yuv420p'));

// min() with UNescaped comma (as code literally writes)
console.log('C) min(, ) unescaped:', renderDur("scale=720:1280,format=yuv420p,zoompan=z='min(zoom+0.0008,1.04)':d=1:s=720x1280"));

// min() with escaped comma
console.log('D) min(\, ) escaped:', renderDur("scale=720:1280,format=yuv420p,zoompan=z='min(zoom+0.0008\\,1.04)':d=1:s=720x1280"));
