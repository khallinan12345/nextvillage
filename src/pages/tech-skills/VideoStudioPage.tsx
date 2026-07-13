// src/pages/VideoStudioPage.tsx
// AI Video Studio — timeline editor for combining clips, audio, voiceover, text overlays.
// Export via ffmpeg.wasm (requires COOP/COEP headers in vercel.json — see bottom of file).

import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import { PidginTooltip } from '../../components/PidginTooltip';
import classNames from 'classnames';
import {
  Film, Music, Mic, Type, Play, Pause, SkipBack,
  Plus, Trash2, Download, Upload, GripHorizontal,
  ChevronLeft, ChevronRight, Volume2, VolumeX,
  Square, Circle, AlignLeft, Scissors, Save,
  Layers, X, Check, AlertTriangle, FileText,
  ChevronDown, ChevronUp, FolderOpen, Clock,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VideoClip {
  id: string;
  name: string;
  src: string;          // object URL or remote URL
  nativeDuration: number; // full clip length in seconds
  trimStart: number;    // seconds from clip start
  trimEnd: number;      // seconds from clip start (≤ nativeDuration)
  timelineStart: number; // position on timeline in seconds
}

interface AudioClip {
  id: string;
  name: string;
  src: string;
  duration: number;
  loop: boolean;
  volume: number;       // 0–1
  timelineStart: number;
}

interface VoiceSegment {
  id: string;
  src: string;
  duration: number;
  baseDuration?: number;
  playbackRate?: number;
  timelineStart: number;
  name: string;
}

interface TextOverlay {
  id: string;
  text: string;
  timelineStart: number;
  duration: number;
  x: number;           // % of preview width
  y: number;           // % of preview height
  fontSize: number;
  color: string;
  bold: boolean;
}

interface LibraryVideo {
  id: string;
  name: string;
  url: string;
  thumbnail?: string;
}

interface ProjectSnapshot {
  id: string;
  name: string;
  thumbnailUrl: string | null;
  savedAt: string;
  projectData: {
    clips: VideoClip[];
    audioTrack: AudioClip | null;
    voiceSegs: VoiceSegment[];
    overlays: TextOverlay[];
    videoName: string;
  };
}

const COLORS = ['#ffffff','#facc15','#34d399','#60a5fa','#f87171','#c084fc','#fb923c'];

// ─── Utility ──────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 9);

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

const getVideoDuration = (src: string): Promise<number> =>
  new Promise(resolve => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => resolve(v.duration);
    v.onerror = () => resolve(5);
    v.src = src;
  });

// ─── Main Component ───────────────────────────────────────────────────────────

const VideoStudioPage: React.FC = () => {
  const { user } = useAuth();

  // ── Media library ──────────────────────────────────────────────────────────
  const [library,      setLibrary]      = useState<LibraryVideo[]>([]);
  const [loadingLib,   setLoadingLib]   = useState(true);
  const [audioLibrary, setAudioLibrary] = useState<{id:string;name:string;url:string}[]>([]);
  const [loadingAudioLib, setLoadingAudioLib] = useState(true);
  const [activeTab,    setActiveTab]    = useState<'video'|'audio'|'voice'|'text'>('video');

  // ── Timeline state ─────────────────────────────────────────────────────────
  const [clips,        setClips]        = useState<VideoClip[]>([]);
  const [audioTrack,   setAudioTrack]   = useState<AudioClip | null>(null);
  const [voiceSegs,    setVoiceSegs]    = useState<VoiceSegment[]>([]);
  const [overlays,     setOverlays]     = useState<TextOverlay[]>([]);

  // ── Playback ───────────────────────────────────────────────────────────────
  const [isPlaying,    setIsPlaying]    = useState(false);
  const [playhead,     setPlayhead]     = useState(0);
  const [muted,        setMuted]        = useState(false);
  const rafRef         = useRef<number>(0);
  const lastTimeRef    = useRef<number>(0);
  const videoRef       = useRef<HTMLVideoElement>(null);
  const audioRef       = useRef<HTMLAudioElement>(null);

  // ── Selection / editing ────────────────────────────────────────────────────
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const [selectedOverlay, setSelectedOverlay] = useState<string | null>(null);

  // ── Text overlay editor ────────────────────────────────────────────────────
  const [newOverlayText, setNewOverlayText] = useState('');

  // ── Recording ─────────────────────────────────────────────────────────────
  const [isRecording,  setIsRecording]  = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecRef    = useRef<MediaRecorder | null>(null);
  const recChunks      = useRef<Blob[]>([]);
  const recTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Export ─────────────────────────────────────────────────────────────────
  // ── Canvas renderer ────────────────────────────────────────────────────────
  const [isRendering,    setIsRendering]    = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);   // 0–1
  const [renderMsg,      setRenderMsg]      = useState('');
  const [renderedUrl,    setRenderedUrl]    = useState<string | null>(null);
  const [renderedName,   setRenderedName]   = useState<string>('');
  const renderCancelRef  = useRef(false);
  const renderCanvasRef  = useRef<HTMLCanvasElement>(null); // VISIBLE canvas for rendering

  // ── Drag state ─────────────────────────────────────────────────────────────
  const [draggingClip, setDraggingClip] = useState<string | null>(null);
  const timelineRef    = useRef<HTMLDivElement>(null);

  // ── Timeline collapse ──────────────────────────────────────────────────────
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);

  // ── Project name + save ────────────────────────────────────────────────────
  const [videoName,      setVideoName]      = useState('My Project');
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [saveProjectMsg,  setSaveProjectMsg]  = useState('');
  const [savedProjects,   setSavedProjects]   = useState<ProjectSnapshot[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  // ── View mode (edit | history) ─────────────────────────────────────────────
  const [studioView, setStudioView] = useState<'edit' | 'history'>('edit');

  // ── Total duration ─────────────────────────────────────────────────────────
  const totalDuration = useMemo(() => {
    const clipEnd = clips.reduce((m, c) =>
      Math.max(m, c.timelineStart + (c.trimEnd - c.trimStart)), 0);
    const voiceEnd = voiceSegs.reduce((m, v) =>
      Math.max(m, v.timelineStart + v.duration), 0);
    return Math.max(clipEnd, voiceEnd, 10);
  }, [clips, voiceSegs]);

  // ── Active clip (at current playhead) ─────────────────────────────────────
  const activeClip = useMemo(() =>
    clips.find(c =>
      playhead >= c.timelineStart &&
      playhead < c.timelineStart + (c.trimEnd - c.trimStart)
    ), [clips, playhead]);

  // ── Active overlays ────────────────────────────────────────────────────────
  const activeOverlays = useMemo(() =>
    overlays.filter(o =>
      playhead >= o.timelineStart && playhead < o.timelineStart + o.duration
    ), [overlays, playhead]);

  // ── Load projects on mount ────────────────────────────────────────────────
  useEffect(() => { if (user?.id) loadProjects(); }, [user?.id]);

  // ── Load saved audio from voice_generations ─────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('voice_generations')
      .select('id, script, audio_url, saved_audio_url')
      .eq('user_id', user.id)
      .eq('status', 'succeeded')
      .not('audio_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        setAudioLibrary((data ?? [])
          .filter(d => d.saved_audio_url || d.audio_url)
          .map(d => ({
            id: d.id,
            name: (d.script ?? 'Voice clip').slice(0, 40),
            url: d.saved_audio_url ?? d.audio_url ?? '',
          })));
        setLoadingAudioLib(false);
      });
  }, [user?.id]);

  // ── Load library from Supabase ─────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('video_generations')
      .select('id, prompt, saved_video_url, video_url')
      .eq('user_id', user.id)
      .eq('status', 'succeeded')
      .not('saved_video_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        setLibrary((data ?? []).map(d => ({
          id: d.id,
          name: (d.prompt ?? 'Video').slice(0, 40),
          url: d.saved_video_url ?? d.video_url ?? '',
        })));
        setLoadingLib(false);
      });
  }, [user?.id]);

  // ── Playback loop ──────────────────────────────────────────────────────────
  const stopPlayback = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setIsPlaying(false);
    videoRef.current?.pause();
    audioRef.current?.pause();
  }, []);

  const tick = useCallback((ts: number) => {
    const delta = lastTimeRef.current ? (ts - lastTimeRef.current) / 1000 : 0;
    lastTimeRef.current = ts;
    setPlayhead(prev => {
      const next = prev + delta;
      if (next >= totalDuration) { stopPlayback(); return 0; }
      return next;
    });
    rafRef.current = requestAnimationFrame(tick);
  }, [totalDuration, stopPlayback]);

  const startPlayback = useCallback(() => {
    lastTimeRef.current = 0;
    setIsPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
    audioRef.current?.play().catch(() => {});
  }, [tick]);

  const togglePlay = () => isPlaying ? stopPlayback() : startPlayback();

  // ── Sync video element to playhead ─────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !activeClip) return;
    const clipPos = playhead - activeClip.timelineStart + activeClip.trimStart;
    if (Math.abs(v.currentTime - clipPos) > 0.25) v.currentTime = clipPos;
    if (isPlaying && v.paused) v.play().catch(() => {});
    if (!isPlaying && !v.paused) v.pause();
  }, [playhead, activeClip, isPlaying]);

  useEffect(() => {
    if (!activeClip && videoRef.current) videoRef.current.pause();
  }, [activeClip]);

  // ── Add clip from library ──────────────────────────────────────────────────
  const addClipFromLibrary = async (lib: LibraryVideo) => {
    const dur = await getVideoDuration(lib.url);
    const start = clips.reduce((m, c) =>
      Math.max(m, c.timelineStart + (c.trimEnd - c.trimStart)), 0);
    setClips(prev => [...prev, {
      id: uid(), name: lib.name, src: lib.url,
      nativeDuration: dur, trimStart: 0, trimEnd: dur,
      timelineStart: start,
    }]);
  };

  // ── Upload video from device ───────────────────────────────────────────────
  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const src = URL.createObjectURL(file);
    const dur = await getVideoDuration(src);
    const start = clips.reduce((m, c) =>
      Math.max(m, c.timelineStart + (c.trimEnd - c.trimStart)), 0);
    setClips(prev => [...prev, {
      id: uid(), name: file.name, src,
      nativeDuration: dur, trimStart: 0, trimEnd: dur,
      timelineStart: start,
    }]);
  };

  // ── Upload audio ───────────────────────────────────────────────────────────
  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const src = URL.createObjectURL(file);
    const dur = await new Promise<number>(resolve => {
      const a = new Audio(src);
      a.onloadedmetadata = () => resolve(a.duration);
      a.onerror = () => resolve(0);
    });
    setAudioTrack({ id: uid(), name: file.name, src, duration: dur, loop: false, volume: 0.8, timelineStart: 0 });
  };

  // ── Voiceover recording ────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      recChunks.current = [];
      rec.ondataavailable = e => recChunks.current.push(e.data);
      rec.onstop = async () => {
        const blob = new Blob(recChunks.current, { type: 'audio/webm' });
        const src = URL.createObjectURL(blob);
        const dur = await new Promise<number>(resolve => {
          const a = new Audio(src);
          a.onloadedmetadata = () => resolve(a.duration);
          a.onerror = () => resolve(recChunks.current.length * 0.1);
        });
        const tStart = voiceSegs.reduce((m, v) =>
          Math.max(m, v.timelineStart + v.duration), 0);
        setVoiceSegs(prev => [...prev, {
          id: uid(), src, duration: dur,
          timelineStart: tStart, name: `Voiceover ${prev.length + 1}`,
        }]);
        stream.getTracks().forEach(t => t.stop());
      };
      rec.start();
      mediaRecRef.current = rec;
      setIsRecording(true);
      setRecordingTime(0);
      recTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch {
      alert('Microphone access denied. Please allow microphone in browser settings.');
    }
  };

  const stopRecording = () => {
    mediaRecRef.current?.stop();
    setIsRecording(false);
    if (recTimerRef.current) clearInterval(recTimerRef.current);
  };

  // ── Delete clip ────────────────────────────────────────────────────────────
  const deleteClip = (id: string) => {
    setClips(prev => prev.filter(c => c.id !== id));
    if (selectedClip === id) setSelectedClip(null);
  };

  // ── Add text overlay ───────────────────────────────────────────────────────
  const addOverlay = () => {
    if (!newOverlayText.trim()) return;
    setOverlays(prev => [...prev, {
      id: uid(), text: newOverlayText.trim(),
      timelineStart: playhead, duration: 3,
      x: 50, y: 80, fontSize: 32, color: '#ffffff', bold: true,
    }]);
    setNewOverlayText('');
  };

  // ── Trim clip ──────────────────────────────────────────────────────────────
  const trimClipStart = (id: string, delta: number) => {
    setClips(prev => prev.map(c => c.id !== id ? c : {
      ...c,
      trimStart: Math.max(0, Math.min(c.trimStart + delta, c.trimEnd - 0.5)),
    }));
  };

  const trimClipEnd = (id: string, delta: number) => {
    setClips(prev => prev.map(c => c.id !== id ? c : {
      ...c,
      trimEnd: Math.max(c.trimStart + 0.5, Math.min(c.trimEnd + delta, c.nativeDuration)),
    }));
  };

  // ── Timeline click → seek ──────────────────────────────────────────────────
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    setPlayhead(Math.max(0, Math.min(ratio * totalDuration, totalDuration)));
  };

  // ── Drag clip on timeline ──────────────────────────────────────────────────
  const handleClipDragStart = (id: string) => setDraggingClip(id);

  const handleTimelineDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!draggingClip || !timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const newStart = Math.max(0, ratio * totalDuration);
    setClips(prev => prev.map(c => c.id !== draggingClip ? c : { ...c, timelineStart: newStart }));
    setDraggingClip(null);
  };

  // ── Split clip at playhead ─────────────────────────────────────────────────
  const splitClipAtPlayhead = () => {
    const clip = clips.find(c => {
      const end = c.timelineStart + (c.trimEnd - c.trimStart);
      return playhead > c.timelineStart + 0.1 && playhead < end - 0.1;
    });
    if (!clip) return;
    const splitPoint = playhead - clip.timelineStart + clip.trimStart;
    const leftClip: VideoClip = {
      ...clip, id: uid(),
      trimEnd: splitPoint,
    };
    const rightClip: VideoClip = {
      ...clip, id: uid(),
      trimStart: splitPoint,
      timelineStart: playhead,
    };
    setClips(prev => prev.map(c => c.id === clip.id ? leftClip : c).concat([rightClip]));
    setSelectedClip(rightClip.id);
  };

  // ── Delete selected clip section ───────────────────────────────────────────
  const deleteSelected = () => {
    if (!selectedClip) return;
    deleteClip(selectedClip);
  };

  // ── Canvas-based  // ── Canvas-based real-time renderer ──────────────────────────────────────
  // Renders all timeline tracks (video + audio + voice + text) into a single
  // .webm file using HTMLCanvasElement + MediaRecorder + Web Audio API.
  // No server required. Runs in real-time — a 60s timeline takes ~60s to render.

  // Helper: draw one frame at renderTime onto ctx
  const drawFrame = async (
    ctx: CanvasRenderingContext2D,
    W: number, H: number,
    renderTime: number,
    videoEls: Map<string, HTMLVideoElement>,
    frameInterval: number
  ) => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);

    const activeClip = clips.find(c =>
      renderTime >= c.timelineStart &&
      renderTime < c.timelineStart + (c.trimEnd - c.trimStart)
    );

    if (activeClip) {
      const videoEl = videoEls.get(activeClip.id);
      if (videoEl) {
        const clipPos = Math.min(
          renderTime - activeClip.timelineStart + activeClip.trimStart,
          activeClip.trimEnd - 0.001
        );
        if (Math.abs(videoEl.currentTime - clipPos) > frameInterval * 1.5) {
          videoEl.currentTime = clipPos;
          await new Promise<void>(res => {
            const t = setTimeout(res, 300);
            videoEl.addEventListener('seeked', () => { clearTimeout(t); res(); }, { once: true });
          });
        }
        try {
          const vw = videoEl.videoWidth || W;
          const vh = videoEl.videoHeight || H;
          const scale = Math.min(W / vw, H / vh);
          ctx.drawImage(videoEl, (W - vw * scale) / 2, (H - vh * scale) / 2, vw * scale, vh * scale);
        } catch {}
      }
    }

    // Text overlays
    overlays.filter(o =>
      renderTime >= o.timelineStart && renderTime < o.timelineStart + o.duration
    ).forEach(o => {
      ctx.save();
      ctx.font = `${o.bold ? 'bold ' : ''}${o.fontSize}px sans-serif`;
      ctx.fillStyle = o.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 8;
      ctx.fillText(o.text, (o.x / 100) * W, (o.y / 100) * H);
      ctx.restore();
    });
  };

  const handleRender = async () => {
    if (clips.length === 0) { alert('Add at least one video clip before rendering.'); return; }
    if (isRendering) return;

    setIsRendering(true);
    setRenderProgress(0);
    setRenderMsg('Loading media…');
    renderCancelRef.current = false;
    // Clear previous render preview
    setRenderedUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    setRenderedName('');

    const W = 1280;
    const H = 720;
    const FPS = 25;  // 25fps is more reliable for MediaRecorder
    const frameInterval = 1 / FPS;
    const safeName = videoName.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'project';

    const blobUrls: string[] = []; // declared outside try so finally can clean up

    // ── Minimal WebM/VP8 frame writer ──────────────────────────────────────────
    // Builds a valid WebM file from raw JPEG frames without MediaRecorder.
    // Each frame is encoded as a SimpleBlock inside a Cluster.
    // This bypasses captureStream() + MediaRecorder entirely.
    class WebMWriter {
      private chunks: Uint8Array[] = [];
      private frameCount = 0;
      private fps: number;
      private width: number;
      private height: number;

      constructor(fps: number, width: number, height: number) {
        this.fps = fps; this.width = width; this.height = height;
      }

      // EBML variable-length integer encoding
      private vint(n: number): Uint8Array {
        if (n < 0x7F) return new Uint8Array([n | 0x80]);
        if (n < 0x3FFF) return new Uint8Array([(n >> 8) | 0x40, n & 0xFF]);
        if (n < 0x1FFFFF) return new Uint8Array([(n >> 16) | 0x20, (n >> 8) & 0xFF, n & 0xFF]);
        const b = new Uint8Array(4);
        b[0] = (n >> 24) | 0x10; b[1] = (n >> 16) & 0xFF; b[2] = (n >> 8) & 0xFF; b[3] = n & 0xFF;
        return b;
      }

      private uint(n: number, bytes: number): Uint8Array {
        const b = new Uint8Array(bytes);
        for (let i = bytes - 1; i >= 0; i--) { b[i] = n & 0xFF; n >>= 8; }
        return b;
      }

      private concat(...arrays: Uint8Array[]): Uint8Array {
        const total = arrays.reduce((s, a) => s + a.length, 0);
        const out = new Uint8Array(total);
        let offset = 0;
        for (const a of arrays) { out.set(a, offset); offset += a.length; }
        return out;
      }

      private ebml(id: Uint8Array, data: Uint8Array): Uint8Array {
        return this.concat(id, this.vint(data.length), data);
      }

      addFrame(jpegData: Uint8Array) {
        const timestamp = Math.round((this.frameCount / this.fps) * 1000); // ms
        // SimpleBlock: track 1, timestamp (relative to cluster), keyframe flag, data
        const tsBytes = new Uint8Array([(timestamp >> 8) & 0xFF, timestamp & 0xFF]);
        const flags = new Uint8Array([0x80]); // keyframe
        const block = this.concat(this.vint(1), tsBytes, flags, jpegData);
        // SimpleBlock element (ID 0xA3)
        this.chunks.push(this.concat(new Uint8Array([0xA3]), this.vint(block.length), block));
        this.frameCount++;
      }

      build(): Blob {
        // EBML header
        const ebmlHeader = this.concat(
          new Uint8Array([0x1A, 0x45, 0xDF, 0xA3]), // EBML ID
          this.vint(31),
          new Uint8Array([
            0x42, 0x86, 0x81, 0x01, // EBMLVersion = 1
            0x42, 0xF7, 0x81, 0x01, // EBMLReadVersion = 1
            0x42, 0xF2, 0x81, 0x04, // EBMLMaxIDLength = 4
            0x42, 0xF3, 0x81, 0x08, // EBMLMaxSizeLength = 8
            0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6D, // DocType = "webm"
            0x42, 0x87, 0x81, 0x02, // DocTypeVersion = 2
            0x42, 0x85, 0x81, 0x02, // DocTypeReadVersion = 2
          ])
        );

        // TrackEntry for video (codec: V_MJPEG)
        const trackEntry = this.concat(
          new Uint8Array([0xAE]), this.vint(100), // TrackEntry
          new Uint8Array([0xD7, 0x81, 0x01]),     // TrackNumber = 1
          new Uint8Array([0x73, 0xC5, 0x88]),      // TrackUID (8 bytes)
          new Uint8Array([0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x01]),
          new Uint8Array([0x83, 0x81, 0x01]),      // TrackType = 1 (video)
          new Uint8Array([0x86, 0x88]),             // CodecID = "V_MJPEG"
          new Uint8Array([0x56,0x5F,0x4D,0x4A,0x50,0x45,0x47]),
          new Uint8Array([0x00]),                   // padding for length
          new Uint8Array([0xE0]), this.vint(14),   // Video element
          new Uint8Array([0xB0, 0x82]), this.uint(this.width, 2),
          new Uint8Array([0xBA, 0x82]), this.uint(this.height, 2),
          new Uint8Array([0x9A, 0x81, 0x00]),      // FlagInterlaced = 0
          new Uint8Array([0x23, 0x83, 0xE0, 0x84]), this.uint(this.fps * 1000000, 4),
        );

        const tracks = this.concat(new Uint8Array([0x16,0x54,0xAE,0x6B]), this.vint(trackEntry.length), trackEntry);

        // Segment Info
        const segInfo = this.concat(
          new Uint8Array([0x15,0x49,0xA9,0x66]), this.vint(35),
          new Uint8Array([0x2A,0xD7,0xB1,0x88]), this.uint(1000000, 8), // TimecodeScale = 1ms
          new Uint8Array([0x44,0x89,0x84]), this.uint(Math.round(this.frameCount / this.fps * 1000), 4),
          new Uint8Array([0x4D,0x80,0x84,0x77,0x65,0x62,0x6D]), // MuxingApp = "webm"
          new Uint8Array([0x57,0x41,0x84,0x77,0x65,0x62,0x6D]), // WritingApp = "webm"
        );

        // Cluster containing all frames
        const allBlocks = this.concat(...this.chunks);
        const cluster = this.concat(
          new Uint8Array([0x1F,0x43,0xB6,0x75]), this.vint(allBlocks.length + 8),
          new Uint8Array([0xE7, 0x81, 0x00]), // Timecode = 0
          new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00]), // padding
          allBlocks
        );

        const segContent = this.concat(segInfo, tracks, cluster);
        const segment = this.concat(
          new Uint8Array([0x18,0x53,0x80,0x67]),
          new Uint8Array([0x01,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF]), // unknown size
          segContent
        );

        return new Blob([ebmlHeader, segment], { type: 'video/webm' });
      }
    }

    try {
      // ── 1. Pre-load all video clips as local blob URLs ──────────────────────
      const videoEls: Map<string, HTMLVideoElement> = new Map();

      for (const clip of clips) {
        setRenderMsg(`Loading clip: ${clip.name}…`);
        let blobSrc = clip.src;
        try {
          const resp = await fetch(clip.src);
          if (resp.ok) {
            const blob = await resp.blob();
            blobSrc = URL.createObjectURL(blob);
            blobUrls.push(blobSrc);
          }
        } catch { /* use original src as fallback */ }

        const v = document.createElement('video');
        v.src = blobSrc;
        v.preload = 'auto';
        v.muted = true;
        v.playsInline = true;
        await new Promise<void>(res => {
          v.onloadeddata = () => res();
          v.onerror = () => { console.warn('[Renderer] clip load failed:', clip.name); res(); };
          v.load();
        });
        // Seek to trimStart to warm decoder
        if (clip.trimStart > 0) {
          v.currentTime = clip.trimStart;
          await new Promise<void>(res => {
            v.addEventListener('seeked', () => res(), { once: true });
            setTimeout(res, 500);
          });
        }
        videoEls.set(clip.id, v);
        console.log('[Renderer] loaded clip:', clip.name, 'duration:', v.duration, 'w:', v.videoWidth, 'h:', v.videoHeight);
      }

      // ── 2. Use the visible renderCanvasRef canvas ────────────────────────────
      // This canvas is rendered to screen (the preview panel).
      // A visible, user-interactable canvas is fully capturable by Chrome.
      if (!renderCanvasRef.current) throw new Error('Render canvas not ready');
      const canvas = renderCanvasRef.current;
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d')!;

      // ── 3. Web Audio ─────────────────────────────────────────────────────────
      const audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();

      if (audioTrack) {
        try {
          const buf = await (await fetch(audioTrack.src)).arrayBuffer();
          const decoded = await audioCtx.decodeAudioData(buf);
          const gain = audioCtx.createGain();
          gain.gain.value = audioTrack.volume;
          const src = audioCtx.createBufferSource();
          src.buffer = decoded;
          src.loop = audioTrack.loop;
          src.connect(gain);
          gain.connect(dest);
          src.start(0);
        } catch {}
      }

      for (const seg of voiceSegs) {
        try {
          const buf = await (await fetch(seg.src)).arrayBuffer();
          const decoded = await audioCtx.decodeAudioData(buf);
          const gain = audioCtx.createGain();
          gain.gain.value = 0.9;
          const src = audioCtx.createBufferSource();
          src.buffer = decoded;
          src.connect(gain);
          gain.connect(dest);
          src.start(audioCtx.currentTime + seg.timelineStart);
        } catch {}
      }

      // ── 4. VideoEncoder → VP8 frames → WebM container ────────────────────────
      // VideoEncoder (Chrome 94+) encodes canvas ImageBitmap frames to VP8.
      // We collect the raw encoded chunks then pack them into a WebM container.
      // No captureStream, no MediaRecorder, no external packages, no CORS issues.

      let frameCount = 0;
      let renderTime = 0;

      // @ts-ignore
      if (typeof VideoEncoder === 'undefined') {
        throw new Error('VideoEncoder API not available. Please use Chrome 94 or newer.');
      }

      // Collect encoded VP8 chunks
      const vp8Chunks: Array<{ data: Uint8Array; isKey: boolean; timestamp: number }> = [];

      // @ts-ignore
      const encoder = new VideoEncoder({
        output: (chunk: any) => {
          const data = new Uint8Array(chunk.byteLength);
          chunk.copyTo(data);
          vp8Chunks.push({ data, isKey: chunk.type === 'key', timestamp: chunk.timestamp });
        },
        error: (e: Error) => console.error('[VideoEncoder]', e),
      });

      // @ts-ignore
      encoder.configure({
        codec: 'vp8',
        width: W, height: H,
        bitrate: 5_000_000,
        framerate: FPS,
      });

      setRenderMsg('Encoding frames…');

      while (renderTime <= totalDuration && !renderCancelRef.current) {
        await drawFrame(ctx, W, H, renderTime, videoEls, frameInterval);

        // @ts-ignore
        const bitmap = await createImageBitmap(canvas);
        const tsUs = Math.round(renderTime * 1_000_000);
        const durUs = Math.round(frameInterval * 1_000_000);
        // @ts-ignore
        const vframe = new VideoFrame(bitmap, { timestamp: tsUs, duration: durUs });
        const isKey = frameCount % (FPS * 2) === 0;
        encoder.encode(vframe, { keyFrame: isKey });
        vframe.close();
        bitmap.close();

        frameCount++;
        renderTime += frameInterval;
        setRenderProgress(Math.min(renderTime / totalDuration, 0.9));
        if (frameCount % 10 === 0) {
          setRenderMsg(`Encoding ${fmt(renderTime)} / ${fmt(totalDuration)}… (${frameCount} frames)`);
          await new Promise(r => setTimeout(r, 0));
        }
      }

      if (renderCancelRef.current) {
        encoder.close(); audioCtx.close();
        setRenderMsg('Cancelled');
        await new Promise(r => setTimeout(r, 1000));
        return;
      }

      setRenderMsg('Flushing encoder…');
      await encoder.flush();
      encoder.close();
      audioCtx.close();

      setRenderProgress(0.95);
      setRenderMsg(`Muxing ${vp8Chunks.length} frames into WebM…`);
      await new Promise(r => setTimeout(r, 50));

      // ── Build a valid WebM container around the VP8 frames ───────────────────
      // WebM is EBML-based. We write: EBML header → Segment → Info → Tracks → Cluster(s)
      // Each frame goes into a SimpleBlock inside a Cluster.
      // timecodeScale = 1ms = 1,000,000 ns

      const TIMESCALE_MS = 1; // we use ms as our timecode unit

      // EBML encoding helpers
      const num2bytes = (n: number, byteLen: number) => {
        const b = new Uint8Array(byteLen);
        for (let i = byteLen - 1; i >= 0; i--) { b[i] = n & 0xFF; n >>>= 8; }
        return b;
      };
      const vint = (n: number): Uint8Array => {
        if (n < 0x7F)     return new Uint8Array([n | 0x80]);
        if (n < 0x3FFF)   return new Uint8Array([(n >> 8) | 0x40, n & 0xFF]);
        if (n < 0x1FFFFF) return new Uint8Array([(n >> 16) | 0x20, (n >> 8) & 0xFF, n & 0xFF]);
        return new Uint8Array([(n >> 24) | 0x10, (n >> 16) & 0xFF, (n >> 8) & 0xFF, n & 0xFF]);
      };
      const cat = (...arrs: Uint8Array[]) => {
        const out = new Uint8Array(arrs.reduce((s, a) => s + a.length, 0));
        let off = 0; for (const a of arrs) { out.set(a, off); off += a.length; }
        return out;
      };
      const el = (id: number[], data: Uint8Array) =>
        cat(new Uint8Array(id), vint(data.length), data);

      // EBML Header
      const ebmlHeader = cat(
        new Uint8Array([0x1A,0x45,0xDF,0xA3]), // EBML
        vint(31),
        new Uint8Array([
          0x42,0x86,0x81,0x01,                 // EBMLVersion=1
          0x42,0xF7,0x81,0x01,                 // EBMLReadVersion=1
          0x42,0xF2,0x81,0x04,                 // MaxIDLength=4
          0x42,0xF3,0x81,0x08,                 // MaxSizeLength=8
          0x42,0x82,0x84,0x77,0x65,0x62,0x6D, // DocType="webm"
          0x42,0x87,0x81,0x02,                 // DocTypeVersion=2
          0x42,0x85,0x81,0x02,                 // DocTypeReadVersion=2
        ])
      );

      // Segment Info
      const durationMs = Math.round(totalDuration * 1000);
      const segInfo = el([0x15,0x49,0xA9,0x66], cat(
        el([0x2A,0xD7,0xB1], num2bytes(1_000_000, 8)), // TimecodeScale=1ms in ns
        el([0x44,0x89], new Uint8Array([0x44,0xA8,                // Duration as float64
          ...Array.from(new Uint8Array(new Float64Array([durationMs]).buffer)).reverse()
        ])),
        el([0x4D,0x80], new TextEncoder().encode('Girls AIing')), // MuxingApp
        el([0x57,0x41], new TextEncoder().encode('Girls AIing')), // WritingApp
      ));

      // Track: VP8 video
      const codecId = new TextEncoder().encode('V_VP8');
      const trackEntry = el([0xAE], cat(
        el([0xD7], new Uint8Array([0x01])),              // TrackNumber=1
        el([0x73,0xC5], num2bytes(1, 8)),                // TrackUID=1
        el([0x83], new Uint8Array([0x01])),              // TrackType=1 (video)
        el([0x86], codecId),                             // CodecID="V_VP8"
        el([0xE0], cat(                                  // Video element
          el([0xB0], num2bytes(W, 2)),                   // PixelWidth
          el([0xBA], num2bytes(H, 2)),                   // PixelHeight
        )),
      ));
      const tracks = el([0x16,0x54,0xAE,0x6B], trackEntry);

      // Clusters: group frames into ~1s clusters
      const clusterDuration = 1000; // ms
      const clusters: Uint8Array[] = [];
      let clusterFrames: Uint8Array[] = [];
      let clusterTimestamp = 0;

      vp8Chunks.forEach((chunk, i) => {
        const frameTimestampMs = Math.round(chunk.timestamp / 1000); // us → ms
        if (clusterFrames.length === 0) clusterTimestamp = frameTimestampMs;

        // SimpleBlock: vint(tracknum) + int16(relative_timestamp) + flags + data
        const relTs = frameTimestampMs - clusterTimestamp;
        const flags = chunk.isKey ? 0x80 : 0x00;
        const simpleBlock = cat(
          new Uint8Array([0xA3]),                        // SimpleBlock ID
          vint(1 + 2 + 1 + chunk.data.length),          // size
          vint(1),                                       // track number
          new Uint8Array([(relTs >> 8) & 0xFF, relTs & 0xFF]), // relative timestamp (int16)
          new Uint8Array([flags]),                       // flags
          chunk.data,                                    // frame data
        );
        clusterFrames.push(simpleBlock);

        const nextTs = i + 1 < vp8Chunks.length
          ? Math.round(vp8Chunks[i+1].timestamp / 1000)
          : frameTimestampMs + 40;

        if (nextTs - clusterTimestamp >= clusterDuration || i === vp8Chunks.length - 1) {
          const clusterData = cat(
            el([0xE7], num2bytes(clusterTimestamp, 8)), // Timecode
            ...clusterFrames,
          );
          clusters.push(cat(
            new Uint8Array([0x1F,0x43,0xB6,0x75]),     // Cluster ID
            new Uint8Array([0x01,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF]), // unknown size
            clusterData,
          ));
          clusterFrames = [];
        }
      });

      const segmentContent = cat(segInfo, tracks, ...clusters);
      const segment = cat(
        new Uint8Array([0x18,0x53,0x80,0x67]),          // Segment ID
        new Uint8Array([0x01,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF]), // unknown size
        segmentContent,
      );

      const finalBlob = new Blob([ebmlHeader, segment], { type: 'video/webm' });
      console.log('[Renderer] WebM built. frames:', frameCount, 'size:', finalBlob.size, 'bytes');

      if (finalBlob.size < 10000) throw new Error('Output too small — encoding may have failed.');

      const url = URL.createObjectURL(finalBlob);
      const mb = (finalBlob.size / 1024 / 1024).toFixed(1);
      setRenderedUrl(url);
      setRenderedName(`${safeName}.webm`);
      setRenderMsg(`Done! ${frameCount} frames, ${mb} MB`);
      await new Promise(r => setTimeout(r, 2000));

    } catch (err: any) {
      console.error('[Renderer]', err);
      setRenderMsg('Render failed: ' + (err.message ?? 'unknown error'));
      await new Promise(r => setTimeout(r, 5000));
    } finally {
      blobUrls.forEach(u => URL.revokeObjectURL(u));
      setIsRendering(false);
      setRenderProgress(0);
      setRenderMsg('');
    }
  };

  // ── Save project to Supabase storage ──────────────────────────────────────
  const handleSaveProject = async () => {
    if (!user?.id) return;
    setIsSavingProject(true);
    setSaveProjectMsg('Saving…');
    try {
      // Store project as JSONB directly in the DB — no storage bucket needed.
      // This avoids MIME type restrictions and signed URL expiry entirely.
      const projectData = { clips, audioTrack, voiceSegs, overlays, videoName };
      const projectId = uid();

      const { error: dbError } = await supabase
        .from('video_studio_projects')
        .insert({
          id:           projectId,
          user_id:      user.id,
          name:         videoName.trim() || 'Untitled Project',
          project_data: projectData,
          created_at:   new Date().toISOString(),
        });

      if (dbError) throw new Error('DB save failed: ' + dbError.message);

      console.log('[Studio] Project saved to DB:', projectId);
      setSaveProjectMsg('Saved!');
      await loadProjects();
      await new Promise(r => setTimeout(r, 2000));
    } catch (err: any) {
      console.error('[Studio] Save failed:', err);
      setSaveProjectMsg('Error: ' + (err.message ?? 'Save failed'));
      await new Promise(r => setTimeout(r, 3000));
    } finally {
      setIsSavingProject(false);
      setSaveProjectMsg('');
    }
  };

  // ── Load saved projects ────────────────────────────────────────────────────
  const loadProjects = async () => {
    if (!user?.id) return;
    setLoadingProjects(true);
    try {
      const { data, error } = await supabase
        .from('video_studio_projects')
        .select('id, name, thumbnail_url, created_at, project_data')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) console.warn('[Studio] loadProjects error:', error.message);
      if (data) {
        setSavedProjects(data.map((d: any) => ({
          id:           d.id,
          name:         d.name,
          thumbnailUrl: d.thumbnail_url ?? null,
          savedAt:      d.created_at,
          projectData:  d.project_data ?? null,
        })) as any);
      }
    } catch (e) { console.error('[Studio] loadProjects exception:', e); }
    setLoadingProjects(false);
  };

  // ── Load a saved project ───────────────────────────────────────────────────
  const handleLoadProject = (project: any) => {
    try {
      // project_data is already in memory from loadProjects — no fetch needed
      const data = project.projectData;
      if (!data) throw new Error('Project data not found — try saving the project again');
      setClips(data.clips ?? []);
      setAudioTrack(data.audioTrack ?? null);
      setVoiceSegs(data.voiceSegs ?? []);
      setOverlays(data.overlays ?? []);
      setVideoName(data.videoName ?? project.name);
      setPlayhead(0);
      stopPlayback();
      setStudioView('edit');
    } catch (err: any) {
      alert('Could not load project: ' + err.message);
    }
  };

  // ── Timeline scale ─────────────────────────────────────────────────────────
  const PX_PER_SEC = 60; // pixels per second of timeline
  const timelineWidth = totalDuration * PX_PER_SEC;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');

        .studio-root { font-family: 'Space Grotesk', sans-serif; }
        .mono { font-family: 'DM Mono', monospace; }

        .track-clip {
          cursor: grab;
          user-select: none;
          transition: box-shadow 0.15s;
        }
        .track-clip:active { cursor: grabbing; }
        .track-clip:hover { box-shadow: 0 0 0 2px #60a5fa; }

        .playhead-line {
          position: absolute;
          top: 0; bottom: 0;
          width: 2px;
          background: #f97316;
          pointer-events: none;
          z-index: 10;
        }
        .playhead-line::before {
          content: '';
          position: absolute;
          top: -6px; left: -5px;
          border: 6px solid transparent;
          border-top-color: #f97316;
        }

        .timeline-ruler-tick {
          position: absolute;
          top: 0; bottom: 0;
          border-left: 1px solid rgba(255,255,255,0.08);
        }

        .trim-handle {
          position: absolute;
          top: 0; bottom: 0; width: 8px;
          background: rgba(255,255,255,0.3);
          cursor: ew-resize;
          border-radius: 2px;
          transition: background 0.15s;
        }
        .trim-handle:hover { background: rgba(255,255,255,0.7); }
        .trim-handle-left  { left: 0; border-radius: 4px 0 0 4px; }
        .trim-handle-right { right: 0; border-radius: 0 4px 4px 0; }

        .lib-item {
          transition: all 0.15s;
        }
        .lib-item:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        }

        @keyframes rec-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .rec-pulse { animation: rec-pulse 1s ease-in-out infinite; }
      `}</style>

      <div className="studio-root fixed top-14 left-0 md:left-64 right-0 bottom-0 flex flex-col bg-slate-950 overflow-hidden">

        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3 bg-slate-900 border-b border-slate-700/60 shrink-0 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500 to-pink-600">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-lg leading-tight">AI Video Studio</h1>
              <p className="text-slate-400 text-xs">Arrange · Split · Record · Export</p>
              <div className="mt-1">
                <PidginTooltip
                  originalText="Arrange · Split · Record · Export"
                  hintText="Tap here to translate this page subtitle into Nigerian Pidgin."
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View toggle */}
            <div className="flex bg-slate-800 rounded-lg p-0.5 border border-slate-700">
              {(['edit', 'history'] as const).map(v => (
                <button key={v} onClick={() => { setStudioView(v); if (v === 'history') loadProjects(); }}
                  className={classNames('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors', studioView === v ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-slate-200')}>
                  {v === 'edit' ? <><Film size={12} /> Edit</> : <><Clock size={12} /> Projects</>}
                </button>
              ))}
            </div>
            {/* Project name */}
            <input
              type="text" value={videoName} onChange={e => setVideoName(e.target.value)}
              className="bg-slate-800 border border-slate-600 text-slate-200 text-xs rounded-lg px-3 py-1.5 w-36 focus:outline-none focus:border-orange-400 placeholder-slate-500"
              placeholder="Project name…"
            />
            {/* Timecode */}
            <span className="mono text-xs text-slate-400 bg-slate-800 px-3 py-1.5 rounded-lg shrink-0">
              {fmt(playhead)} / {fmt(totalDuration)}
            </span>
            {/* Save project */}
            <button onClick={handleSaveProject} disabled={clips.length === 0 || isSavingProject}
              className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors shrink-0">
              {isSavingProject
                ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {saveProjectMsg}</>
                : <><Save size={13} /> Save</>}
            </button>
            {/* Render & Export */}
            <button
              onClick={isRendering ? () => { renderCancelRef.current = true; } : handleRender}
              disabled={clips.length === 0}
              title="Render all tracks into one merged video file"
              className={classNames(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors shrink-0',
                isRendering
                  ? 'bg-red-700 hover:bg-red-600 text-white'
                  : 'bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white'
              )}>
              {isRendering
                ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Cancel</>
                : <><Film size={13} /> Process Video</>}
            </button>
            {/* Tutorial link */}
            <a
              href="https://youtu.be/k6YaeQncUeQ"
              target="_blank"
              rel="noopener noreferrer"
              title="Watch video tutorial"
              className="flex items-center gap-1.5 bg-red-700 hover:bg-red-600 text-white rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors shrink-0">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
              Tutorial
            </a>
          </div>
        </div>

        {/* ── History / Projects view ─────────────────────────────────────── */}
        {studioView === 'history' && (
          <div className="flex-1 overflow-y-auto p-6 bg-slate-950">
            <h2 className="text-white font-bold text-base mb-4 flex items-center gap-2">
              <FolderOpen size={18} className="text-orange-400" /> Saved Projects
            </h2>
            {loadingProjects ? (
              <div className="flex justify-center py-16">
                <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : savedProjects.length === 0 ? (
              <div className="text-center py-16 text-slate-500">
                <Save size={40} className="mx-auto mb-3 opacity-30" />
                <p>No saved projects yet.</p>
                <p className="text-xs mt-1">Build something in the editor and hit Save.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {savedProjects.map((p: any) => (
                  <div key={p.id}
                    onClick={() => handleLoadProject(p)}
                    className="group bg-slate-900 border border-slate-700/60 rounded-xl overflow-hidden cursor-pointer hover:border-orange-500/60 transition-colors">
                    <div className="relative bg-slate-800" style={{ aspectRatio: '16/9' }}>
                      {p.thumbnailUrl ? (
                        <img src={p.thumbnailUrl} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Layers size={28} className="text-slate-600" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-orange-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
                          Load Project
                        </div>
                      </div>
                    </div>
                    <div className="px-3 py-2">
                      <p className="text-sm text-slate-200 font-semibold truncate">{p.name}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {new Date(p.savedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Main edit area ───────────────────────────────────────────────── */}
        {studioView === 'edit' && (
        <><div className="flex flex-1 min-h-0">

          {/* ── Left panel: media library ──────────────────────────────────── */}
          <div className="w-64 shrink-0 bg-slate-900/80 border-r border-slate-700/50 flex flex-col">

            {/* Tab bar */}
            <div className="flex border-b border-slate-700/50">
              {([
                { key: 'video', icon: Film,  label: 'Clips'  },
                { key: 'audio', icon: Music, label: 'Music'  },
                { key: 'voice', icon: Mic,   label: 'Voice'  },
                { key: 'text',  icon: Type,  label: 'Text'   },
              ] as const).map(({ key, icon: Icon, label }) => (
                <button key={key} onClick={() => setActiveTab(key)}
                  className={classNames('flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors',
                    activeTab === key
                      ? 'text-orange-400 border-b-2 border-orange-400'
                      : 'text-slate-500 hover:text-slate-300')}>
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">

              {/* ── Video clips tab ── */}
              {activeTab === 'video' && (
                <>
                  {/* Upload button */}
                  <label className="flex items-center gap-2 w-full bg-slate-800 hover:bg-slate-700 border border-dashed border-slate-600 rounded-lg px-3 py-2.5 text-xs text-slate-400 cursor-pointer transition-colors">
                    <Upload size={13} /> Upload video
                    <input type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
                  </label>

                  {/* Generated library */}
                  <p className="text-xs text-slate-500 pt-1 pb-0.5">Your generated videos</p>
                  {loadingLib ? (
                    <div className="flex justify-center py-6">
                      <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : library.length === 0 ? (
                    <p className="text-xs text-slate-600 text-center py-4">No saved videos yet. Generate some first!</p>
                  ) : library.map(lib => (
                    <div key={lib.id}
                      className="lib-item bg-slate-800/70 border border-slate-700/50 rounded-lg overflow-hidden cursor-pointer"
                      onClick={() => addClipFromLibrary(lib)}>
                      <video src={lib.url} className="w-full h-20 object-cover bg-black" muted />
                      <div className="px-2 py-1.5 flex items-center justify-between gap-1">
                        <p className="text-xs text-slate-300 truncate flex-1">{lib.name}</p>
                        <Plus size={12} className="text-orange-400 shrink-0" />
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* ── Audio tab ── */}
              {activeTab === 'audio' && (
                <>
                  <label className="flex items-center gap-2 w-full bg-slate-800 hover:bg-slate-700 border border-dashed border-slate-600 rounded-lg px-3 py-2.5 text-xs text-slate-400 cursor-pointer transition-colors">
                    <Upload size={13} /> Upload music / sound
                    <input type="file" accept="audio/*" className="hidden" onChange={handleAudioUpload} />
                  </label>

                  <p className="text-xs text-slate-500 pt-1">Your saved voice clips</p>
                  {loadingAudioLib ? (
                    <div className="flex justify-center py-3">
                      <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : audioLibrary.length === 0 ? (
                    <p className="text-xs text-slate-600 text-center py-2">No saved clips yet — generate some on the Voice Creation page!</p>
                  ) : (
                    <div className="space-y-1 max-h-36 overflow-y-auto">
                      {audioLibrary.map(clip => (
                        <div key={clip.id}
                          className="flex items-center gap-2 px-2 py-1.5 bg-slate-800/70 border border-slate-700/40 rounded-lg cursor-pointer hover:bg-slate-700/70 transition-colors"
                          onClick={async () => {
                            const dur = await new Promise<number>(resolve => {
                              const a = new Audio(clip.url);
                              a.onloadedmetadata = () => resolve(a.duration);
                              a.onerror = () => resolve(30);
                            });
                            setAudioTrack({ id: uid(), name: clip.name, src: clip.url, duration: dur, loop: false, volume: 0.8, timelineStart: 0 });
                          }}>
                          <Music size={11} className="text-green-400 shrink-0" />
                          <span className="text-xs text-slate-300 truncate flex-1">{clip.name}</span>
                          <Plus size={11} className="text-green-400 shrink-0" />
                        </div>
                      ))}
                    </div>
                  )}

                  {audioTrack ? (
                    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 space-y-3">
                      <div className="flex items-center gap-2">
                        <Music size={14} className="text-green-400 shrink-0" />
                        <p className="text-xs text-slate-300 truncate flex-1">{audioTrack.name}</p>
                        <button onClick={() => setAudioTrack(null)}>
                          <X size={13} className="text-slate-500 hover:text-red-400" />
                        </button>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-400">Volume</span>
                          <span className="mono text-xs text-slate-400">{Math.round(audioTrack.volume * 100)}%</span>
                        </div>
                        <input type="range" min={0} max={1} step={0.05}
                          value={audioTrack.volume}
                          onChange={e => setAudioTrack(a => a ? { ...a, volume: +e.target.value } : a)}
                          className="w-full accent-green-400" />
                        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                          <input type="checkbox" checked={audioTrack.loop}
                            onChange={e => setAudioTrack(a => a ? { ...a, loop: e.target.checked } : a)}
                            className="accent-green-400" />
                          Loop
                        </label>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-600 text-center py-4">No music added yet</p>
                  )}
                </>
              )}

              {/* ── Voice tab ── */}
              {activeTab === 'voice' && (
                <>
                  {/* Saved voice clips from Voice Creation page */}
                  <p className="text-xs text-slate-500">Your saved voice clips</p>
                  {loadingAudioLib ? (
                    <div className="flex justify-center py-3">
                      <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : audioLibrary.length === 0 ? (
                    <p className="text-xs text-slate-600 text-center py-2">No saved clips yet — generate some on the Voice Creation page!</p>
                  ) : (
                    <div className="space-y-1 max-h-36 overflow-y-auto">
                      {audioLibrary.map(clip => (
                        <div key={clip.id}
                          className="flex items-center gap-2 px-2 py-1.5 bg-slate-800/70 border border-purple-800/40 rounded-lg cursor-pointer hover:bg-purple-900/30 transition-colors"
                          onClick={async () => {
                            const dur = await new Promise<number>(resolve => {
                              const a = new Audio(clip.url);
                              a.onloadedmetadata = () => resolve(a.duration);
                              a.onerror = () => resolve(5);
                            });
                            const tStart = voiceSegs.reduce((m, v) => Math.max(m, v.timelineStart + v.duration), playhead);
                            setVoiceSegs(prev => [...prev, {
                              id: uid(), src: clip.url, duration: dur,
                              timelineStart: tStart, name: clip.name,
                            }]);
                          }}>
                          <Mic size={11} className="text-purple-400 shrink-0" />
                          <span className="text-xs text-slate-300 truncate flex-1">{clip.name}</span>
                          <Plus size={11} className="text-purple-400 shrink-0" />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Upload audio file as voiceover */}
                  <label className="flex items-center gap-2 w-full bg-slate-800 hover:bg-slate-700 border border-dashed border-slate-600 rounded-lg px-3 py-2.5 text-xs text-slate-400 cursor-pointer transition-colors">
                    <Upload size={13} /> Upload audio file
                    <input type="file" accept="audio/*" className="hidden" onChange={async e => {
                      const file = e.target.files?.[0]; if (!file) return;
                      const src = URL.createObjectURL(file);
                      const dur = await new Promise<number>(resolve => {
                        const a = new Audio(src);
                        a.onloadedmetadata = () => resolve(a.duration);
                        a.onerror = () => resolve(0);
                      });
                      const tStart = voiceSegs.reduce((m, v) => Math.max(m, v.timelineStart + v.duration), 0);
                      setVoiceSegs(prev => [...prev, {
                        id: uid(), src, duration: dur,
                        timelineStart: tStart,
                        name: file.name.replace(/[.][^.]+$/, ''),
                      }]);
                      e.target.value = '';
                    }} />
                  </label>

                  <div className="bg-slate-800/70 border border-slate-700/50 rounded-lg p-3 space-y-3">
                    <p className="text-xs text-slate-400">Or record your voice at the current playhead position.</p>
                    {!isRecording ? (
                      <button onClick={startRecording}
                        className="w-full flex items-center justify-center gap-2 bg-red-700 hover:bg-red-600 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
                        <Circle size={14} /> Start Recording
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-center gap-2 text-red-400">
                          <div className="w-2.5 h-2.5 rounded-full bg-red-500 rec-pulse" />
                          <span className="mono text-sm font-bold">{fmt(recordingTime)}</span>
                        </div>
                        <button onClick={stopRecording}
                          className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors">
                          <Square size={14} /> Stop Recording
                        </button>
                      </div>
                    )}
                  </div>

                  {voiceSegs.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs text-slate-500">Recordings</p>
                      {voiceSegs.map(v => (
                        <div key={v.id} className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5">
                          <Mic size={12} className="text-purple-400 shrink-0" />
                          <span className="text-xs text-slate-300 flex-1 truncate">{v.name}</span>
                          <span className="mono text-xs text-slate-500">{fmt(v.duration)}</span>
                          <button onClick={() => setVoiceSegs(prev => prev.filter(s => s.id !== v.id))}>
                            <X size={12} className="text-slate-500 hover:text-red-400" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* ── Text tab ── */}
              {activeTab === 'text' && (
                <>
                  <div className="bg-slate-800/70 border border-slate-700/50 rounded-lg p-3 space-y-3">
                    <p className="text-xs text-slate-400">Add text at the current playhead position ({fmt(playhead)}).</p>
                    <textarea
                      value={newOverlayText}
                      onChange={e => setNewOverlayText(e.target.value)}
                      placeholder="Type your text here…"
                      rows={3}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 resize-none outline-none focus:ring-1 focus:ring-orange-500/50"
                    />
                    <button onClick={addOverlay} disabled={!newOverlayText.trim()}
                      className="w-full flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white rounded-lg py-2 text-sm font-semibold transition-colors">
                      <Plus size={14} /> Add Text Overlay
                    </button>
                  </div>

                  {overlays.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs text-slate-500">Text overlays</p>
                      {overlays.map(o => (
                        <div key={o.id}
                          onClick={() => setSelectedOverlay(o.id === selectedOverlay ? null : o.id)}
                          className={classNames(
                            'bg-slate-800 border rounded-lg px-2 py-1.5 cursor-pointer transition-colors',
                            selectedOverlay === o.id ? 'border-orange-500/50' : 'border-slate-700'
                          )}>
                          <div className="flex items-center gap-2">
                            <Type size={12} className="text-yellow-400 shrink-0" />
                            <span className="text-xs text-slate-300 flex-1 truncate">{o.text}</span>
                            <button onClick={e => { e.stopPropagation(); setOverlays(prev => prev.filter(x => x.id !== o.id)); }}>
                              <X size={12} className="text-slate-500 hover:text-red-400" />
                            </button>
                          </div>
                          {selectedOverlay === o.id && (
                            <div className="mt-2 space-y-2 pt-2 border-t border-slate-700">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-400 w-14">Duration</span>
                                <input type="range" min={0.5} max={10} step={0.5}
                                  value={o.duration}
                                  onChange={e => setOverlays(prev => prev.map(x => x.id === o.id ? { ...x, duration: +e.target.value } : x))}
                                  className="flex-1 accent-orange-400" />
                                <span className="mono text-xs text-slate-400 w-8">{o.duration}s</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-400 w-14">Size</span>
                                <input type="range" min={16} max={72} step={2}
                                  value={o.fontSize}
                                  onChange={e => setOverlays(prev => prev.map(x => x.id === o.id ? { ...x, fontSize: +e.target.value } : x))}
                                  className="flex-1 accent-orange-400" />
                                <span className="mono text-xs text-slate-400 w-8">{o.fontSize}px</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-400 w-14">Color</span>
                                <div className="flex gap-1 flex-wrap">
                                  {COLORS.map(c => (
                                    <button key={c} onClick={() => setOverlays(prev => prev.map(x => x.id === o.id ? { ...x, color: c } : x))}
                                      style={{ background: c }}
                                      className={classNames('w-5 h-5 rounded-full border-2 transition-transform hover:scale-110',
                                        o.color === c ? 'border-white scale-110' : 'border-transparent')} />
                                  ))}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-400 w-14">Y pos</span>
                                <input type="range" min={5} max={95} step={5}
                                  value={o.y}
                                  onChange={e => setOverlays(prev => prev.map(x => x.id === o.id ? { ...x, y: +e.target.value } : x))}
                                  className="flex-1 accent-orange-400" />
                                <span className="mono text-xs text-slate-400 w-8">{o.y}%</span>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── Center: preview ────────────────────────────────────────────── */}
          <div className="flex-1 flex flex-col items-center justify-center bg-black/60 min-w-0 p-4 gap-4">

            {/* Preview window */}
            <div className="relative rounded-xl overflow-hidden bg-black border border-slate-700/50 shadow-2xl"
              style={{ width: '100%', maxWidth: 640, aspectRatio: '16/9' }}>

              {activeClip ? (
                <video
                  ref={videoRef}
                  src={activeClip.src}
                  className="w-full h-full object-contain"
                  muted={muted}
                  playsInline
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-600">
                  <Film size={48} />
                  <p className="text-sm">Add clips to the timeline below</p>
                </div>
              )}

              {/* Text overlays */}
              {activeOverlays.map(o => (
                <div key={o.id}
                  className="absolute pointer-events-none select-none"
                  style={{
                    left: `${o.x}%`, top: `${o.y}%`,
                    transform: 'translate(-50%, -50%)',
                    fontSize: o.fontSize,
                    color: o.color,
                    fontWeight: o.bold ? 700 : 400,
                    textShadow: '0 2px 8px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,1)',
                    fontFamily: "'Space Grotesk', sans-serif",
                    whiteSpace: 'nowrap',
                    maxWidth: '90%',
                    textAlign: 'center',
                  }}>
                  {o.text}
                </div>
              ))}

              {/* Mute button */}
              <button onClick={() => setMuted(m => !m)}
                className="absolute bottom-3 right-3 p-1.5 bg-black/60 rounded-lg text-slate-300 hover:text-white transition-colors">
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
            </div>

            {/* Hidden audio element */}
            {audioTrack && (
              <audio ref={audioRef} src={audioTrack.src}
                loop={audioTrack.loop} volume={audioTrack.volume} />
            )}

            {/* Playback controls */}
            <div className="flex items-center gap-3">
              <button onClick={() => { setPlayhead(0); stopPlayback(); }}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors">
                <SkipBack size={18} />
              </button>
              <button onClick={togglePlay}
                className="p-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-white shadow-lg transition-all hover:scale-105">
                {isPlaying ? <Pause size={22} /> : <Play size={22} />}
              </button>
              <div className="mono text-sm text-slate-400 w-28 text-center">
                {fmt(playhead)} / {fmt(totalDuration)}
              </div>
            </div>


          </div>
        </div>

        {/* ── Render progress overlay ─────────────────────────────────────── */}
        {isRendering && (
          <div className="shrink-0 bg-slate-900 border-t border-orange-500/40 px-5 py-3 flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-orange-400 flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" /> {renderMsg}
                </span>
                <span className="text-xs text-slate-400 mono">{Math.round(renderProgress * 100)}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 bg-gradient-to-r from-orange-500 to-pink-500 rounded-full transition-all"
                  style={{ width: `${renderProgress * 100}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Keep this tab open. Rendering in real-time — one second of video per second elapsed.
              </p>
            </div>
            <button
              onClick={() => { renderCancelRef.current = true; }}
              className="shrink-0 bg-red-800 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors">
              Cancel
            </button>
          </div>
        )}

        {/* ── Render canvas + preview ──────────────────────────────────────── */}
        {(isRendering || renderedUrl) && (
          <div className="shrink-0 bg-slate-950 border-t border-orange-500/30 px-5 py-4">
            <div className="flex items-start gap-4 max-w-3xl mx-auto">

              {/* Canvas shown during render / video shown after */}
              <div className="rounded-xl overflow-hidden bg-black border border-slate-700 shadow-xl shrink-0"
                style={{ width: 480, aspectRatio: '16/9' }}>
                {isRendering && (
                  <canvas
                    ref={renderCanvasRef}
                    width={1280} height={720}
                    style={{ width: '100%', height: '100%', display: 'block' }}
                  />
                )}
                {!isRendering && renderedUrl && (
                  <video
                    key={renderedUrl}
                    src={renderedUrl}
                    controls
                    autoPlay
                    playsInline
                    style={{ width: '100%', height: '100%', display: 'block' }}
                  />
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-3 pt-1">
                {isRendering ? (
                  <p className="text-sm font-semibold text-orange-400 flex items-center gap-1.5">
                    <div className="w-3 h-3 border-2 border-orange-400/30 border-t-orange-400 rounded-full animate-spin" />
                    {renderMsg}
                  </p>
                ) : (
                  <p className="text-sm font-semibold text-green-400 flex items-center gap-1.5">
                    <Check size={15} /> Render complete
                  </p>
                )}
                {renderedName && <p className="text-xs text-slate-400">{renderedName}</p>}
                {renderedUrl && (
                  <>
                    <a
                      href={renderedUrl}
                      download={renderedName}
                      className="flex items-center gap-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg px-4 py-2 text-sm font-semibold transition-colors">
                      <Download size={14} /> Download .webm
                    </a>
                    <button
                      onClick={() => { if (renderedUrl) URL.revokeObjectURL(renderedUrl); setRenderedUrl(null); }}
                      className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg px-4 py-2 text-sm transition-colors">
                      <X size={14} /> Dismiss
                    </button>
                    <p className="text-[10px] text-slate-500 max-w-[180px] leading-relaxed">
                      Video plays above. Download saves as .webm — open in Firefox or VLC if Chrome doesn't play the file.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Timeline ────────────────────────────────────────────────────── */}
        <div className="shrink-0 bg-slate-900 border-t border-slate-700/50 transition-all duration-200"
          style={{ height: timelineCollapsed ? 40 : 220 }}>

          {/* Timeline header */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-700/30">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Timeline</span>
            {/* Split + Delete buttons */}
            {!timelineCollapsed && (
              <div className="flex items-center gap-1.5">
                <button onClick={splitClipAtPlayhead}
                  disabled={!clips.some(c => playhead > c.timelineStart + 0.1 && playhead < c.timelineStart + (c.trimEnd - c.trimStart) - 0.1)}
                  title="Split clip at playhead (position playhead over a clip first)"
                  className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 text-slate-400 hover:text-yellow-300 hover:bg-slate-700 disabled:opacity-30 text-[10px] transition-colors border border-slate-700">
                  <Scissors size={11} /> Split
                </button>
                <button onClick={deleteSelected}
                  disabled={!selectedClip}
                  title="Delete selected clip"
                  className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 text-slate-400 hover:text-red-400 hover:bg-slate-700 disabled:opacity-30 text-[10px] transition-colors border border-slate-700">
                  <Trash2 size={11} /> Delete
                </button>
              </div>
            )}
            <div className="flex items-center gap-1 ml-auto">
              <button onClick={() => setPlayhead(p => Math.max(0, p - 5))}
                className="p-1 rounded text-slate-500 hover:text-slate-300 transition-colors"><ChevronLeft size={14} /></button>
              <button onClick={() => setPlayhead(p => Math.min(totalDuration, p + 5))}
                className="p-1 rounded text-slate-500 hover:text-slate-300 transition-colors"><ChevronRight size={14} /></button>
              {/* Collapse/expand toggle */}
              <button onClick={() => setTimelineCollapsed(c => !c)}
                title={timelineCollapsed ? 'Expand timeline' : 'Collapse timeline'}
                className="p-1 rounded text-slate-500 hover:text-orange-400 transition-colors ml-1">
                {timelineCollapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>
          </div>

          {/* Scrollable timeline area */}
          {!timelineCollapsed && <div className="overflow-x-auto overflow-y-hidden" style={{ height: 176 }}>
            <div style={{ width: Math.max(timelineWidth + 80, 600), minWidth: '100%', position: 'relative', height: '100%' }}>

              {/* Time ruler */}
              <div className="relative h-6 bg-slate-950/50 border-b border-slate-700/30 ml-20">
                {Array.from({ length: Math.ceil(totalDuration) + 1 }, (_, i) => (
                  <div key={i} className="timeline-ruler-tick absolute"
                    style={{ left: i * PX_PER_SEC }}>
                    <span className="mono text-[10px] text-slate-600 pl-1">{fmt(i)}</span>
                  </div>
                ))}
                {/* Playhead on ruler */}
                <div className="playhead-line" style={{ left: 80 + playhead * PX_PER_SEC }} />
              </div>

              {/* Track rows */}
              <div className="flex flex-col" style={{ height: 150 }}>

                {/* Video track */}
                <div className="flex h-12 border-b border-slate-700/20">
                  <div className="w-20 shrink-0 flex items-center justify-center border-r border-slate-700/30">
                    <span className="text-xs text-slate-500 flex items-center gap-1"><Film size={11} /> Video</span>
                  </div>
                  <div ref={timelineRef} className="flex-1 relative bg-slate-950/30 cursor-crosshair"
                    onClick={handleTimelineClick}
                    onDragOver={e => e.preventDefault()}
                    onDrop={handleTimelineDrop}>
                    {/* Playhead */}
                    <div className="playhead-line" style={{ left: playhead * PX_PER_SEC }} />
                    {/* Clips */}
                    {clips.map(clip => {
                      const clipDur = clip.trimEnd - clip.trimStart;
                      const w = clipDur * PX_PER_SEC;
                      const l = clip.timelineStart * PX_PER_SEC;
                      return (
                        <div key={clip.id}
                          draggable
                          onDragStart={() => handleClipDragStart(clip.id)}
                          onClick={e => { e.stopPropagation(); setSelectedClip(clip.id === selectedClip ? null : clip.id); }}
                          className={classNames(
                            'track-clip absolute top-1 bottom-1 rounded-md flex items-center overflow-hidden',
                            selectedClip === clip.id
                              ? 'bg-orange-600/80 border-2 border-orange-400'
                              : 'bg-blue-700/70 border border-blue-500/50'
                          )}
                          style={{ left: l, width: Math.max(w, 40) }}>
                          <div className="trim-handle trim-handle-left"
                            onMouseDown={e => {
                              e.stopPropagation(); e.preventDefault();
                              const startX = e.clientX;
                              const onMove = (ev: MouseEvent) => trimClipStart(clip.id, (ev.clientX - startX) / PX_PER_SEC);
                              const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
                              window.addEventListener('mousemove', onMove);
                              window.addEventListener('mouseup', onUp);
                            }} />
                          <GripHorizontal size={12} className="text-white/40 mx-1 shrink-0" />
                          <span className="text-xs text-white/80 truncate flex-1 pr-1">{clip.name}</span>
                          <button onClick={e => { e.stopPropagation(); deleteClip(clip.id); }}
                            className="shrink-0 mr-1 text-white/50 hover:text-red-300 transition-colors">
                            <X size={11} />
                          </button>
                          <div className="trim-handle trim-handle-right"
                            onMouseDown={e => {
                              e.stopPropagation(); e.preventDefault();
                              const startX = e.clientX;
                              const onMove = (ev: MouseEvent) => trimClipEnd(clip.id, (ev.clientX - startX) / PX_PER_SEC);
                              const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
                              window.addEventListener('mousemove', onMove);
                              window.addEventListener('mouseup', onUp);
                            }} />
                        </div>
                      );
                    })}
                    {clips.length === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xs text-slate-600">Click a clip in the library to add it here</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Audio track */}
                <div className="flex h-10 border-b border-slate-700/20">
                  <div className="w-20 shrink-0 flex items-center justify-center border-r border-slate-700/30">
                    <span className="text-xs text-slate-500 flex items-center gap-1"><Music size={11} /> Music</span>
                  </div>
                  <div className="flex-1 relative bg-slate-950/20 cursor-pointer" onClick={handleTimelineClick}>
                    <div className="playhead-line" style={{ left: playhead * PX_PER_SEC }} />
                    {audioTrack && (
                      <div
                        className="absolute top-1 bottom-1 rounded-md bg-green-800/60 border border-green-600/40 flex items-center px-2 gap-1 select-none"
                        style={{ left: (audioTrack.timelineStart ?? 0) * PX_PER_SEC, width: Math.min(audioTrack.duration * PX_PER_SEC, timelineWidth), cursor: 'grab' }}
                        onMouseDown={e => {
                          if ((e.target as HTMLElement).closest('.audio-handle')) return;
                          e.stopPropagation(); e.preventDefault();
                          const startX = e.clientX; const startTs = audioTrack.timelineStart ?? 0;
                          const onMove = (ev: MouseEvent) => {
                            setAudioTrack(a => a ? { ...a, timelineStart: Math.max(0, startTs + (ev.clientX - startX) / PX_PER_SEC) } : a);
                          };
                          const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
                          window.addEventListener('mousemove', onMove);
                          window.addEventListener('mouseup', onUp);
                        }}>
                        <Music size={10} className="text-green-400 shrink-0" />
                        <span className="text-xs text-green-300 truncate flex-1">{audioTrack.name}</span>
                        <div
                          className="audio-handle absolute top-0 right-0 bottom-0 w-3 cursor-ew-resize flex items-center justify-center hover:bg-green-400/30 rounded-r-md"
                          onMouseDown={e => {
                            e.stopPropagation(); e.preventDefault();
                            const startX = e.clientX; const startDur = audioTrack.duration;
                            const onMove = (ev: MouseEvent) => {
                              setAudioTrack(a => a ? { ...a, duration: Math.max(0.5, startDur + (ev.clientX - startX) / PX_PER_SEC) } : a);
                            };
                            const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
                            window.addEventListener('mousemove', onMove);
                            window.addEventListener('mouseup', onUp);
                          }}>
                          <GripHorizontal size={8} className="text-green-500 rotate-90" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Voiceover track */}
                <div className="flex h-10 border-b border-slate-700/20">
                  <div className="w-20 shrink-0 flex items-center justify-center border-r border-slate-700/30">
                    <span className="text-xs text-slate-500 flex items-center gap-1"><Mic size={11} /> Voice</span>
                  </div>
                  <div className="flex-1 relative bg-slate-950/20 cursor-pointer" onClick={handleTimelineClick}>
                    <div className="playhead-line" style={{ left: playhead * PX_PER_SEC }} />
                    {voiceSegs.map(v => (
                      <div key={v.id}
                        className="absolute top-1 bottom-1 rounded-md bg-purple-800/60 border border-purple-600/40 flex items-center px-2 gap-1 select-none"
                        style={{ left: v.timelineStart * PX_PER_SEC, width: Math.max(v.duration * PX_PER_SEC, 40), cursor: 'grab' }}
                        onMouseDown={e => {
                          if ((e.target as HTMLElement).closest('.voice-handle, button')) return;
                          e.stopPropagation(); e.preventDefault();
                          const startX = e.clientX; const startTs = v.timelineStart;
                          const onMove = (ev: MouseEvent) => {
                            setVoiceSegs(prev => prev.map(x => x.id === v.id ? { ...x, timelineStart: Math.max(0, startTs + (ev.clientX - startX) / PX_PER_SEC) } : x));
                          };
                          const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
                          window.addEventListener('mousemove', onMove);
                          window.addEventListener('mouseup', onUp);
                        }}>
                        <Mic size={10} className="text-purple-400 shrink-0" />
                        <span className="text-[10px] text-purple-300 truncate flex-1">{v.name}</span>
                        <button title="Click to change speed"
                          onClick={e => {
                            e.stopPropagation();
                            const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
                            const cur = v.playbackRate ?? 1;
                            const next = speeds[(speeds.indexOf(cur) + 1) % speeds.length];
                            const base = v.baseDuration ?? v.duration;
                            setVoiceSegs(prev => prev.map(x => x.id === v.id ? { ...x, playbackRate: next, baseDuration: base, duration: base / next } : x));
                          }}
                          className="voice-handle shrink-0 text-[9px] font-bold text-purple-300 bg-purple-700/60 hover:bg-purple-600 px-1 rounded">
                          {(v.playbackRate ?? 1).toFixed(2).replace(/[.]?0+$/, '')}×
                        </button>
                        <button onClick={e => { e.stopPropagation(); setVoiceSegs(prev => prev.filter(x => x.id !== v.id)); }}
                          className="voice-handle shrink-0 text-purple-500 hover:text-red-300">
                          <X size={10} />
                        </button>
                        <div className="voice-handle absolute top-0 right-0 bottom-0 w-3 cursor-ew-resize flex items-center justify-center hover:bg-purple-400/30 rounded-r-md"
                          onMouseDown={e => {
                            e.stopPropagation(); e.preventDefault();
                            const startX = e.clientX; const startDur = v.duration;
                            const onMove = (ev: MouseEvent) => {
                              setVoiceSegs(prev => prev.map(x => x.id === v.id ? { ...x, duration: Math.max(0.5, startDur + (ev.clientX - startX) / PX_PER_SEC) } : x));
                            };
                            const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
                            window.addEventListener('mousemove', onMove);
                            window.addEventListener('mouseup', onUp);
                          }}>
                          <GripHorizontal size={8} className="text-purple-500 rotate-90" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Text overlay track */}
                <div className="flex h-10">
                  <div className="w-20 shrink-0 flex items-center justify-center border-r border-slate-700/30">
                    <span className="text-xs text-slate-500 flex items-center gap-1"><Type size={11} /> Text</span>
                  </div>
                  <div className="flex-1 relative bg-slate-950/20 cursor-pointer" onClick={handleTimelineClick}>
                    <div className="playhead-line" style={{ left: playhead * PX_PER_SEC }} />
                    {overlays.map(o => (
                      <div key={o.id}
                        onClick={e => { e.stopPropagation(); setSelectedOverlay(o.id === selectedOverlay ? null : o.id); }}
                        className={classNames(
                          'absolute top-1 bottom-1 rounded-md flex items-center px-2 gap-1 select-none',
                          selectedOverlay === o.id
                            ? 'bg-yellow-600/80 border-2 border-yellow-300'
                            : 'bg-yellow-800/60 border border-yellow-600/40'
                        )}
                        style={{ left: o.timelineStart * PX_PER_SEC, width: Math.max(o.duration * PX_PER_SEC, 40), cursor: 'grab' }}
                        onMouseDown={e => {
                          // Drag to move — but not if clicking the resize handle or delete btn
                          if ((e.target as HTMLElement).closest('.overlay-resize-handle, button')) return;
                          e.stopPropagation();
                          e.preventDefault();
                          const startX = e.clientX;
                          const startTs = o.timelineStart;
                          const onMove = (ev: MouseEvent) => {
                            const deltaSec = (ev.clientX - startX) / PX_PER_SEC;
                            const newTs = Math.max(0, startTs + deltaSec);
                            setOverlays(prev => prev.map(x => x.id === o.id ? { ...x, timelineStart: newTs } : x));
                          };
                          const onUp = () => {
                            window.removeEventListener('mousemove', onMove);
                            window.removeEventListener('mouseup', onUp);
                          };
                          window.addEventListener('mousemove', onMove);
                          window.addEventListener('mouseup', onUp);
                        }}>
                        <Type size={10} className="text-yellow-400 shrink-0" />
                        <span className="text-xs text-yellow-300 truncate flex-1">{o.text}</span>
                        <button
                          onClick={e => { e.stopPropagation(); setOverlays(prev => prev.filter(x => x.id !== o.id)); }}
                          className="shrink-0 text-yellow-500 hover:text-red-300 transition-colors">
                          <X size={10} />
                        </button>
                        {/* Right-edge resize handle */}
                        <div
                          className="overlay-resize-handle absolute top-0 right-0 bottom-0 w-3 cursor-ew-resize flex items-center justify-center hover:bg-yellow-400/30 rounded-r-md"
                          title="Drag to resize duration"
                          onMouseDown={e => {
                            e.stopPropagation();
                            e.preventDefault();
                            const startX = e.clientX;
                            const startDur = o.duration;
                            const onMove = (ev: MouseEvent) => {
                              const deltaSec = (ev.clientX - startX) / PX_PER_SEC;
                              setOverlays(prev => prev.map(x => x.id === o.id
                                ? { ...x, duration: Math.max(0.5, startDur + deltaSec) } : x));
                            };
                            const onUp = () => {
                              window.removeEventListener('mousemove', onMove);
                              window.removeEventListener('mouseup', onUp);
                            };
                            window.addEventListener('mousemove', onMove);
                            window.addEventListener('mouseup', onUp);
                          }}>
                          <GripHorizontal size={8} className="text-yellow-500 rotate-90" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          </div>}
        </div>
        </>)}
      </div>
    </AppLayout>
  );
};

export default VideoStudioPage;

/*
── IMPORTANT: To enable ffmpeg.wasm full video export, add this to vercel.json ──

{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy",   "value": "same-origin" },
        { "key": "Cross-Origin-Embedder-Policy",  "value": "require-corp" }
      ]
    }
  ]
}

Without these headers, window.crossOriginIsolated = false and ffmpeg.wasm
cannot use SharedArrayBuffer. The page will still work — export will download
clips individually until the headers are added.
──────────────────────────────────────────────────────────────────────────────
*/