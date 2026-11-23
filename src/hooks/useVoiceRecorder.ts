import { useCallback, useEffect, useRef, useState } from 'react';

export interface VoiceRecordingResult {
  dataUrl: string;
  mimeType: string;
  durationSec: number;
}

export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [levels, setLevels] = useState<number[]>([18, 28, 22, 34, 24, 30, 20, 26]);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    analyserRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const startRecording = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Enregistrement audio non pris en charge sur ce navigateur.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      // Live audio waveform visualization
      try {
        const ctx = new AudioContext();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 32;
        src.connect(analyser);
        analyserRef.current = analyser;
        const buf = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(buf);
          const next = Array.from({ length: 8 }, (_, idx) => {
            const val = buf[idx % buf.length] || 0;
            return Math.max(15, Math.min(100, Math.round((val / 255) * 100)));
          });
          setLevels(next);
          rafRef.current = window.requestAnimationFrame(tick);
        };
        rafRef.current = window.requestAnimationFrame(tick);
      } catch {
        // AudioContext optional
      }

      mediaRecorderRef.current = recorder;
      startTimeRef.current = Date.now();
      setDurationSec(0);
      setIsRecording(true);
      recorder.start();

      timerRef.current = window.setInterval(() => {
        setDurationSec(Math.round((Date.now() - startTimeRef.current) / 1000));
      }, 250);
    } catch {
      setError('Accès au microphone refusé ou indisponible.');
      cleanup();
    }
  }, [cleanup]);

  const stopRecording = useCallback((): Promise<VoiceRecordingResult | null> => {
    return new Promise((resolve) => {
      const rec = mediaRecorderRef.current;
      if (!rec || rec.state === 'inactive') {
        setIsRecording(false);
        cleanup();
        resolve(null);
        return;
      }
      const elapsed = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          setIsRecording(false);
          cleanup();
          resolve({
            dataUrl: String(reader.result || ''),
            mimeType: blob.type || 'audio/webm',
            durationSec: elapsed,
          });
        };
        reader.readAsDataURL(blob);
      };
      rec.stop();
    });
  }, [cleanup]);

  return {
    isRecording,
    durationSec,
    levels,
    error,
    startRecording,
    stopRecording,
  };
}
