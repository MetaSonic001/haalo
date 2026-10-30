"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMotionValue } from "motion/react";

export type DemoState = "idle" | "connecting" | "live" | "ended" | "error";

const VOICE_URL = process.env.NEXT_PUBLIC_VOICE_DEMO_URL ?? "http://localhost:7860";

function waitForIce(pc: RTCPeerConnection, ms = 2500): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => pc.iceGatheringState === "complete" && done();
    pc.addEventListener("icegatheringstatechange", check);
    setTimeout(done, ms);
  });
}

function rms(analyser: AnalyserNode, buf: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (const b of buf) sum += ((b - 128) / 128) ** 2;
  return Math.min(1, Math.sqrt(sum / buf.length) * 3.2);
}

/**
 * Browser voice demo over WebRTC to the voice service (SmallWebRTC). Exposes a live audio level (0..1)
 * from both the mic and the agent's audio so the orb's rings react to real speech.
 */
export function useVoiceDemo() {
  const [state, setState] = useState<DemoState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [speaker, setSpeaker] = useState<"none" | "you" | "haalo">("none");
  const [callId, setCallId] = useState<string | null>(null);
  const level = useMotionValue(0);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pcIdRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (pcIdRef.current) {
      // tell the server the caller hung up, so it finishes the call now instead of waiting for the connection to time out
      void fetch(`${VOICE_URL}/webrtc/end`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pc_id: pcIdRef.current }), keepalive: true }).catch(() => undefined);
      pcIdRef.current = null;
    }
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    level.set(0);
    setSpeaker("none");
    setState((s) => (s === "live" || s === "connecting" ? "ended" : s));
  }, [level]);

  useEffect(() => stop, [stop]);

  const start = useCallback(
    async (opts: { language: string; turnstileToken?: string; maxSeconds?: number; mode?: "checkin" | "reminder" | "inbound"; parentId?: string }) => {
      setError(null);
      setCallId(null);
      setState("connecting");
      try {
        const mic = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        streamRef.current = mic;
        const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        pcRef.current = pc;
        mic.getTracks().forEach((t) => pc.addTrack(t, mic));

        const ctx = new AudioContext();
        ctxRef.current = ctx;
        const micAn = ctx.createAnalyser();
        micAn.fftSize = 512;
        ctx.createMediaStreamSource(mic).connect(micAn);
        const remoteAn = ctx.createAnalyser();
        remoteAn.fftSize = 512;
        const micBuf = new Uint8Array(new ArrayBuffer(micAn.fftSize));
        const remBuf = new Uint8Array(new ArrayBuffer(remoteAn.fftSize));
        let remoteConnected = false;

        pc.ontrack = (ev) => {
          const [stream] = ev.streams;
          if (!audioRef.current) {
            audioRef.current = new Audio();
            audioRef.current.autoplay = true;
          }
          audioRef.current.srcObject = stream;
          if (!remoteConnected) {
            ctx.createMediaStreamSource(stream).connect(remoteAn);
            remoteConnected = true;
          }
        };
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "connected") setState("live");
          if (["failed", "closed", "disconnected"].includes(pc.connectionState)) stop();
        };

        const tick = () => {
          const m = rms(micAn, micBuf);
          const r = remoteConnected ? rms(remoteAn, remBuf) : 0;
          level.set(Math.max(m * 0.85, r));
          setSpeaker(r > 0.06 ? "haalo" : m > 0.08 ? "you" : "none");
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();

        await pc.setLocalDescription(await pc.createOffer());
        await waitForIce(pc);
        const res = await fetch(`${VOICE_URL}/webrtc/offer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sdp: pc.localDescription?.sdp,
            type: pc.localDescription?.type,
            language: opts.language,
            turnstile_token: opts.turnstileToken,
            mode: opts.mode ?? "checkin",
            dev_parent_id: opts.parentId,
          }),
        });
        if (!res.ok) {
          const detail = await res.json().catch(() => ({}));
          throw new Error(detail.detail ?? `The voice service said ${res.status}`);
        }
        const answer = await res.json();
        setCallId(answer.call_id ?? null);
        pcIdRef.current = answer.pc_id ?? null;
        await pc.setRemoteDescription({ type: answer.type, sdp: answer.sdp });
        timerRef.current = setTimeout(stop, (opts.maxSeconds ?? 180) * 1000 + 3000);
      } catch (e) {
        stop();
        const msg = e instanceof Error ? e.message : "Something went wrong";
        setError(
          /Permission|NotAllowed/i.test(msg)
            ? "Sneha needs your microphone to hear you. Allow it in the browser and try again."
            : /Failed to fetch|NetworkError/i.test(msg)
              ? "We couldn't reach the voice service. Check that it is running and NEXT_PUBLIC_VOICE_DEMO_URL is right."
              : msg,
        );
        setState("error");
      }
    },
    [level, stop],
  );

  return { state, error, speaker, level, callId, start, stop };
}
