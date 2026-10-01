const { chromium } = require('playwright');
const { spawn } = require('child_process');
(async () => {
  const FPS = 30;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  await p.goto('file://' + process.cwd() + '/video.html'); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500);
  const TOTAL = await p.evaluate(() => window.__TOTAL);
  const frames = Math.round((TOTAL + 1.5) * FPS);
  const ff = spawn('ffmpeg', ['-y','-loglevel','error','-f','image2pipe','-framerate',String(FPS),'-c:v','mjpeg','-i','-',
    '-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=44100',
    '-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p','-profile:v','high','-r',String(FPS),
    '-c:a','aac','-b:a','128k','-shortest','-movflags','+faststart','demo-hafsah-tiktok.mp4'], { stdio: ['pipe','inherit','inherit'] });
  for (let i = 0; i < frames; i++) {
    const t = Math.min(TOTAL, i / FPS);
    await p.evaluate(v => window.__render(v), t);
    const buf = await p.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 300 === 0) console.log('frame', i, '/', frames);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await b.close(); console.log('done');
})();
