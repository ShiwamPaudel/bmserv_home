import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import jsQR from "jsqr";
import { t } from "@bmserv/shared/terms";
import { get } from "../lib/api";
import { useMe, useTitle } from "../lib/hooks";
import { ReportForm } from "./Report";
import { LoadError, Loading, Notice, PageHead } from "../components/ui";

/** Reads a BMServ label with the camera; the QR holds {APP_URL}/e/{code}. */
export function Scan() {
  useTitle(t.scan.title);
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [notOurs, setNotOurs] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (!video.current || stopped) return;
        video.current.srcObject = stream;
        await video.current.play();
        loop();
      } catch {
        setError(t.scan.noCamera);
      }
    }
    function loop() {
      if (stopped) return;
      const v = video.current;
      if (v && ctx && v.readyState === v.HAVE_ENOUGH_DATA) {
        const w = 480;
        const h = Math.round((v.videoHeight / v.videoWidth) * w) || 480;
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(v, 0, 0, w, h);
        const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
        if (code?.data) {
          const m = /\/e\/([A-Za-z0-9]{6,20})\/?$/.exec(code.data.trim());
          if (m) {
            stopped = true;
            navigate(`/e/${m[1]}`, { replace: true });
            return;
          }
          setNotOurs(true);
        }
      }
      raf = requestAnimationFrame(loop);
    }
    void start();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [navigate]);

  return (
    <>
      <PageHead title={t.scan.title} />
      {error ? <Notice tone="bad">{error}</Notice> : <video ref={video} className="scan-video" playsInline muted aria-label={t.scan.title} />}
      {notOurs && <Notice tone="wait">{t.scan.notBmserv}</Notice>}
    </>
  );
}

/** /e/:qrCode — what a phone camera opens. Signs in first if needed (RequireAuth). */
export function QrOpen() {
  const { qrCode = "" } = useParams();
  const me = useMe();
  if (me.data?.user.role === "staff") return <ReportForm qrCode={qrCode} />;
  return <TeamQrOpen qrCode={qrCode} />;
}

function TeamQrOpen({ qrCode }: { qrCode: string }) {
  const q = useQuery({ queryKey: ["qr", qrCode], queryFn: () => get<{ id: string }>(`/equipment/by-qr/${encodeURIComponent(qrCode)}`), retry: false });
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <LoadError error={q.error} />;
  return <Navigate to={`/equipment/${q.data.id}?scanned=1`} replace />;
}
