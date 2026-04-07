import React, { useEffect, useRef, useState } from 'react';
import { Hands, Results } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import { Camera as CameraIcon, RefreshCcw, Settings, Download, Wand2 } from 'lucide-react';

type Step = 'loading' | 'aiming1' | 'aiming2' | 'result';

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

const XRAY_FILTER = 'invert(100%) sepia(100%) saturate(300%) hue-rotate(130deg) contrast(150%) brightness(120%)';

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
  const [portalEffect, setPortalEffect] = useState('xray');

  const stepRef = useRef<Step>('loading');
  const frameDataRef = useRef<FrameData | null>(null);
  const hasFrameRef = useRef(false);
  const holdStartTimeRef = useRef<number | null>(null);
  const isCapturingRef = useRef(false);
  const bgPortalCenterRef = useRef<{x: number, y: number} | null>(null);
  const capture1TimeRef = useRef<number | null>(null);
  const distortionIntensityRef = useRef(0.5);
  const portalEffectRef = useRef('xray');
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

  const handleDistortionChange = (val: number) => {
    setDistortionIntensity(val);
    distortionIntensityRef.current = val;
  };

  const cycleEffect = () => {
    const effects = ['xray', 'scanlines', 'glitch', 'chromatic'];
    const currentIndex = effects.indexOf(portalEffect);
    const nextIndex = (currentIndex + 1) % effects.length;
    setPortalEffect(effects[nextIndex]);
    portalEffectRef.current = effects[nextIndex];
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
      setA11yStatus('Bước 2. Tạo khung tay lần nữa để chụp ảnh hoàn chỉnh.');
    } else if (step === 'result') {
      setA11yStatus('Đã hoàn thành ảnh ghép. Bạn có thể tải ảnh xuống hoặc chụp lại.');
    }
  }, [step, cameraError]);

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

  const drawCaptureProgress = (
    canvasCtx: CanvasRenderingContext2D,
    currentRect: Rect,
    progress: number,
    elapsed: number,
  ) => {
    canvasCtx.strokeStyle = '#00ffff';
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

    canvasCtx.fillStyle = '#00ffff';
    canvasCtx.font = 'bold 24px sans-serif';
    canvasCtx.textAlign = 'center';
    canvasCtx.fillText(`Tự động chụp: ${Math.ceil(3 - elapsed / 1000)}s`, currentRect.x + currentRect.w / 2, currentRect.y - 15);
  };

  const drawPortalEffect = (ctx: CanvasRenderingContext2D, image: CanvasImageSource, effect: string, width: number, height: number) => {
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
    if (!canvasCtx) {
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

      const currentFrameData = getCurrentFrameData(results, canvas);

      frameDataRef.current = currentFrameData;
      syncHasFrame(currentFrameData !== null);

      if (currentFrameData) {
        const { rect: currentRect, polygon, angle } = currentFrameData;
        if (!holdStartTimeRef.current) {
          holdStartTimeRef.current = Date.now();
        }
        const elapsed = Date.now() - holdStartTimeRef.current;
        const progress = Math.min(1, elapsed / 3000);
        updateCountdown(Math.max(0, Math.ceil(3 - elapsed / 1000)));

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
        canvasCtx.strokeStyle = `rgba(0, 255, 255, ${alpha})`;
        canvasCtx.lineWidth = lineWidth;
        drawWarpedPolygon(canvasCtx, polygon, angle, distortionIntensityRef.current);
        canvasCtx.stroke();

        // Draw progress border
        if (progress > 0) {
          drawCaptureProgress(canvasCtx, currentRect, progress, elapsed);
        }
      } else {
        holdStartTimeRef.current = null;
        updateCountdown(null);
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

      const frameData = getCurrentFrameData(results, canvas);
      frameDataRef.current = frameData;
      syncHasFrame(frameData !== null);

      if (frameData) {
        if (!holdStartTimeRef.current) {
          holdStartTimeRef.current = Date.now();
        }
        const elapsed = Date.now() - holdStartTimeRef.current;
        const progress = Math.min(elapsed / 3000, 1);
        updateCountdown(Math.max(0, Math.ceil(3 - elapsed / 1000)));

        if (progress === 1 && !isCapturingRef.current) {
          isCapturingRef.current = true;
          setTimeout(() => capture2(), 0);
        }

        const { polygon, angle, rect: currentRect } = frameData;
        
        canvasCtx.save();
        drawWarpedPolygon(canvasCtx, polygon, angle, distortionIntensityRef.current);
        canvasCtx.clip();

        // Removed XRAY_FILTER for aiming2 to show normal camera
        
        canvasCtx.translate(canvas.width, 0);
        canvasCtx.scale(-1, 1);
        canvasCtx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
        canvasCtx.restore();

        // Calculate pulse effect for border
        const time = Date.now();
        const pulse = (Math.sin(time / 150) + 1) / 2; // 0 to 1
        const alpha = 0.4 + 0.6 * pulse; // 0.4 to 1.0
        const lineWidth = 3 + 2 * pulse; // 3 to 5

        canvasCtx.strokeStyle = `rgba(0, 255, 255, ${alpha})`;
        canvasCtx.lineWidth = lineWidth;
        drawWarpedPolygon(canvasCtx, polygon, angle, distortionIntensityRef.current);
        canvasCtx.stroke();

        // Draw progress border
        if (progress > 0) {
          drawCaptureProgress(canvasCtx, currentRect, progress, elapsed);
        }
      } else {
        holdStartTimeRef.current = null;
        updateCountdown(null);
      }
    }
  };

  const capture1 = () => {
    if (!frameDataRef.current || !bgCanvasRef.current || !videoRef.current) {
      isCapturingRef.current = false;
      return;
    }
    isCapturingRef.current = true;

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
      
      // Removed XRAY_FILTER for capture2 to show normal camera
      
      finalCtx.translate(canvasRef.current.width, 0);
      finalCtx.scale(-1, 1);
      finalCtx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
      finalCtx.restore();

      finalCtx.strokeStyle = '#00ffff';
      finalCtx.lineWidth = 4;
      drawWarpedPolygon(finalCtx, polygon, angle, distortionIntensityRef.current);
      finalCtx.stroke();
    }

    const dataUrl = canvasRef.current.toDataURL('image/png');
    setFinalImage(dataUrl);
    updateCountdown(null);
    syncHasFrame(false);
    setStep('result');
    stepRef.current = 'result';
  };

  const retryCamera = () => {
    setCameraError(null);
    setFinalImage(null);
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
    syncHasFrame(false);
    frameDataRef.current = null;
    holdStartTimeRef.current = null;
    isCapturingRef.current = false;
    bgPortalCenterRef.current = null;
    capture1TimeRef.current = null;
    updateCountdown(null);
    setStep('aiming1');
    stepRef.current = 'aiming1';
  };

  return (
    <main className="relative w-full h-screen bg-neutral-950 flex flex-col items-center justify-center overflow-hidden font-sans">
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {a11yStatus}
      </div>

      <div className="absolute top-6 right-6 z-50 flex gap-4">
        <button
          type="button"
          onClick={cycleEffect}
          className="flex items-center gap-2 px-4 py-3 bg-neutral-800/80 hover:bg-neutral-700 text-white rounded-full backdrop-blur transition-colors shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
          title="Đổi hiệu ứng cổng"
          aria-label={`Đổi hiệu ứng cổng, hiệu ứng hiện tại là ${portalEffect}`}
        >
          <Wand2 size={24} aria-hidden="true" />
          <span className="font-bold text-sm uppercase tracking-wider text-cyan-400">{portalEffect}</span>
        </button>

        <button
          type="button"
          onClick={() => setShowSettings(!showSettings)}
          className="p-3 bg-neutral-800/80 hover:bg-neutral-700 text-white rounded-full backdrop-blur transition-colors shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
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
          className="absolute top-20 right-6 bg-neutral-900/90 backdrop-blur border border-neutral-700 p-5 rounded-2xl z-50 text-white w-72 shadow-2xl"
        >
          <h3 className="font-bold mb-4 text-sm text-neutral-300 uppercase tracking-wider">Cấu hình AI</h3>
          <div className="space-y-5">
            <div>
              <label htmlFor="detection-confidence" className="flex justify-between text-sm mb-2">
                <span>Detection Confidence</span>
                <span className="text-blue-400 font-mono">{detectionConfidence.toFixed(2)}</span>
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
                <span className="text-blue-400 font-mono">{trackingConfidence.toFixed(2)}</span>
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
                <span className="text-blue-400 font-mono">{distortionIntensity.toFixed(1)}</span>
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
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-2xl border border-red-400/40 bg-neutral-900 p-6 text-white shadow-2xl">
            <h2 className="text-lg font-bold text-red-300">Không thể truy cập camera</h2>
            <p className="mt-2 text-sm text-neutral-200">{cameraError}</p>
            <button
              type="button"
              onClick={retryCamera}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-3 font-semibold text-white transition-colors hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900"
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
          className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
          aria-label="Canvas camera realtime với portal"
        />
      )}

      {step === 'result' && finalImage && (
        <img
          src={finalImage}
          alt="Ảnh ghép portal cuối cùng"
          className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
        />
      )}

      {countdown !== null && step !== 'result' && !cameraError && (
        <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
          <span className="text-[15rem] font-black text-white drop-shadow-[0_0_40px_rgba(0,255,255,0.8)] animate-pulse motion-reduce:animate-none" aria-hidden="true">
            {countdown}
          </span>
        </div>
      )}

      <div className="absolute bottom-10 left-0 right-0 flex justify-center gap-4 z-10">
        {step === 'loading' && (
          <div className="text-white bg-black/60 px-6 py-3 rounded-full animate-pulse motion-reduce:animate-none border border-white/10 backdrop-blur-md" role="status" aria-live="polite">
            Đang khởi động Camera & AI…
          </div>
        )}

        {step === 'aiming1' && (
          <button
            type="button"
            onClick={capture1}
            disabled={!hasFrame || !!cameraError}
            className={`flex items-center gap-2 px-8 py-4 rounded-full font-bold transition-colors duration-300 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 ${
              hasFrame && !cameraError
                ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.6)] scale-105 motion-reduce:scale-100'
                : 'bg-neutral-800 text-neutral-400 cursor-not-allowed border border-neutral-700'
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
              className={`flex items-center gap-2 px-8 py-4 rounded-full font-bold transition-colors duration-300 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 ${
                hasFrame && !cameraError
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.6)] hover:scale-105 motion-reduce:hover:scale-100'
                  : 'bg-neutral-800 text-neutral-400 cursor-not-allowed border border-neutral-700'
              }`}
            >
              <CameraIcon size={24} aria-hidden="true" />
              Chụp ngay (Hoặc giữ yên 3s)
            </button>
            <button
              type="button"
              onClick={reset}
              className="flex items-center gap-2 px-8 py-4 rounded-full font-bold bg-neutral-700 hover:bg-neutral-600 text-white shadow-[0_0_20px_rgba(0,0,0,0.6)] transition-colors duration-300 motion-reduce:transition-none hover:scale-105 motion-reduce:hover:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
            >
              <RefreshCcw size={24} aria-hidden="true" />
              Chụp lại từ đầu
            </button>
          </div>
        )}

        {step === 'result' && (
          <div className="flex gap-4">
            <a
              href={finalImage || '#'}
              download="xray-portal.png"
              className="flex items-center gap-2 px-8 py-4 rounded-full font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.6)] transition-colors duration-300 motion-reduce:transition-none hover:scale-105 motion-reduce:hover:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
            >
              <Download size={24} aria-hidden="true" />
              Tải ảnh xuống
            </a>
            <button
              type="button"
              onClick={reset}
              className="flex items-center gap-2 px-8 py-4 rounded-full font-bold bg-white text-black hover:bg-gray-200 transition-colors duration-300 motion-reduce:transition-none hover:scale-105 motion-reduce:hover:scale-100 shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
            >
              <RefreshCcw size={24} aria-hidden="true" />
              Chụp lại từ đầu
            </button>
          </div>
        )}
      </div>

      {step === 'aiming1' && (
        <div className="absolute top-10 left-0 right-0 flex justify-center pointer-events-none z-10">
          <div className="bg-black/70 text-white px-8 py-4 rounded-2xl backdrop-blur-md text-center max-w-md border border-white/10 shadow-2xl">
            <h2 className="font-bold text-xl text-blue-400 mb-2 tracking-wide">Bước 1: Tạo cổng không gian</h2>
            <p className="text-sm text-neutral-300 leading-relaxed">Dùng ngón trỏ và ngón cái của 2 bàn tay tạo thành một hình chữ nhật. Giữ yên 3 giây để tự động chụp.</p>
          </div>
        </div>
      )}

      {step === 'aiming2' && (
        <div className="absolute top-10 left-0 right-0 flex justify-center pointer-events-none z-10">
          <div className="bg-black/70 text-white px-8 py-4 rounded-2xl backdrop-blur-md text-center max-w-md border border-white/10 shadow-2xl">
            <h2 className="font-bold text-xl text-emerald-400 mb-2 tracking-wide">Bước 2: Chụp xuyên không</h2>
            <p className="text-sm text-neutral-300 leading-relaxed">Cảnh vật bên ngoài đã bị đóng băng. Hãy tạo dáng bên trong cổng và giữ yên 3 giây để tự động chụp.</p>
          </div>
        </div>
      )}
    </main>
  );
}
