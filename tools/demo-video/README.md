# Heartline demo video

One command per step. Everything on screen is the real product: real WebRTC calls to the real voice service, real database rows.
Only the parents' voices are synthesised (Edge TTS, dev only) and played into the page as if it were the microphone.

```bash
# 1. services (each in its own terminal)
cd services/voice && uv run haalo-voice                 # voice service :7860
cd apps/web && pnpm build && pnpm exec next start -p 3000
HAALO_DEMO_WORKSPACE_URL=http://localhost:3000 pnpm --filter @haalo/mobile exec expo export --platform web --output-dir ../../demo/mobile-web
node tools/demo-video/serve-mobile.mjs                  # mobile web build :8082

# 2. reset the demo family and synthesise the parents' lines
cd services/voice && uv run python ../../tools/demo-video/prep.py

# 3. record (all scenes, about 15 minutes), or a few: ONLY=morning,emergency
node tools/demo-video/record.mjs
```

Output: `demo/haalo-demo.mp4` (1920x1080) and `demo/timeline.json` (when each scene starts, for the voice-over).

Notes
- Groq's free tier allows 200k tokens a day per model; a full run uses most of one model's day. The service falls back to the second model on a 429.
- `stt_probe.py` shows how well Whisper hears a candidate line before you commit to it.
- Add your voice-over in Cap (https://cap.so, Studio mode), DaVinci Resolve, CapCut, or any editor.
