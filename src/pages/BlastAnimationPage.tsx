import React, { useEffect, useRef, useState } from 'react';
import { Camera as CameraIcon, RefreshCcw } from 'lucide-react';
import { Hands, Results } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';

const BLAST_DURATION_MS = 1300;
const BLAST_COOLDOWN_MS = 1800;

interface NormalizedPoint {
  x: number;
  y: number;
}

const normalizedDistance = (a: NormalizedPoint, b: NormalizedPoint) => {
  return Math.hypot(a.x - b.x, a.y - b.y);
};

const isFistLike = (hand: { x: number; y: number; z: number }[]) => {
  const wrist = hand[0];
  const indexMcp = hand[5];
  const pinkyMcp = hand[17];
  const palmWidth = Math.max(0.06, normalizedDistance(indexMcp, pinkyMcp));
  const tipIndices = [8, 12, 16, 20];
  const avgTipDistance = tipIndices.reduce((sum, idx) => {
    return sum + normalizedDistance(hand[idx], wrist);
  }, 0) / tipIndices.length;

  return avgTipDistance / palmWidth < 1.45;
};

const detectBlastCenter = (results: Results): NormalizedPoint | null => {
  if (!results.multiHandLandmarks || results.multiHandLandmarks.length !== 2) {
    return null;
  }

  const [handA, handB] = results.multiHandLandmarks;
  if (!isFistLike(handA) || !isFistLike(handB)) {
    return null;
  }

  const centerA = handA[9];
  const centerB = handB[9];
  const closeEnough = normalizedDistance(centerA, centerB) < 0.19;
  if (!closeEnough) return null;

  return {
    x: (centerA.x + centerB.x) / 2,
    y: (centerA.y + centerB.y) / 2,
  };
};

const drawMirrored = (
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  width: number,
  height: number,
) => {
  ctx.save();
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(image, 0, 0, width, height);
  ctx.restore();
};

const drawBlastEffect = (
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  width: number,
  height: number,
  progress: number,
  centerX: number,
  centerY: number,
) => {
  const suctionScale = Math.max(0.38, 1 - progress * 0.62);
  const spin = progress * Math.PI * 5;
  const ringRadius = 60 + progress * 180;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.82;
  ctx.translate(centerX, centerY);
  ctx.rotate(spin);
  ctx.scale(suctionScale, suctionScale);
  ctx.translate(-centerX, -centerY);
  ctx.filter = 'contrast(150%) saturate(180%) hue-rotate(30deg) brightness(110%)';
  drawMirrored(ctx, image, width, height);
  ctx.filter = 'none';
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  const radial = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, ringRadius * 1.5);
  radial.addColorStop(0, `rgba(251, 191, 36, ${0.45 - progress * 0.2})`);
  radial.addColorStop(0.4, `rgba(56, 189, 248, ${0.35 - progress * 0.18})`);
  radial.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = radial;
  ctx.beginPath();
  ctx.arc(centerX, centerY, ringRadius * 1.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(251, 191, 36, ${0.88 - progress * 0.55})`;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < 22; i += 1) {
    const theta = progress * 13 + i * (Math.PI / 11);
    const orbit = ringRadius * (0.62 + (i % 3) * 0.21);
    const px = centerX + Math.cos(theta) * orbit;
    const py = centerY + Math.sin(theta) * orbit;
    ctx.fillStyle = `rgba(34, 211, 238, ${0.7 - progress * 0.35})`;
    ctx.beginPath();
    ctx.arc(px, py, i % 2 === 0 ? 2.5 : 3.4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
};

export default function BlastAnimationPage() {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [initAttempt, setInitAttempt] = useState(0);
  const [blastActive, setBlastActive] = useState(false);
  const [statusText, setStatusText] = useState('Nắm 2 tay và đưa gần nhau để kích hoạt Chi Blast.');
  const [snapshot, setSnapshot] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef<Camera | null>(null);
  const handsRef = useRef<Hands | null>(null);
  const canvasCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const blastStartRef = useRef<number | null>(null);
  const blastCenterRef = useRef<{ x: number; y: number } | null>(null);
  const lastTriggerRef = useRef(0);
  const blastActiveRef = useRef(false);

  useEffect(() => {
    blastActiveRef.current = blastActive;
  }, [blastActive]);

  const triggerBlast = (cx?: number, cy?: number) => {
    const canvas = canvasRef.current;
    const fallbackX = canvas ? canvas.width / 2 : 0;
    const fallbackY = canvas ? canvas.height / 2 : 0;

    blastCenterRef.current = {
      x: cx ?? fallbackX,
      y: cy ?? fallbackY,
    };
    blastStartRef.current = Date.now();
    lastTriggerRef.current = Date.now();
    if (!blastActiveRef.current) {
      setBlastActive(true);
    }
    setStatusText('Chi Blast đã kích hoạt.');
  };

  useEffect(() => {
    const initMediaPipe = async () => {
      if (!videoRef.current) return;

      try {
        setCameraError(null);

        handsRef.current = new Hands({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });

        handsRef.current.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.7,
          minTrackingConfidence: 0.7,
        });

        handsRef.current.onResults((results) => {
          const canvas = canvasRef.current;
          const video = videoRef.current;
          if (!canvas || !video) return;

          let ctx = canvasCtxRef.current;
          if (!ctx || ctx.canvas !== canvas) {
            ctx = canvas.getContext('2d');
            if (!ctx) return;
            canvasCtxRef.current = ctx;
          }

          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }

          ctx.clearRect(0, 0, canvas.width, canvas.height);
          drawMirrored(ctx, results.image, canvas.width, canvas.height);

          const now = Date.now();
          const blastCenter = detectBlastCenter(results);
          if (blastCenter && now - lastTriggerRef.current > BLAST_COOLDOWN_MS) {
            const centerX = (1 - blastCenter.x) * canvas.width;
            const centerY = blastCenter.y * canvas.height;
            triggerBlast(centerX, centerY);
          }

          if (blastStartRef.current && blastCenterRef.current) {
            const progress = (now - blastStartRef.current) / BLAST_DURATION_MS;

            if (progress >= 1) {
              blastStartRef.current = null;
              if (blastActiveRef.current) {
                setBlastActive(false);
              }
              setStatusText('Sẵn sàng. Kích hoạt lại bằng gesture hoặc nút demo.');
            } else {
              drawBlastEffect(
                ctx,
                results.image,
                canvas.width,
                canvas.height,
                progress,
                blastCenterRef.current.x,
                blastCenterRef.current.y,
              );
            }
          }
        });

        cameraRef.current = new Camera(videoRef.current, {
          onFrame: async () => {
            if (videoRef.current && handsRef.current) {
              await handsRef.current.send({ image: videoRef.current });
            }
          },
          width: 1280,
          height: 720,
        });

        await cameraRef.current.start();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/notallowed|denied|permission/i.test(message)) {
          setCameraError('Bạn đã từ chối quyền camera cho Blast Animation.');
        } else {
          setCameraError('Không thể khởi tạo Blast Animation.');
        }
      }
    };

    void initMediaPipe();

    return () => {
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

  const captureSnapshot = () => {
    if (!canvasRef.current) return;
    setSnapshot(canvasRef.current.toDataURL('image/png'));
  };

  const retryCamera = () => {
    setCameraError(null);
    setInitAttempt((prev) => prev + 1);
  };

  return (
    <main className="app-shell min-h-screen w-full px-5 py-6 text-[var(--text-primary)] md:px-8">
      <header className="mx-auto mb-6 flex w-full max-w-6xl flex-wrap items-center justify-between gap-4">
        <a href="/" className="author-chip">
          <img src="/Logo.jpg" alt="Logo Nguyen Xuan Hai" className="author-logo" />
          <span className="text-sm font-semibold text-slate-100">Xray Portal</span>
        </a>

        <nav className="flex items-center gap-2">
          <a href="/" className="workflow-chip rounded-full px-4 py-2 text-xs text-slate-100">/</a>
          <a href="/photoboth" className="workflow-chip rounded-full px-4 py-2 text-xs text-slate-100">/photoboth</a>
          <a href="/blast-animation" className="workflow-chip rounded-full border-amber-300 px-4 py-2 text-xs text-amber-100">/blast-animation</a>
        </nav>
      </header>

      <section className="mx-auto grid w-full max-w-6xl gap-5 md:grid-cols-[1.65fr_1fr]">
        <div className="stage-card rounded-2xl p-3 md:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h1 className="font-display text-xl font-bold tracking-wide text-amber-300">Blast Animation</h1>
            <span className="workflow-chip rounded-full px-3 py-1 text-[11px] text-slate-100">
              {blastActive ? 'Chi Blast Active' : 'Standby'}
            </span>
          </div>

          <canvas
            ref={canvasRef}
            className="surface-frame h-[60vh] w-full object-cover"
            aria-label="Camera canvas cho blast animation"
          />
          <video ref={videoRef} className="hidden" playsInline muted aria-hidden="true" />

          {cameraError && <p className="mt-3 text-sm text-rose-200">{cameraError}</p>}

          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={() => triggerBlast()} className="cta cta-primary inline-flex items-center gap-2 px-6 py-3">
              <CameraIcon size={18} aria-hidden="true" />
              Demo Blast
            </button>

            <button type="button" onClick={captureSnapshot} className="cta cta-success inline-flex items-center gap-2 px-6 py-3">
              Chụp khung Blast
            </button>

            <button type="button" onClick={retryCamera} className="cta cta-neutral inline-flex items-center gap-2 px-6 py-3">
              <RefreshCcw size={18} aria-hidden="true" />
              Retry Camera
            </button>
          </div>
        </div>

        <aside className="stage-card rounded-2xl p-4">
          <h2 className="font-display mb-3 text-lg font-bold tracking-wide text-cyan-300">Gesture Rule</h2>
          <p className="text-sm leading-relaxed text-slate-200">
            Nắm bàn tay lại, đưa hai tay gần nhau ở giữa khung hình để kích hoạt animation xoáy vào tâm.
          </p>

          <div className="mt-4 rounded-xl border border-cyan-400/25 bg-slate-950/55 p-3">
            <p className="text-xs uppercase tracking-wider text-cyan-200">Status</p>
            <p className="mt-1 text-sm text-slate-100">{statusText}</p>
          </div>

          {snapshot && (
            <div className="mt-4 space-y-2">
              <p className="text-xs uppercase tracking-wider text-amber-200">Snapshot</p>
              <img src={snapshot} alt="Blast snapshot" className="surface-frame w-full rounded-lg object-cover" />
              <a href={snapshot} download="blast-animation.png" className="cta cta-download inline-flex items-center justify-center px-4 py-2 text-sm">
                Tải snapshot
              </a>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
