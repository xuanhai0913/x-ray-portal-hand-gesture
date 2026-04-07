import React, { useEffect, useRef, useState } from 'react';
import { Hands, Results } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import { Camera as CameraIcon, RefreshCcw, Settings, Download, Wand2 } from 'lucide-react';

type Step = 'loading' | 'aiming1' | 'aiming2' | 'result';
type FrameMode = 'locked' | 'realtime';
type PortalEffectId = 'xray' | 'scanlines' | 'glitch' | 'chromatic' | 'neon' | 'thermal' | 'noir';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Point {
  x: number;
  y: number;
}

interface FrameData {
  rect: Rect;
  polygon: Point[];
  angle: number;
  cx: number;
  cy: number;
}

interface EffectPreset {
  id: PortalEffectId;
  label: string;
  accentRgb: string;
  borderDash?: number[];
  lineWidthBoost?: number;
}

const XRAY_FILTER = 'invert(100%) sepia(100%) saturate(300%) hue-rotate(130deg) contrast(150%) brightness(120%)';
const FRAME_SMOOTHING_ALPHA = 0.35;
const STABILITY_SPEED_THRESHOLD = 80;
const EFFECT_PRESETS: EffectPreset[] = [
  { id: 'xray', label: 'Xray', accentRgb: '34, 211, 238' },
  { id: 'scanlines', label: 'Scanline', accentRgb: '251, 191, 36', borderDash: [12, 8] },
  { id: 'glitch', label: 'Glitch', accentRgb: '248, 113, 113', borderDash: [5, 4] },
  { id: 'chromatic', label: 'Chromatic', accentRgb: '129, 140, 248' },
  { id: 'neon', label: 'Neon', accentRgb: '74, 222, 128', lineWidthBoost: 1.2 },
  { id: 'thermal', label: 'Thermal', accentRgb: '249, 115, 22', lineWidthBoost: 1.15 },
  { id: 'noir', label: 'Noir', accentRgb: '226, 232, 240', borderDash: [14, 6] },
];

const getEffectPreset = (effect: PortalEffectId): EffectPreset => {
  return EFFECT_PRESETS.find((preset) => preset.id === effect) ?? EFFECT_PRESETS[0];
};

export default function App() {
  const [step, setStep] = useState<Step>('loading');
  const [hasFrame, setHasFrame] = useState(false);
  const [finalImage, setFinalImage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [initAttempt, setInitAttempt] = useState(0);
  const [a11yStatus, setA11yStatus] = useState('');
  
  const [detectionConfidence, setDetectionConfidence] = useState(0.7);
  const [trackingConfidence, setTrackingConfidence] = useState(0.7);
  const [distortionIntensity, setDistortionIntensity] = useState(0.5);
  const [showSettings, setShowSettings] = useState(false);
  const [portalEffect, setPortalEffect] = useState<PortalEffectId>('xray');
  const [frameMode, setFrameMode] = useState<FrameMode>('locked');
  const [savedImageUrl, setSavedImageUrl] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  const stepRef = useRef<Step>('loading');
  const frameModeRef = useRef<FrameMode>('locked');
  const frameDataRef = useRef<FrameData | null>(null);
  const lockedFrameDataRef = useRef<FrameData | null>(null);
  const smoothedFrameDataRef = useRef<FrameData | null>(null);
  const lastStabilitySampleRef = useRef<{ cx: number; cy: number; time: number } | null>(null);
  const hasFrameRef = useRef(false);
  const holdStartTimeRef = useRef<number | null>(null);
  const isCapturingRef = useRef(false);
  const bgPortalCenterRef = useRef<{x: number, y: number} | null>(null);
  const capture1TimeRef = useRef<number | null>(null);
  const distortionIntensityRef = useRef(0.5);
  const portalEffectRef = useRef<PortalEffectId>('xray');
  const countdownRef = useRef<number | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef<Camera | null>(null);
  const handsRef = useRef<Hands | null>(null);
  const canvasCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  useEffect(() => {
    let startupTimeoutId: number | null = null;

    const initMediaPipe = async () => {
      if (!videoRef.current) return;

      try {
        setCameraError(null);

        const isSmallScreen = window.matchMedia('(max-width: 768px)').matches;
        const lowPowerCpu = typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4;
        const cameraWidth = isSmallScreen || lowPowerCpu ? 960 : 1280;
        const cameraHeight = isSmallScreen || lowPowerCpu ? 540 : 720;

        handsRef.current = new Hands({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        handsRef.current.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.7,
          minTrackingConfidence: 0.7
        });

        handsRef.current.onResults(onResults);

        cameraRef.current = new Camera(videoRef.current, {
          onFrame: async () => {
            if (videoRef.current && handsRef.current && stepRef.current !== 'result') {
              await handsRef.current.send({ image: videoRef.current });
            }
          },
          width: cameraWidth,
          height: cameraHeight
        });

        await cameraRef.current.start();

        startupTimeoutId = window.setTimeout(() => {
          if (stepRef.current === 'loading') {
            setCameraError('Không nhận được khung hình từ camera. Hãy kiểm tra quyền truy cập rồi thử lại.');
          }
        }, 10000);
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : String(error);
        const normalizedMessage = /denied|notallowed|permission/i.test(rawMessage)
          ? 'Bạn đã từ chối quyền truy cập camera. Hãy cấp quyền camera và thử lại.'
          : 'Không thể khởi tạo camera hoặc MediaPipe. Vui lòng thử lại.';
        setCameraError(normalizedMessage);
      }
    };

    initMediaPipe();

    return () => {
      if (startupTimeoutId !== null) {
        window.clearTimeout(startupTimeoutId);
      }
      if (cameraRef.current) {
        cameraRef.current.stop();
        cameraRef.current = null;
      }
      if (handsRef.current) {
        handsRef.current.close();
        handsRef.current = null;
      }
      canvasCtxRef.current = null;
    };
  }, [initAttempt]);

  useEffect(() => {
    if (handsRef.current) {
      handsRef.current.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: detectionConfidence,
        minTrackingConfidence: trackingConfidence
      });
    }
  }, [detectionConfidence, trackingConfidence]);

  useEffect(() => {
    frameModeRef.current = frameMode;
  }, [frameMode]);

  const handleDistortionChange = (val: number) => {
    setDistortionIntensity(val);
    distortionIntensityRef.current = val;
  };

  const setPortalEffectPreset = (effect: PortalEffectId) => {
    setPortalEffect(effect);
    portalEffectRef.current = effect;
  };

  const cycleEffect = () => {
    const currentIndex = EFFECT_PRESETS.findIndex((preset) => preset.id === portalEffect);
    const nextIndex = (currentIndex + 1) % EFFECT_PRESETS.length;
    setPortalEffectPreset(EFFECT_PRESETS[nextIndex].id);
  };

  useEffect(() => {
    if (cameraError) {
      setA11yStatus(`Lỗi camera: ${cameraError}`);
      return;
    }

    if (step === 'loading') {
      setA11yStatus('Đang khởi động camera và AI.');
    } else if (step === 'aiming1') {
      setA11yStatus('Bước 1. Tạo khung tay để chụp nền portal.');
    } else if (step === 'aiming2') {
      setA11yStatus(
        frameMode === 'locked'
          ? 'Bước 2. Khung đã được khóa từ lần chụp đầu. Giữ tư thế để chụp ảnh hoàn chỉnh.'
          : 'Bước 2. Tạo lại khung tay ổn định để chụp ảnh hoàn chỉnh.',
      );
    } else if (step === 'result') {
      setA11yStatus('Đã hoàn thành ảnh ghép. Bạn có thể tải ảnh xuống hoặc chụp lại.');
    }
  }, [step, cameraError, frameMode]);

  useEffect(() => {
    if (countdown !== null && (step === 'aiming1' || step === 'aiming2')) {
      setA11yStatus(`Tự động chụp sau ${countdown} giây.`);
    }
  }, [countdown, step]);

  const syncHasFrame = (nextHasFrame: boolean) => {
    if (nextHasFrame !== hasFrameRef.current) {
      setHasFrame(nextHasFrame);
      hasFrameRef.current = nextHasFrame;
    }
  };

  const updateCountdown = (nextCountdown: number | null) => {
    if (countdownRef.current !== nextCountdown) {
      countdownRef.current = nextCountdown;
      setCountdown(nextCountdown);
    }
  };

  useEffect(() => {
    holdStartTimeRef.current = null;
    lastStabilitySampleRef.current = null;
    smoothedFrameDataRef.current = null;
    updateCountdown(null);
  }, [frameMode]);

  const getCurrentFrameData = (results: Results, canvas: HTMLCanvasElement): FrameData | null => {
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length !== 2) {
      return null;
    }

    const hand1 = results.multiHandLandmarks[0];
    const hand2 = results.multiHandLandmarks[1];

    const p1 = { x: (1 - hand1[8].x) * canvas.width, y: hand1[8].y * canvas.height };
    const p2 = { x: (1 - hand1[4].x) * canvas.width, y: hand1[4].y * canvas.height };
    const p3 = { x: (1 - hand2[8].x) * canvas.width, y: hand2[8].y * canvas.height };
    const p4 = { x: (1 - hand2[4].x) * canvas.width, y: hand2[4].y * canvas.height };

    const rawPoints = [p1, p2, p3, p4];
    const cx = rawPoints.reduce((sum, p) => sum + p.x, 0) / 4;
    const cy = rawPoints.reduce((sum, p) => sum + p.y, 0) / 4;

    const polygon = [...rawPoints].sort((a, b) => {
      return Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx);
    });

    const leftIndex = p1.x < p3.x ? p1 : p3;
    const rightIndex = p1.x < p3.x ? p3 : p1;
    const angle = Math.atan2(rightIndex.y - leftIndex.y, rightIndex.x - leftIndex.x);

    const minX = Math.min(...rawPoints.map((p) => p.x));
    const maxX = Math.max(...rawPoints.map((p) => p.x));
    const minY = Math.min(...rawPoints.map((p) => p.y));
    const maxY = Math.max(...rawPoints.map((p) => p.y));

    const padding = 30;
    const rect: Rect = {
      x: Math.max(0, minX - padding),
      y: Math.max(0, minY - padding),
      w: maxX - minX + padding * 2,
      h: maxY - minY + padding * 2,
    };

    if (rect.x + rect.w > canvas.width) rect.w = canvas.width - rect.x;
    if (rect.y + rect.h > canvas.height) rect.h = canvas.height - rect.y;

    if (rect.w < 50 || rect.h < 50) {
      return null;
    }

    return { rect, polygon, angle, cx, cy };
  };

  const smoothFrameData = (next: FrameData | null): FrameData | null => {
    if (!next) {
      smoothedFrameDataRef.current = null;
      return null;
    }

    const prev = smoothedFrameDataRef.current;
    if (!prev) {
      smoothedFrameDataRef.current = next;
      return next;
    }

    const t = FRAME_SMOOTHING_ALPHA;
    const lerp = (a: number, b: number) => a + (b - a) * t;

    const smoothed: FrameData = {
      rect: {
        x: lerp(prev.rect.x, next.rect.x),
        y: lerp(prev.rect.y, next.rect.y),
        w: lerp(prev.rect.w, next.rect.w),
        h: lerp(prev.rect.h, next.rect.h),
      },
      polygon: next.polygon.map((p, index) => ({
        x: lerp(prev.polygon[index]?.x ?? p.x, p.x),
        y: lerp(prev.polygon[index]?.y ?? p.y, p.y),
      })),
      angle: lerp(prev.angle, next.angle),
      cx: lerp(prev.cx, next.cx),
      cy: lerp(prev.cy, next.cy),
    };

    smoothedFrameDataRef.current = smoothed;
    return smoothed;
  };

  const resetFrameStability = () => {
    lastStabilitySampleRef.current = null;
  };

  const isFrameStable = (frameData: FrameData, now: number): boolean => {
    const lastSample = lastStabilitySampleRef.current;
    if (!lastSample) {
      lastStabilitySampleRef.current = { cx: frameData.cx, cy: frameData.cy, time: now };
      return true;
    }

    const dt = Math.max(16, now - lastSample.time);
    const distance = Math.hypot(frameData.cx - lastSample.cx, frameData.cy - lastSample.cy);
    const speed = (distance / dt) * 1000;

    lastStabilitySampleRef.current = { cx: frameData.cx, cy: frameData.cy, time: now };
    return speed <= STABILITY_SPEED_THRESHOLD;
  };

  const drawCaptureProgress = (
    canvasCtx: CanvasRenderingContext2D,
    currentRect: Rect,
    progress: number,
    elapsed: number,
    accentRgb: string,
  ) => {
    canvasCtx.strokeStyle = `rgba(${accentRgb}, 1)`;
    canvasCtx.lineWidth = 4;
    canvasCtx.beginPath();
    const perimeter = 2 * currentRect.w + 2 * currentRect.h;
    const drawLen = perimeter * progress;

    canvasCtx.moveTo(currentRect.x, currentRect.y);
    let remaining = drawLen;

    const topLen = Math.min(remaining, currentRect.w);
    canvasCtx.lineTo(currentRect.x + topLen, currentRect.y);
    remaining -= topLen;

    if (remaining > 0) {
      const rightLen = Math.min(remaining, currentRect.h);
      canvasCtx.lineTo(currentRect.x + currentRect.w, currentRect.y + rightLen);
      remaining -= rightLen;
    }

    if (remaining > 0) {
      const bottomLen = Math.min(remaining, currentRect.w);
      canvasCtx.lineTo(currentRect.x + currentRect.w - bottomLen, currentRect.y + currentRect.h);
      remaining -= bottomLen;
    }

    if (remaining > 0) {
      const leftLen = Math.min(remaining, currentRect.h);
      canvasCtx.lineTo(currentRect.x, currentRect.y + currentRect.h - leftLen);
    }

    canvasCtx.stroke();

    canvasCtx.fillStyle = `rgba(${accentRgb}, 1)`;
    canvasCtx.font = 'bold 24px sans-serif';
    canvasCtx.textAlign = 'center';
    canvasCtx.fillText(`Tự động chụp: ${Math.ceil(3 - elapsed / 1000)}s`, currentRect.x + currentRect.w / 2, currentRect.y - 15);
  };

  const drawPortalEffect = (ctx: CanvasRenderingContext2D, image: CanvasImageSource, effect: PortalEffectId, width: number, height: number) => {
    if (effect === 'xray') {
      ctx.filter = XRAY_FILTER;
      ctx.drawImage(image, 0, 0, width, height);
    } else if (effect === 'scanlines') {
      ctx.filter = 'sepia(100%) hue-rotate(80deg) saturate(300%) brightness(100%) contrast(150%)';
      ctx.drawImage(image, 0, 0, width, height);
      ctx.filter = 'none';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      for (let i = 0; i < height; i += 6) {
        ctx.fillRect(0, i, width, 2);
      }
    } else if (effect === 'glitch') {
      ctx.filter = 'saturate(200%) contrast(150%) hue-rotate(-20deg)';
      ctx.drawImage(image, 0, 0, width, height);
      ctx.filter = 'none';
      const time = Date.now();
      if (Math.floor(time / 50) % 4 === 0) {
        for(let i=0; i<8; i++) {
          const sliceY = Math.random() * height;
          const sliceH = Math.random() * 40 + 5;
          const offsetX = (Math.random() - 0.5) * 60;
          ctx.drawImage(image, 0, sliceY, width, sliceH, offsetX, sliceY, width, sliceH);
        }
      }
    } else if (effect === 'chromatic') {
      ctx.filter = 'none';
      ctx.drawImage(image, 0, 0, width, height);
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.6;
      
      const offset = 15;
      ctx.filter = 'sepia(100%) hue-rotate(-50deg) saturate(300%)';
      ctx.drawImage(image, offset, 0, width, height);
      
      ctx.filter = 'sepia(100%) hue-rotate(150deg) saturate(300%)';
      ctx.drawImage(image, -offset, 0, width, height);
      
      ctx.globalAlpha = 1.0;
      ctx.globalCompositeOperation = 'source-over';
      ctx.filter = 'none';
    } else if (effect === 'neon') {
      ctx.filter = 'contrast(130%) saturate(180%) brightness(95%) hue-rotate(15deg)';
      ctx.drawImage(image, 0, 0, width, height);
      ctx.filter = 'none';
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#4ade80';
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    } else if (effect === 'thermal') {
      ctx.filter = 'contrast(160%) saturate(40%) brightness(115%)';
      ctx.drawImage(image, 0, 0, width, height);
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, 'rgba(59, 130, 246, 0.25)');
      gradient.addColorStop(0.5, 'rgba(251, 191, 36, 0.3)');
      gradient.addColorStop(1, 'rgba(239, 68, 68, 0.35)');
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over';
      ctx.filter = 'none';
    } else if (effect === 'noir') {
      ctx.filter = 'grayscale(100%) contrast(130%) brightness(88%)';
      ctx.drawImage(image, 0, 0, width, height);
      const vignette = ctx.createRadialGradient(width * 0.5, height * 0.5, width * 0.2, width * 0.5, height * 0.5, width * 0.75);
      vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vignette.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
      ctx.filter = 'none';
    }
  };

  const drawFrameBorder = (
    ctx: CanvasRenderingContext2D,
    polygon: Point[],
    angle: number,
    alpha: number,
    baseLineWidth: number,
    preset: EffectPreset,
  ) => {
    ctx.strokeStyle = `rgba(${preset.accentRgb}, ${alpha})`;
    ctx.lineWidth = baseLineWidth * (preset.lineWidthBoost ?? 1);
    ctx.setLineDash(preset.borderDash ?? []);
    drawWarpedPolygon(ctx, polygon, angle, distortionIntensityRef.current);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  const normalizeImageUrl = (rawUrl: string): string => {
    if (/^https?:\/\//i.test(rawUrl)) {
      return rawUrl;
    }
    return `${window.location.origin}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
  };

  const persistCapturedImage = async (imageDataUrl: string) => {
    setSaveState('saving');
    setCopyState('idle');
    setSaveErrorMessage(null);
    setSavedImageUrl(null);

    try {
      const response = await fetch('/api/images', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageDataUrl }),
      });

      const payload = (await response.json().catch(() => null)) as {
        imageUrl?: string;
        shareUrl?: string;
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error || `Upload failed: ${response.status}`);
      }

      const sharedUrl = payload.shareUrl ?? payload.imageUrl;
      if (!sharedUrl) {
        throw new Error('Missing image URL from server response');
      }

      setSavedImageUrl(normalizeImageUrl(sharedUrl));
      setSaveState('saved');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed.';
      console.error(error);
      setSaveState('error');
      setSaveErrorMessage(message);
      setSavedImageUrl(null);
    }
  };

  const shareOnFacebook = () => {
    if (!savedImageUrl) return;
    const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(savedImageUrl)}`;
    window.open(fbUrl, '_blank', 'noopener,noreferrer');
  };

  const copyShareLink = async () => {
    if (!savedImageUrl) return;
    try {
      await navigator.clipboard.writeText(savedImageUrl);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  };

  const drawWarpedPolygon = (ctx: CanvasRenderingContext2D, polygon: Point[], angle: number, intensity: number) => {
    ctx.beginPath();
    ctx.moveTo(polygon[0].x, polygon[0].y);
    for (let i = 0; i < 4; i++) {
      const p1 = polygon[i];
      const p2 = polygon[(i + 1) % 4];
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const nx = -dy / len;
      const ny = dx / len;
      
      // Twist effect: opposite sides bend in opposite directions relative to their normals
      const direction = (i % 2 === 0) ? 1 : -1;
      const warpAmount = angle * intensity * len * 0.2 * direction;
      
      const cx = midX + nx * warpAmount;
      const cy = midY + ny * warpAmount;
      
      ctx.quadraticCurveTo(cx, cy, p2.x, p2.y);
    }
    ctx.closePath();
  };

  const onResults = (results: Results) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    let canvasCtx = canvasCtxRef.current;
    if (!canvasCtx || canvasCtx.canvas !== canvas) {
      canvasCtx = canvas.getContext('2d');
      if (!canvasCtx) return;
      canvasCtxRef.current = canvasCtx;
    }

    if (canvas.width !== video.videoWidth) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    if (bgCanvasRef.current && bgCanvasRef.current.width !== video.videoWidth) {
      bgCanvasRef.current.width = video.videoWidth;
      bgCanvasRef.current.height = video.videoHeight;
    }

    const currentStep = stepRef.current;
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

    if (currentStep === 'result') {
      updateCountdown(null);
      return;
    }

    if (currentStep === 'aiming1' || currentStep === 'loading') {
      if (currentStep === 'loading') {
        setStep('aiming1');
        stepRef.current = 'aiming1';
      }

      // Draw mirrored video
      canvasCtx.save();
      canvasCtx.translate(canvas.width, 0);
      canvasCtx.scale(-1, 1);
      canvasCtx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
      canvasCtx.restore();

      const currentFrameData = smoothFrameData(getCurrentFrameData(results, canvas));

      frameDataRef.current = currentFrameData;
      syncHasFrame(currentFrameData !== null);

      if (currentFrameData) {
        const activePreset = getEffectPreset(portalEffectRef.current);
        const now = Date.now();
        const stable = isFrameStable(currentFrameData, now);

        const { rect: currentRect, polygon, angle } = currentFrameData;
        let elapsed = 0;
        let progress = 0;

        if (stable) {
          if (!holdStartTimeRef.current) {
            holdStartTimeRef.current = now;
          }
          elapsed = now - holdStartTimeRef.current;
          progress = Math.min(1, elapsed / 3000);
          updateCountdown(Math.max(0, Math.ceil(3 - elapsed / 1000)));
        } else {
          holdStartTimeRef.current = null;
          updateCountdown(null);
        }

        if (elapsed >= 3000 && !isCapturingRef.current) {
          isCapturingRef.current = true;
          setTimeout(() => capture1(), 0);
        }

        // Draw X-ray portal with twisted polygon
        canvasCtx.save();
        drawWarpedPolygon(canvasCtx, polygon, angle, distortionIntensityRef.current);
        canvasCtx.clip();
        
        canvasCtx.translate(canvas.width, 0);
        canvasCtx.scale(-1, 1);
        
        drawPortalEffect(canvasCtx, results.image, portalEffectRef.current, canvas.width, canvas.height);
        
        canvasCtx.restore();

        // Calculate pulse effect for border
        const time = Date.now();
        const pulse = (Math.sin(time / 150) + 1) / 2; // 0 to 1
        const alpha = 0.4 + 0.6 * pulse; // 0.4 to 1.0
        const lineWidth = 3 + 2 * pulse; // 3 to 5

        // Draw polygon border
        drawFrameBorder(canvasCtx, polygon, angle, alpha, lineWidth, activePreset);

        // Draw progress border
        if (progress > 0) {
          drawCaptureProgress(canvasCtx, currentRect, progress, elapsed, activePreset.accentRgb);
        } else {
          canvasCtx.fillStyle = `rgba(${activePreset.accentRgb}, 1)`;
          canvasCtx.font = 'bold 20px sans-serif';
          canvasCtx.textAlign = 'center';
          canvasCtx.fillText('Giữ khung ổn định để bắt đầu đếm', currentRect.x + currentRect.w / 2, currentRect.y - 15);
        }
      } else {
        holdStartTimeRef.current = null;
        updateCountdown(null);
        resetFrameStability();
      }
    } else if (currentStep === 'aiming2') {
      if (bgCanvasRef.current) {
        canvasCtx.save();
        if (bgPortalCenterRef.current && capture1TimeRef.current) {
          const { x, y } = bgPortalCenterRef.current;
          const elapsed = Date.now() - capture1TimeRef.current;
          const progress = Math.min(elapsed / 800, 1); // 800ms duration
          const easeOut = 1 - Math.pow(1 - progress, 3);
          const scale = 1 + (0.15 * easeOut); // 15% zoom
          
          canvasCtx.translate(x, y);
          canvasCtx.scale(scale, scale);
          canvasCtx.translate(-x, -y);
        }
        canvasCtx.drawImage(bgCanvasRef.current, 0, 0);
        canvasCtx.restore();
      }

      const frameData = frameModeRef.current === 'locked'
        ? lockedFrameDataRef.current
        : smoothFrameData(getCurrentFrameData(results, canvas));
      frameDataRef.current = frameData;
      syncHasFrame(frameData !== null);

      if (frameData) {
        const activePreset = getEffectPreset(portalEffectRef.current);
        const now = Date.now();
        const stable = frameModeRef.current === 'locked' ? true : isFrameStable(frameData, now);
        let elapsed = 0;
        let progress = 0;

        if (stable) {
          if (!holdStartTimeRef.current) {
            holdStartTimeRef.current = now;
          }
          elapsed = now - holdStartTimeRef.current;
          progress = Math.min(elapsed / 3000, 1);
          updateCountdown(Math.max(0, Math.ceil(3 - elapsed / 1000)));
        } else {
          holdStartTimeRef.current = null;
          updateCountdown(null);
        }

        if (progress === 1 && !isCapturingRef.current) {
          isCapturingRef.current = true;
          setTimeout(() => capture2(), 0);
        }

        const { polygon, angle, rect: currentRect } = frameData;
        
        canvasCtx.save();
        drawWarpedPolygon(canvasCtx, polygon, angle, distortionIntensityRef.current);
        canvasCtx.clip();

        canvasCtx.translate(canvas.width, 0);
        canvasCtx.scale(-1, 1);
        drawPortalEffect(canvasCtx, results.image, portalEffectRef.current, canvas.width, canvas.height);
        canvasCtx.restore();

        // Calculate pulse effect for border
        const time = Date.now();
        const pulse = (Math.sin(time / 150) + 1) / 2; // 0 to 1
        const alpha = 0.4 + 0.6 * pulse; // 0.4 to 1.0
        const lineWidth = 3 + 2 * pulse; // 3 to 5

        drawFrameBorder(canvasCtx, polygon, angle, alpha, lineWidth, activePreset);

        // Draw progress border
        if (progress > 0) {
          drawCaptureProgress(canvasCtx, currentRect, progress, elapsed, activePreset.accentRgb);
        } else if (frameModeRef.current === 'realtime') {
          canvasCtx.fillStyle = `rgba(${activePreset.accentRgb}, 1)`;
          canvasCtx.font = 'bold 20px sans-serif';
          canvasCtx.textAlign = 'center';
          canvasCtx.fillText('Giữ khung ổn định để bắt đầu đếm', currentRect.x + currentRect.w / 2, currentRect.y - 15);
        }
      } else {
        holdStartTimeRef.current = null;
        updateCountdown(null);
        resetFrameStability();
      }
    }
  };

  const capture1 = () => {
    if (!frameDataRef.current || !bgCanvasRef.current || !videoRef.current) {
      isCapturingRef.current = false;
      return;
    }
    isCapturingRef.current = true;
    lockedFrameDataRef.current = frameDataRef.current;

    const bgCtx = bgCanvasRef.current.getContext('2d');
    if (bgCtx) {
      bgCtx.save();
      bgCtx.translate(bgCanvasRef.current.width, 0);
      bgCtx.scale(-1, 1);
      bgCtx.drawImage(videoRef.current, 0, 0, bgCanvasRef.current.width, bgCanvasRef.current.height);
      bgCtx.restore();
    }

    bgPortalCenterRef.current = { x: frameDataRef.current.cx, y: frameDataRef.current.cy };
    capture1TimeRef.current = Date.now();
    resetFrameStability();
    smoothedFrameDataRef.current = null;

    // Reset refs for aiming2 auto-capture
    holdStartTimeRef.current = null;
    isCapturingRef.current = false;
    updateCountdown(null);

    setStep('aiming2');
    stepRef.current = 'aiming2';
  };

  const capture2 = () => {
    if (!canvasRef.current || !bgCanvasRef.current || !videoRef.current || !frameDataRef.current) {
      isCapturingRef.current = false;
      return;
    }
    isCapturingRef.current = true;

    const finalCtx = canvasRef.current.getContext('2d');
    if (finalCtx) {
      const { polygon, angle } = frameDataRef.current;
      const activePreset = getEffectPreset(portalEffectRef.current);
      
      finalCtx.save();
      if (bgPortalCenterRef.current) {
        const { x, y } = bgPortalCenterRef.current;
        finalCtx.translate(x, y);
        finalCtx.scale(1.15, 1.15);
        finalCtx.translate(-x, -y);
      }
      finalCtx.drawImage(bgCanvasRef.current, 0, 0);
      finalCtx.restore();

      finalCtx.save();
      drawWarpedPolygon(finalCtx, polygon, angle, distortionIntensityRef.current);
      finalCtx.clip();

      finalCtx.translate(canvasRef.current.width, 0);
      finalCtx.scale(-1, 1);
      drawPortalEffect(finalCtx, videoRef.current, portalEffectRef.current, canvasRef.current.width, canvasRef.current.height);
      finalCtx.restore();

      drawFrameBorder(finalCtx, polygon, angle, 1, 4, activePreset);
    }

    const dataUrl = canvasRef.current.toDataURL('image/png');
    const uploadDataUrl = canvasRef.current.toDataURL('image/jpeg', 0.86);
    setFinalImage(dataUrl);
    void persistCapturedImage(uploadDataUrl);
    updateCountdown(null);
    syncHasFrame(false);
    setStep('result');
    stepRef.current = 'result';
  };

  const retryCamera = () => {
    setCameraError(null);
    setFinalImage(null);
    setSavedImageUrl(null);
    setSaveState('idle');
    setSaveErrorMessage(null);
    setCopyState('idle');
    lockedFrameDataRef.current = null;
    smoothedFrameDataRef.current = null;
    resetFrameStability();
    frameDataRef.current = null;
    holdStartTimeRef.current = null;
    isCapturingRef.current = false;
    bgPortalCenterRef.current = null;
    capture1TimeRef.current = null;
    syncHasFrame(false);
    updateCountdown(null);
    setStep('loading');
    stepRef.current = 'loading';
    setInitAttempt((prev) => prev + 1);
  };

  const reset = () => {
    setCameraError(null);
    setFinalImage(null);
    setSavedImageUrl(null);
    setSaveState('idle');
    setSaveErrorMessage(null);
    setCopyState('idle');
    syncHasFrame(false);
    lockedFrameDataRef.current = null;
    smoothedFrameDataRef.current = null;
    resetFrameStability();
    frameDataRef.current = null;
    holdStartTimeRef.current = null;
    isCapturingRef.current = false;
    bgPortalCenterRef.current = null;
    capture1TimeRef.current = null;
    updateCountdown(null);
    setStep('aiming1');
    stepRef.current = 'aiming1';
  };

  const workflowStatus = cameraError
    ? 'Camera lỗi'
    : step === 'loading'
      ? 'Đang khởi động'
      : step === 'aiming1'
        ? (hasFrame ? (countdown !== null ? 'Khung ổn định - đang đếm' : 'Đã nhận khung - giữ ổn định') : 'Đang tìm khung tay')
        : step === 'aiming2'
          ? (frameMode === 'locked'
            ? (countdown !== null ? 'Khung khóa - đang đếm' : 'Khung đã khóa')
            : (hasFrame ? (countdown !== null ? 'Khung realtime - đang đếm' : 'Đã nhận khung realtime') : 'Đang tìm khung realtime'))
          : 'Hoàn tất';

          const activeEffectPreset = getEffectPreset(portalEffect);

  return (
    <main className="app-shell relative flex h-screen w-full flex-col items-center justify-center overflow-hidden text-[var(--text-primary)]">
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {a11yStatus}
      </div>

      <a
        href="https://hailamdev.space"
        target="_blank"
        rel="noopener noreferrer"
        className="author-chip absolute left-6 top-6 z-50"
        aria-label="Tác giả Nguyen Xuan Hai - mở hailamdev.space"
      >
        <img src="/Logo.jpg" alt="Logo Nguyen Xuan Hai" className="author-logo" />
        <span className="text-left leading-tight">
          <span className="font-display block text-[11px] uppercase tracking-[0.14em] text-slate-400">Author</span>
          <span className="block text-sm font-semibold text-slate-100">Nguyen Xuan Hai</span>
        </span>
      </a>

      <div className="workflow-chip absolute left-6 top-24 z-50 rounded-full px-4 py-2 text-xs font-semibold uppercase text-cyan-100">
        {workflowStatus}
      </div>

      <div className="absolute top-6 right-6 z-50 flex gap-4">
        <button
          type="button"
          onClick={cycleEffect}
          className="icon-chip flex items-center gap-2 rounded-full px-4 py-3 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
          title="Đổi hiệu ứng cổng"
          aria-label={`Đổi hiệu ứng cổng, hiệu ứng hiện tại là ${activeEffectPreset.label}`}
        >
          <Wand2 size={24} aria-hidden="true" />
          <span className="font-display text-sm font-bold uppercase tracking-wider text-amber-300">{activeEffectPreset.label}</span>
        </button>

        <button
          type="button"
          onClick={() => setShowSettings(!showSettings)}
          className="icon-chip rounded-full p-3 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
          aria-label={showSettings ? 'Đóng cài đặt AI' : 'Mở cài đặt AI'}
          aria-expanded={showSettings}
          aria-controls="settings-panel"
        >
          <Settings size={24} aria-hidden="true" />
        </button>
      </div>

      {showSettings && (
        <div
          id="settings-panel"
          role="region"
          aria-label="Cấu hình AI"
          className="settings-sheet absolute right-6 top-20 z-50 w-72 rounded-2xl p-5 text-white"
        >
          <h3 className="font-display mb-4 text-sm font-bold uppercase tracking-wider text-slate-200">Cấu hình AI</h3>
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-sm text-slate-200">Hiệu ứng Portal &amp; Khung</p>
              <div className="grid grid-cols-2 gap-2">
                {EFFECT_PRESETS.map((preset) => {
                  const isActive = preset.id === portalEffect;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setPortalEffectPreset(preset.id)}
                      aria-pressed={isActive}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                        isActive ? 'bg-cyan-600 text-white' : 'bg-slate-900/90 text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      <span>{preset.label}</span>
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: `rgb(${preset.accentRgb})` }}
                        aria-hidden="true"
                      />
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm text-slate-200">Chế độ khung bước 2</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFrameMode('locked')}
                  aria-pressed={frameMode === 'locked'}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                    frameMode === 'locked' ? 'bg-cyan-600 text-white' : 'bg-slate-900/90 text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  Locked
                </button>
                <button
                  type="button"
                  onClick={() => setFrameMode('realtime')}
                  aria-pressed={frameMode === 'realtime'}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                    frameMode === 'realtime' ? 'bg-cyan-600 text-white' : 'bg-slate-900/90 text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  Realtime
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="detection-confidence" className="flex justify-between text-sm mb-2">
                <span>Detection Confidence</span>
                <span className="font-mono text-cyan-300">{detectionConfidence.toFixed(2)}</span>
              </label>
              <input
                id="detection-confidence"
                name="detectionConfidence"
                type="range"
                min="0.1" max="1.0" step="0.05"
                value={detectionConfidence}
                onChange={(e) => setDetectionConfidence(parseFloat(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>
            <div>
              <label htmlFor="tracking-confidence" className="flex justify-between text-sm mb-2">
                <span>Tracking Confidence</span>
                <span className="font-mono text-cyan-300">{trackingConfidence.toFixed(2)}</span>
              </label>
              <input
                id="tracking-confidence"
                name="trackingConfidence"
                type="range"
                min="0.1" max="1.0" step="0.05"
                value={trackingConfidence}
                onChange={(e) => setTrackingConfidence(parseFloat(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>
            <div>
              <label htmlFor="distortion-intensity" className="flex justify-between text-sm mb-2">
                <span>Distortion (Warp)</span>
                <span className="font-mono text-cyan-300">{distortionIntensity.toFixed(1)}</span>
              </label>
              <input
                id="distortion-intensity"
                name="distortionIntensity"
                type="range"
                min="0" max="2" step="0.1"
                value={distortionIntensity}
                onChange={(e) => handleDistortionChange(parseFloat(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>
          </div>
        </div>
      )}

      <video ref={videoRef} className="hidden" playsInline aria-hidden="true" />
      <canvas ref={bgCanvasRef} className="hidden" aria-hidden="true" />

      {cameraError && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="settings-sheet w-full max-w-md rounded-2xl border border-rose-300/35 p-6 text-white">
            <h2 className="font-display text-lg font-bold text-rose-300">Không thể truy cập camera</h2>
            <p className="mt-2 text-sm text-slate-200">{cameraError}</p>
            <button
              type="button"
              onClick={retryCamera}
              className="cta mt-5 inline-flex items-center gap-2 rounded-full bg-rose-600 px-5 py-3 font-semibold text-white hover:bg-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            >
              <RefreshCcw size={18} aria-hidden="true" />
              Thử lại camera
            </button>
          </div>
        </div>
      )}

      {step !== 'result' && (
        <canvas
          ref={canvasRef}
          className="surface-frame max-h-full max-w-full object-contain"
          aria-label="Canvas camera realtime với portal"
        />
      )}

      {step === 'result' && finalImage && (
        <img
          src={finalImage}
          alt="Ảnh ghép portal cuối cùng"
          className="surface-frame max-h-full max-w-full object-contain"
        />
      )}

      {countdown !== null && step !== 'result' && !cameraError && (
        <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
          <span className="countdown-digit text-[15rem] font-black text-white animate-pulse motion-reduce:animate-none" aria-hidden="true">
            {countdown}
          </span>
        </div>
      )}

      <div className="absolute bottom-10 left-0 right-0 flex justify-center gap-4 z-10">
        {step === 'loading' && (
          <div className="workflow-chip rounded-full px-6 py-3 text-white animate-pulse motion-reduce:animate-none" role="status" aria-live="polite">
            Đang khởi động Camera & AI…
          </div>
        )}

        {step === 'aiming1' && (
          <button
            type="button"
            onClick={capture1}
            disabled={!hasFrame || !!cameraError}
            className={`cta inline-flex items-center gap-2 px-8 py-4 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 ${
              hasFrame && !cameraError
                ? 'cta-primary scale-105 motion-reduce:scale-100'
                : 'cta-disabled'
            }`}
          >
            <CameraIcon size={24} aria-hidden="true" />
            {hasFrame ? 'Chụp lần 1 (Hoặc giữ yên 3s)' : 'Đưa 2 tay tạo khung để chụp'}
          </button>
        )}

        {step === 'aiming2' && (
          <div className="flex gap-4">
            <button
              type="button"
              onClick={capture2}
              disabled={!hasFrame || !!cameraError}
              className={`cta inline-flex items-center gap-2 px-8 py-4 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 ${
                hasFrame && !cameraError
                  ? 'cta-success hover:scale-105 motion-reduce:hover:scale-100'
                  : 'cta-disabled'
              }`}
            >
              <CameraIcon size={24} aria-hidden="true" />
              Chụp ngay (Hoặc giữ yên 3s)
            </button>
            <button
              type="button"
              onClick={reset}
              className="cta cta-neutral inline-flex items-center gap-2 px-8 py-4 motion-reduce:transition-none hover:scale-105 motion-reduce:hover:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
            >
              <RefreshCcw size={24} aria-hidden="true" />
              Chụp lại từ đầu
            </button>
          </div>
        )}

        {step === 'result' && (
          <div className="flex flex-col items-center gap-3">
            <div className="flex gap-4">
              <a
                href={finalImage || '#'}
                download="xray-portal.png"
                className="cta cta-success inline-flex items-center gap-2 px-8 py-4 motion-reduce:transition-none hover:scale-105 motion-reduce:hover:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
              >
                <Download size={24} aria-hidden="true" />
                Tải ảnh xuống
              </a>
              <button
                type="button"
                onClick={reset}
                className="cta cta-download inline-flex items-center gap-2 px-8 py-4 motion-reduce:transition-none hover:scale-105 motion-reduce:hover:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
              >
                <RefreshCcw size={24} aria-hidden="true" />
                Chụp lại từ đầu
              </button>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={shareOnFacebook}
                disabled={!savedImageUrl || saveState === 'saving'}
                className={`cta inline-flex items-center gap-2 px-6 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 ${
                  savedImageUrl && saveState !== 'saving' ? 'cta-primary' : 'cta-disabled'
                }`}
              >
                Chia sẻ Facebook
              </button>
              <button
                type="button"
                onClick={copyShareLink}
                disabled={!savedImageUrl || saveState === 'saving'}
                className={`cta inline-flex items-center gap-2 px-6 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 ${
                  savedImageUrl && saveState !== 'saving' ? 'cta-neutral' : 'cta-disabled'
                }`}
              >
                {copyState === 'copied' ? 'Đã copy link' : 'Sao chép liên kết'}
              </button>
            </div>

            {saveState === 'saving' && <p className="text-xs text-cyan-200">Đang tự động lưu ảnh lên server...</p>}
            {saveState === 'saved' && savedImageUrl && (
              <p className="text-xs text-emerald-200">Đã lưu ảnh. Link chia sẻ sẵn sàng.</p>
            )}
            {saveState === 'error' && (
              <p className="text-xs text-rose-200">
                {saveErrorMessage
                  ? `Lưu server thất bại: ${saveErrorMessage}`
                  : 'Không thể lưu ảnh lên server. Bạn vẫn có thể tải ảnh xuống máy.'}
              </p>
            )}
          </div>
        )}
      </div>

      {step === 'aiming1' && (
        <div className="absolute top-10 left-0 right-0 flex justify-center pointer-events-none z-10">
          <div className="stage-card max-w-md px-8 py-4 text-center text-white">
            <h2 className="font-display mb-2 text-xl font-bold tracking-wide text-cyan-300">Bước 1: Tạo cổng không gian</h2>
            <p className="text-sm leading-relaxed text-slate-200">Dùng ngón trỏ và ngón cái của 2 bàn tay tạo thành một hình chữ nhật. Giữ yên 3 giây để tự động chụp.</p>
          </div>
        </div>
      )}

      {step === 'aiming2' && (
        <div className="absolute top-10 left-0 right-0 flex justify-center pointer-events-none z-10">
          <div className="stage-card max-w-md px-8 py-4 text-center text-white">
            <h2 className="font-display mb-2 text-xl font-bold tracking-wide text-emerald-300">Bước 2: Chụp xuyên không</h2>
            <p className="text-sm leading-relaxed text-slate-200">
              {frameMode === 'locked'
                ? 'Cảnh vật bên ngoài đã bị đóng băng. Khung đã khóa từ bước 1, hãy tạo dáng bên trong cổng và giữ yên 3 giây để tự động chụp.'
                : 'Cảnh vật bên ngoài đã bị đóng băng. Hãy tạo lại khung bằng 2 tay, giữ ổn định 3 giây để tự động chụp.'}
            </p>
          </div>
        </div>
      )}

      <footer className="absolute bottom-3 left-0 right-0 z-20 flex justify-center px-4">
        <p className="text-center text-xs text-slate-300/90">
          Built by Nguyen Xuan Hai ·
          {' '}
          <a
            href="https://hailamdev.space"
            target="_blank"
            rel="noopener noreferrer"
            className="author-link"
          >
            hailamdev.space
          </a>
        </p>
      </footer>
    </main>
  );
}
