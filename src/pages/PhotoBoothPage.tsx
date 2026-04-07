import React, { useEffect, useRef, useState } from 'react';
import { Camera as CameraIcon, Download, RefreshCcw } from 'lucide-react';

const SHOT_COUNT = 3;
const SHOT_GAP_MS = 700;
const COUNTDOWN_SECONDS = 3;

type CapturePhase = 'idle' | 'countdown' | 'capturing' | 'done';

const wait = (ms: number) => new Promise<void>((resolve) => {
  window.setTimeout(resolve, ms);
});

export default function PhotoBoothPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const unmountedRef = useRef(false);

  const [phase, setPhase] = useState<CapturePhase>('idle');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [currentShot, setCurrentShot] = useState(0);
  const [shots, setShots] = useState<string[]>([]);
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
      }

      if (shotIndex < SHOT_COUNT - 1) {
        await wait(SHOT_GAP_MS);
      }
    }

    setCurrentShot(0);
    setCountdown(null);
    setPhase('done');
  };

  const reset = () => {
    setShots([]);
    setCurrentShot(0);
    setCountdown(null);
    setPhase('idle');
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
          <h2 className="font-display mb-3 text-lg font-bold tracking-wide text-amber-300">Shot Strip</h2>
          <p className="mb-4 text-sm text-slate-300">Mỗi lần bấm sẽ chụp 3 tấm liên tục. Tải từng tấm bên dưới.</p>

          <div className="space-y-3">
            {Array.from({ length: SHOT_COUNT }).map((_, index) => {
              const shot = shots[index];
              return (
                <div key={`shot-${index + 1}`} className="rounded-xl border border-slate-700/80 bg-slate-950/45 p-2">
                  <div className="mb-2 flex items-center justify-between text-xs text-slate-300">
                    <span>Tấm {index + 1}</span>
                    {shot && (
                      <a
                        href={shot}
                        download={`photobooth-${index + 1}.png`}
                        className="inline-flex items-center gap-1 text-cyan-200 hover:text-cyan-100"
                      >
                        <Download size={13} aria-hidden="true" />
                        Tải
                      </a>
                    )}
                  </div>

                  <div className="surface-frame h-24 w-full overflow-hidden rounded-lg bg-slate-900">
                    {shot ? (
                      <img src={shot} alt={`PhotoBooth shot ${index + 1}`} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">Chưa có ảnh</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </section>

      <canvas ref={captureCanvasRef} className="hidden" aria-hidden="true" />
    </main>
  );
}
