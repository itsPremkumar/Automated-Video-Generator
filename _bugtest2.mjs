import ff from 'ffmpeg-static';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';

const img = os.tmpdir() + '/ct.png';
execFileSync(ff, ['-f', 'lavfi', '-i', 'color=c=blue:s=720x1280:d=0.1', '-frames:v', '1', '-y', img], { stdio: 'ignore' });

function rt(label, vf) {
  const out = os.tmpdir() + '/o_' + Math.random().toString(36).slice(2) + '.mp4';
  try {
    execFileSync(ff, ['-loop', '1', '-i', img, '-vf', vf, '-t', '4', '-y', out], { stdio: 'ignore' });
    // measure real duration
    const info = execFileSync(ff, ['-i', out], { stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8');
    const m = info.match(/Duration:\s*([\d:.]+)/);
    console.log(label + ':', m ? ('OK dur=' + m[1]) : 'OK no-dur');
  } catch (e) {
    const se = e.stderr ? e.stderr.toString() : '';
    const line = se.split('\n').find((l) => /rror|invalid|No such|expected|trailing/i.test(l)) || se.split('\n').slice(-3).join(' ');
    console.log(label + ': ERR ' + line);
  }
}

rt('A zoompan d=1        ', 'scale=720:1280,trim=duration=4,setpts=PTS-STARTPTS,zoompan=z=min(zoom+0.0008,1.04):d=1:s=720x1280,format=yuv420p');
rt('B no zoom           ', 'scale=720:1280,trim=duration=4,setpts=PTS-STARTPTS,format=yuv420p');
rt("C min unescaped comma", "scale=720:1280,zoompan=z='min(zoom+0.0008,1.04)':d=1:s=720x1280,format=yuv420p");
rt("D min escaped comma ", "scale=720:1280,zoompan=z='min(zoom+0.0008\\,1.04)':d=1:s=720x1280,format=yuv420p");
