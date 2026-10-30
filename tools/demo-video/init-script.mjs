// In-page helpers injected into every page and frame of the recording: a fake microphone, full-screen zoom, and a visible cursor.
export const makeInit = (ZOOM, audible = false) => (`
(() => {
  const w = window;
  w.__audible = AUDIBLE;
  const md = navigator.mediaDevices;
  if (md) {
    const orig = md.getUserMedia.bind(md);
    md.getUserMedia = async (c) => {
      if (!c || !c.audio) return orig(c);
      if (!w.__mic) {
        const ctx = new AudioContext();
        const dest = ctx.createMediaStreamDestination();
        const osc = ctx.createOscillator(); const g = ctx.createGain(); g.gain.value = 0.00005; osc.connect(g); g.connect(dest); osc.start();
        w.__mic = { ctx, dest };
      }
      await w.__mic.ctx.resume();
      return w.__mic.dest.stream;
    };
    w.__say = async (b64) => {
      const { ctx, dest } = w.__mic; await ctx.resume();
      const bin = atob(b64); const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const buf = await ctx.decodeAudioData(bytes.buffer);
      const src = ctx.createBufferSource(); src.buffer = buf; src.connect(dest); if (w.__audible) src.connect(ctx.destination); src.start();
      return buf.duration;
    };
  }
  // Sneha's voice: every remote audio track of every call is recorded, so the video can carry real sound.
  const PC = w.RTCPeerConnection;
  if (PC && w.MediaRecorder) {
    w.RTCPeerConnection = new Proxy(PC, {
      construct(target, args) {
        const pc = new target(...args);
        pc.addEventListener('track', (ev) => {
          if (ev.track.kind !== 'audio') return;
          try {
            const rec = new MediaRecorder(new MediaStream([ev.track]), { mimeType: 'audio/webm;codecs=opus' });
            const chunks = [];
            rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
            rec.start(500);
            (w.__haaloRecs = w.__haaloRecs || []).push({ t0: Date.now(), rec, chunks });
          } catch (e) { /* recording is a bonus: never break the call */ }
        });
        return pc;
      },
    });
    w.__collectAudio = async () => {
      const out = [];
      for (const r of (w.__haaloRecs || [])) {
        if (r.rec.state !== 'inactive') await new Promise((res) => { r.rec.onstop = res; r.rec.stop(); });
        const buf = new Uint8Array(await new Blob(r.chunks, { type: 'audio/webm' }).arrayBuffer());
        let bin = '';
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        out.push({ t0: r.t0, b64: btoa(bin) });
      }
      w.__haaloRecs = [];
      return out;
    };
  }
  const css = document.createElement('style');
  css.textContent = '#__cur{position:fixed;left:0;top:0;width:30px;height:30px;margin:-4px 0 0 -4px;z-index:2147483647;pointer-events:none}' +
    '#__cur svg{filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}' +
    '.__rip{position:fixed;z-index:2147483646;pointer-events:none;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:3px solid #f3a712;animation:__rip .55s ease-out forwards}' +
    '@keyframes __rip{to{transform:scale(4.2);opacity:0}}';
  const mount = () => {
    if (!document.head || !document.body || document.getElementById('__cur')) return;
    // full-screen app pages are zoomed so text reads well on video; cards and the three-device stage keep their own sizes
    if (w === w.top && !location.pathname.startsWith('/__') && ZOOM !== 1) {
      const z = document.createElement('style');
      z.textContent = 'html{zoom:ZOOM}.h-dvh{height:calc(100dvh / ZOOM)!important}.min-h-dvh{min-height:calc(100dvh / ZOOM)!important}';
      document.head.appendChild(z);
    }
    document.head.appendChild(css);
    const c = document.createElement('div'); c.id = '__cur';
    c.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M3 2l7 18 2.6-7.4L20 10z" fill="#1b2246" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    c.style.transform = 'translate(' + (w.__cx ?? -50) + 'px,' + (w.__cy ?? -50) + 'px)';
    document.body.appendChild(c);
  };
  if (document.readyState !== 'loading') mount(); else document.addEventListener('DOMContentLoaded', mount);
  window.addEventListener('mousemove', (e) => { w.__cx = e.clientX; w.__cy = e.clientY; const c = document.getElementById('__cur'); if (c) c.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)'; }, true);
  window.addEventListener('mousedown', (e) => { if (!document.body) return; const r = document.createElement('div'); r.className = '__rip'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; document.body.appendChild(r); setTimeout(() => r.remove(), 700); }, true);
})();
`).replaceAll("ZOOM", String(ZOOM)).replaceAll("AUDIBLE", String(audible));

