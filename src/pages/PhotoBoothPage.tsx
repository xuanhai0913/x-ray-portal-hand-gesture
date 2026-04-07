import React, { useEffect, useRef, useState } from 'react';
import { Camera as CameraIcon, Download, RefreshCcw } from 'lucide-react';

const SHOT_COUNT = 3;
const SHOT_GAP_MS = 700;
const COUNTDOWN_SECONDS = 3;

type CapturePhase = 'idle' | 'countdown' | 'capturing' | 'done';
type StripThemeId = 'classic' | 'bubblegum' | 'mint' | 'midnight';
type StickerPackId = 'none' | 'party' | 'y2k' | 'comic';

interface StripTheme {
  id: StripThemeId;
  label: string;
  paperTop: string;
  paperBottom: string;
  ink: string;
  line: string;
  accent: string;
}

interface StickerPack {
  id: StickerPackId;
  label: string;
  icons: string[];
}

const STRIP_THEMES: StripTheme[] = [
  {
    id: 'classic',
    label: 'Classic',
    paperTop: '#fefefe',
    paperBottom: '#e5e7eb',
    ink: '#0f172a',
    line: '#cbd5e1',
    accent: '#0ea5e9',
  },
  {
    id: 'bubblegum',
    label: 'Bubblegum',
    paperTop: '#ffe4f2',
    paperBottom: '#ffd0e6',
    ink: '#831843',
    line: '#f9a8d4',
    accent: '#db2777',
  },
  {
    id: 'mint',
    label: 'Mint',
    paperTop: '#dcfce7',
    paperBottom: '#bbf7d0',
    ink: '#14532d',
    line: '#86efac',
    accent: '#059669',
  },
  {
    id: 'midnight',
    label: 'Midnight',
    paperTop: '#1e293b',
    paperBottom: '#0f172a',
    ink: '#e2e8f0',
    line: '#475569',
    accent: '#38bdf8',
  },
];

const STICKER_PACKS: StickerPack[] = [
  { id: 'none', label: 'Không dùng', icons: [] },
  {
    id: 'party',
    label: 'Party',
    icons: [
      'https://api.iconify.design/mdi/party-popper.svg?color=%23f59e0b',
      'https://api.iconify.design/ph/confetti-fill.svg?color=%23ec4899',
      'https://api.iconify.design/mdi/star-four-points.svg?color=%2338bdf8',
    ],
  },
  {
    id: 'y2k',
    label: 'Y2K',
    icons: [
      'https://api.iconify.design/mdi/lightning-bolt.svg?color=%23fde047',
      'https://api.iconify.design/mdi/heart.svg?color=%23fb7185',
      'https://api.iconify.design/mdi/gamepad-variant.svg?color=%238b5cf6',
    ],
  },
  {
    id: 'comic',
    label: 'Comic',
    icons: [
      'https://api.iconify.design/mdi/emoticon-excited-outline.svg?color=%23f97316',
      'https://api.iconify.design/mdi/message-text-outline.svg?color=%230ea5e9',
      'https://api.iconify.design/mdi/star-circle.svg?color=%23facc15',
    ],
  },
];

const wait = (ms: number) => new Promise<void>((resolve) => {
  window.setTimeout(resolve, ms);
});

const stickerLibraryCache = new Map<string, Promise<HTMLImageElement>>();

const loadImageElement = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('Unable to load shot image for strip.'));
  img.src = src;
});

const loadStickerFromLibrary = (url: string): Promise<HTMLImageElement> => {
  const cached = stickerLibraryCache.get(url);
  if (cached) return cached;

  const task = (async () => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch sticker icon: ${response.status}`);
    }

    const svgMarkup = await response.text();
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
    return loadImageElement(dataUrl);
  })();

  stickerLibraryCache.set(url, task);
  return task;
};

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

const composePhotoStrip = async (
  frameUrls: string[],
  timestamp: string,
  theme: StripTheme,
  stickerPack: StickerPack,
): Promise<string | null> => {
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
  stripGradient.addColorStop(0, theme.paperTop);
  stripGradient.addColorStop(1, theme.paperBottom);
  ctx.fillStyle = stripGradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = theme.line;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

  for (let y = framePadding + 10; y < height - footerHeight + 12; y += 24) {
    ctx.fillStyle = theme.line;
    ctx.beginPath();
    ctx.arc(12, y, 3.5, 0, Math.PI * 2);
    ctx.arc(width - 12, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = theme.ink;
  ctx.textAlign = 'center';
  ctx.font = '700 30px "Chakra Petch", sans-serif';
  ctx.fillText('PHOTOBOOTH', width / 2, framePadding + 30);
  ctx.font = '600 12px "Be Vietnam Pro", sans-serif';
  ctx.fillStyle = theme.accent;
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

  if (stickerPack.icons.length > 0) {
    const stickerSlots = [
      { x: framePadding + 8, y: framePadding + 8, size: 34, rot: -0.3 },
      { x: width - framePadding - 22, y: framePadding + 16, size: 30, rot: 0.28 },
      { x: width - framePadding - 26, y: startY + slotHeight + 10, size: 28, rot: 0.32 },
      { x: framePadding + 10, y: startY + slotHeight * 2 + rowGap + 8, size: 30, rot: -0.22 },
      { x: width - framePadding - 18, y: height - footerHeight - 10, size: 32, rot: 0.24 },
    ];

    const loadedStickers = await Promise.allSettled(stickerPack.icons.map((url) => loadStickerFromLibrary(url)));
    const stickerImages = loadedStickers
      .filter((result): result is PromiseFulfilledResult<HTMLImageElement> => result.status === 'fulfilled')
      .map((result) => result.value);

    stickerImages.forEach((sticker, index) => {
      const slot = stickerSlots[index % stickerSlots.length];
      ctx.save();
      ctx.globalAlpha = 0.88;
      ctx.translate(slot.x, slot.y);
      ctx.rotate(slot.rot);
      ctx.drawImage(sticker, -slot.size / 2, -slot.size / 2, slot.size, slot.size);
      ctx.restore();
    });
  }

  ctx.fillStyle = theme.ink;
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
  const [stripThemeId, setStripThemeId] = useState<StripThemeId>('classic');
  const [stickerPackId, setStickerPackId] = useState<StickerPackId>('party');
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

    const selectedTheme = STRIP_THEMES.find((theme) => theme.id === stripThemeId) ?? STRIP_THEMES[0];
    const selectedStickerPack = STICKER_PACKS.find((pack) => pack.id === stickerPackId) ?? STICKER_PACKS[0];

    const nowStamp = new Date().toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    setStripTimestamp(nowStamp);
    try {
      const strip = await composePhotoStrip(nextShots, nowStamp, selectedTheme, selectedStickerPack);
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

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-cyan-300/20 bg-slate-950/45 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-cyan-200">Nền photo strip</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {STRIP_THEMES.map((theme) => {
                  const active = theme.id === stripThemeId;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => setStripThemeId(theme.id)}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                        active ? 'border-cyan-300 bg-cyan-500/20 text-cyan-100' : 'border-slate-600 text-slate-200 hover:border-cyan-400/60'
                      }`}
                    >
                      <span
                        className="h-3.5 w-6 rounded-full border border-slate-500/50"
                        style={{ background: `linear-gradient(135deg, ${theme.paperTop}, ${theme.paperBottom})` }}
                        aria-hidden="true"
                      />
                      {theme.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-amber-300/20 bg-slate-950/45 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-200">Sticker SVG (Icon library)</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {STICKER_PACKS.map((pack) => {
                  const active = pack.id === stickerPackId;
                  return (
                    <button
                      key={pack.id}
                      type="button"
                      onClick={() => setStickerPackId(pack.id)}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                        active ? 'border-amber-300 bg-amber-500/20 text-amber-100' : 'border-slate-600 text-slate-200 hover:border-amber-400/60'
                      }`}
                    >
                      {pack.icons[0] ? (
                        <img
                          src={pack.icons[0]}
                          alt=""
                          className="h-4 w-4"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          aria-hidden="true"
                        />
                      ) : (
                        <span className="h-4 w-4 rounded-full border border-slate-500/60" aria-hidden="true" />
                      )}
                      {pack.label}
                    </button>
                  );
                })}
              </div>
            </div>
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
