// Install BMServ: a popup on phones and tablets after sign-in, with an Install app button on every phone.
// Android: the button opens the browser's own install question. iPhone and iPad give websites no install
// question, so there the button turns the popup into the three Add to Home Screen taps.
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, Share, SquarePlus, Smartphone, WifiOff, X } from "lucide-react";
import { t } from "@bmserv/shared/terms";
import { useMe } from "../lib/hooks";
import { installLater, installLaterActive, isInstalled, isIos, isMobileDevice, promptInstall, useInstallOffer } from "../lib/install";
import { iconProps } from "./ui";

/** Wait a moment after the screen appears so the popup does not jump in front of it. */
const SHOW_AFTER_MS = 1200;

export function InstallPrompt() {
  const offer = useInstallOffer();
  const me = useMe();
  const titleId = useId();
  const [open, setOpen] = useState<"install" | "ios" | "iosSteps" | null>(null);

  useEffect(() => {
    if (open || !isMobileDevice() || isInstalled() || installLaterActive()) return;
    const mode = offer ? "install" : isIos() ? "ios" : null;
    if (!mode) return;
    const timer = window.setTimeout(() => setOpen(mode), SHOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [offer, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      installLater();
      setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  function later() {
    installLater();
    setOpen(null);
  }

  async function install() {
    if (open === "ios") {
      setOpen("iosSteps");
      return;
    }
    const accepted = await promptInstall();
    if (!accepted) installLater();
    setOpen(null);
  }

  const hospital = me.data?.hospital;

  return createPortal(
    <>
      <div className="install-backdrop" onClick={later} />
      <div className="install-pop" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <button className="install-close" type="button" onClick={later} aria-label={t.pwa.close}>
          <X {...iconProps} />
        </button>
        <div className="install-app">
          <img src="/brand/icon-192.png" alt="" width={64} height={64} />
          <div>
            <h2 id={titleId}>{t.pwa.installTitle}</h2>
            {hospital && (
              <div className="muted secondary">
                {hospital.name}, {hospital.departmentName}
              </div>
            )}
          </div>
        </div>
        <p className="install-intro">{open === "iosSteps" ? t.pwa.iosHow : t.pwa.installIntro}</p>

        {open !== "iosSteps" ? (
          <>
            <ul className="install-points">
              <li>
                <span className="install-icon">
                  <Smartphone {...iconProps} size={18} />
                </span>
                {t.pwa.benefitHome}
              </li>
              <li>
                <span className="install-icon">
                  <Bell {...iconProps} size={18} />
                </span>
                {t.pwa.benefitNotify}
              </li>
              <li>
                <span className="install-icon">
                  <WifiOff {...iconProps} size={18} />
                </span>
                {t.pwa.benefitOffline}
              </li>
            </ul>
            <div className="install-actions">
              <button className="btn primary block" type="button" onClick={() => void install()} autoFocus>
                {t.pwa.installButton}
              </button>
              <button className="btn plain block" type="button" onClick={later}>
                {t.pwa.later}
              </button>
            </div>
          </>
        ) : (
          <>
            <ol className="install-points install-steps">
              <li>
                <span className="install-icon">
                  <Share {...iconProps} size={18} />
                </span>
                {t.pwa.iosStep1}
              </li>
              <li>
                <span className="install-icon">
                  <SquarePlus {...iconProps} size={18} />
                </span>
                {t.pwa.iosStep2}
              </li>
              <li>
                <span className="install-icon">
                  <Smartphone {...iconProps} size={18} />
                </span>
                {t.pwa.iosStep3}
              </li>
            </ol>
            <div className="install-actions">
              <button className="btn primary block" type="button" onClick={later} autoFocus>
                {t.pwa.gotIt}
              </button>
            </div>
          </>
        )}
      </div>
    </>,
    document.body,
  );
}
