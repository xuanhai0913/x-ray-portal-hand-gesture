import React, { useEffect, useRef, useState } from 'react';
import { Camera as CameraIcon, Download, RefreshCcw } from 'lucide-react';

const SHOT_COUNT = 3;
const SHOT_GAP_MS = 700;
const COUNTDOWN_SECONDS = 3;

type CapturePhase = 'idle' | 'countdown' | 'capturing' | 'done';

const wait = (ms: number) => new Promise<void>((resolve) => {
  window.setTimeout(resolve, ms);
});

const loadImageElement = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('Unable to load shot image for strip.'));
  img.src = src;
});

const drawRoundedRectPath = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
};

const drawCoverImage = (
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) => {
  const srcRatio = image.width / image.height;
  const dstRatio = width / height;

  let sx = 0;
  let sy = 0;
  let sw = image.width;
  let sh = image.height;

  if (srcRatio > dstRatio) {
    sw = image.height * dstRatio;
    sx = (image.width - sw) / 2;
  } else {
    sh = image.width / dstRatio;
    sy = (image.height - sh) / 2;
  }

  ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
};

const composePhotoStrip = async (frameUrls: string[], timestamp: string): Promise<string | null> => {
  if (frameUrls.length === 0) return null;

  const images = await Promise.all(frameUrls.map((url) => loadImageElement(url)));

  const slotWidth = 430;
  const slotHeight = 250;
  const framePadding = 34;
  const rowGap = 16;
  const headerHeight = 70;
  const footerHeight = 80;

  const width = framePadding * 2 + slotWidth;
  const height = framePadding + headerHeight + images.length * slotHeight + (images.length - 1) * rowGap + footerHeight;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const stripGradient = ctx.createLinearGradient(0, 0, 0, height);
  stripGradient.addColorStop(0, '#fefefe');
  stripGradient.addColorStop(1, '#e5e7eb');
  ctx.fillStyle = stripGradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#d1d5db';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  ctx.font = '700 30px "Chakra Petch", sans-serif';
  ctx.fillText('PHOTOBOOTH', width / 2, framePadding + 30);
  ctx.font = '600 12px "Be Vietnam Pro", sans-serif';
  ctx.fillStyle = '#334155';
  ctx.fillText('CAM.HAILAMDEV.SPACE', width / 2, framePadding + 52);

  const startY = framePadding + headerHeight;
  images.forEach((img, index) => {
    const y = startY + index * (slotHeight + rowGap);
    drawRoundedRectPath(ctx, framePadding, y, slotWidth, slotHeight, 16);
    ctx.save();
    ctx.clip();
    drawCoverImage(ctx, img, framePadding, y, slotWidth, slotHeight);
    ctx.restore();

    ctx.strokeStyle = 'rgba(15, 23, 42, 0.3)';
    ctx.lineWidth = 1.5;
    drawRoundedRectPath(ctx, framePadding, y, slotWidth, slotHeight, 16);
    ctx.stroke();
  });

  ctx.fillStyle = '#0f172a';
  ctx.font = '600 13px "Be Vietnam Pro", sans-serif';
  ctx.fillText(timestamp, width / 2, height - 34);

  return canvas.toDataURL('image/png');
};

export default function PhotoBoothPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const unmountedRef = useRef(false);

  const [phase, setPhase] = useState<CapturePhase>('idle');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [currentShot, setCurrentShot] = useState(0);
  const [shots, setShots] = useState<string[]>([]);
  const [stripImage, setStripImage] = useState<string | null>(null);
  const [stripTimestamp, setStripTimestamp] = useState('');
  const [flashPulse, setFlashPulse] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    unmountedRef.current = false;

    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        if (unmountedRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setCameraError(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/notallowed|denied|permission/i.test(message)) {
          setCameraError('Bạn cần cấp quyền camera để dùng chế độ PhotoBooth.');
        } else {
          setCameraError('Không thể truy cập camera cho PhotoBooth.');
        }
      }
    };

    void initCamera();

    return () => {
      unmountedRef.current = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const captureFrame = (): string | null => {
    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
      return null;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    return canvas.toDataURL('image/png');
  };

  const startPhotoBooth = async () => {
    if (phase === 'countdown' || phase === 'capturing') return;
    if (!videoRef.current || videoRef.current.videoWidth === 0) {
      setCameraError('Camera chưa sẵn sàng. Hãy đợi một chút rồi thử lại.');
      return;
    }

    setShots([]);
    setStripImage(null);
    setStripTimestamp('');
    setCurrentShot(0);
    setCameraError(null);

    const nextShots: string[] = [];

    for (let shotIndex = 0; shotIndex < SHOT_COUNT; shotIndex += 1) {
      if (unmountedRef.current) return;

      setCurrentShot(shotIndex + 1);
      setPhase('countdown');

      for (let sec = COUNTDOWN_SECONDS; sec >= 1; sec -= 1) {
        setCountdown(sec);
        await wait(1000);
        if (unmountedRef.current) return;
      }

      setCountdown(null);
      setPhase('capturing');

      const shot = captureFrame();
      if (shot) {
        nextShots.push(shot);
        setShots([...nextShots]);
        setFlashPulse((value) => value + 1);
      }

      if (shotIndex < SHOT_COUNT - 1) {
        await wait(SHOT_GAP_MS);
      }
    }

    setCurrentShot(0);
    setCountdown(null);
    setPhase('done');

    const nowStamp = new Date().toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    setStripTimestamp(nowStamp);
    try {
      const strip = await composePhotoStrip(nextShots, nowStamp);
      if (!unmountedRef.current) {
        setStripImage(strip);
      }
    } catch {
      if (!unmountedRef.current) {
        setStripImage(null);
        setCameraError('Không thể dựng photo strip. Bạn vẫn có thể tải từng tấm.');
      }
    }
  };

  const reset = () => {
    setShots([]);
    setStripImage(null);
    setStripTimestamp('');
    setCurrentShot(0);
    setCountdown(null);
    setFlashPulse(0);
    setPhase('idle');
  };

  return (
    <main className="app-shell photobooth-page min-h-screen w-full px-5 py-6 text-[var(--text-primary)] md:px-8">
      <div className="pb-ambient" aria-hidden="true">
        <span className="pb-orb pb-orb-a" />
        <span className="pb-orb pb-orb-b" />
        <span className="pb-orb pb-orb-c" />
      </div>

      <header className="mx-auto mb-6 flex w-full max-w-6xl flex-wrap items-center justify-between gap-4">
        <a href="/" className="author-chip">
          <img src="/Logo.jpg" alt="Logo Nguyen Xuan Hai" className="author-logo" />
          <span className="text-sm font-semibold text-slate-100">Xray Portal</span>
        </a>

        <nav className="flex items-center gap-2">
          <a href="/" className="workflow-chip rounded-full px-4 py-2 text-xs text-slate-100">/</a>
          <a href="/photoboth" className="workflow-chip rounded-full border-cyan-300 px-4 py-2 text-xs text-cyan-100">/photoboth</a>
          <a href="/blast-animation" className="workflow-chip rounded-full px-4 py-2 text-xs text-slate-100">/blast-animation</a>
        </nav>
      </header>

      <section className="mx-auto grid w-full max-w-6xl gap-5 md:grid-cols-[1.7fr_1fr]">
        <div className="stage-card relative overflow-hidden rounded-2xl p-3 md:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h1 className="font-display text-xl font-bold tracking-wide text-cyan-300">PhotoBooth x3</h1>
            <span className="workflow-chip rounded-full px-3 py-1 text-[11px] text-slate-100">
              {phase === 'countdown' ? `Đang đếm ${countdown ?? ''}` : phase === 'capturing' ? 'Đang chụp' : phase === 'done' ? 'Hoàn tất' : 'Sẵn sàng'}
            </span>
          </div>

          <div className="relative">
            <video
              ref={videoRef}
              playsInline
              muted
              className="surface-frame h-[60vh] w-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />

            {countdown !== null && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="countdown-digit text-8xl font-black text-white">{countdown}</span>
              </div>
            )}

            {phase === 'capturing' && (
              <div className="absolute inset-0 border-4 border-amber-300/80" aria-hidden="true" />
            )}

            {flashPulse > 0 && <div key={`flash-${flashPulse}`} className="pb-flash-burst" aria-hidden="true" />}
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                void startPhotoBooth();
              }}
              disabled={!!cameraError || phase === 'countdown' || phase === 'capturing'}
              className={`cta inline-flex items-center gap-2 px-6 py-3 ${
                !cameraError && phase !== 'countdown' && phase !== 'capturing' ? 'cta-primary' : 'cta-disabled'
              }`}
            >
              <CameraIcon size={18} aria-hidden="true" />
              Chụp 3 tấm liên tục
            </button>

            <button type="button" onClick={reset} className="cta cta-neutral inline-flex items-center gap-2 px-6 py-3">
              <RefreshCcw size={18} aria-hidden="true" />
              Reset
            </button>
          </div>

          {cameraError && <p className="mt-3 text-sm text-rose-200">{cameraError}</p>}
          {!cameraError && currentShot > 0 && phase !== 'done' && (
            <p className="mt-3 text-sm text-amber-100">Đang chụp tấm {currentShot}/{SHOT_COUNT}</p>
          )}
        </div>

        <aside className="stage-card rounded-2xl p-4">
          <h2 className="font-display mb-3 text-lg font-bold tracking-wide text-amber-300">Photo Strip</h2>
          <p className="mb-4 text-sm text-slate-300">Kết quả xuất ra dạng thẻ dài 3 ảnh đặc trưng photobooth.</p>

          <div className="pb-strip-stage rounded-xl border border-slate-700/70 bg-slate-950/60 p-3">
            {stripImage ? (
              <img
                src={stripImage}
                alt="Photo strip 3 tấm"
                className="pb-strip-image mx-auto max-h-[62vh] w-auto max-w-full"
              />
            ) : (
              <div className="pb-strip-placeholder mx-auto">
                {Array.from({ length: SHOT_COUNT }).map((_, idx) => (
                  <div key={`placeholder-${idx + 1}`} className="pb-placeholder-frame" />
                ))}
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {stripImage && (
              <a
                href={stripImage}
                download={`photobooth-strip-${Date.now()}.png`}
                className="cta cta-download inline-flex items-center gap-2 px-4 py-2 text-sm"
              >
                <Download size={14} aria-hidden="true" />
                Tải photo strip
              </a>
            )}

            {shots.map((shot, index) => (
              <a
                key={`dl-${index + 1}`}
                href={shot}
                download={`photobooth-${index + 1}.png`}
                className="inline-flex items-center gap-1 rounded-full border border-cyan-300/35 px-3 py-1 text-xs text-cyan-100"
              >
                <Download size={12} aria-hidden="true" />
                Tấm {index + 1}
              </a>
            ))}
          </div>

          {stripTimestamp && <p className="mt-3 text-xs text-slate-400">Generated: {stripTimestamp}</p>}
        </aside>
      </section>

      <canvas ref={captureCanvasRef} className="hidden" aria-hidden="true" />
    </main>
  );
}
