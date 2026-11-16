// Install BMServ: a popup on every phone and tablet after sign-in (and when the app is opened while signed
// in, unless "Not now" was chosen). The Install app button opens the browser's own install question when the
// browser offers one (Chrome and Edge on Android). Otherwise it turns the popup into the three taps for that
// phone: Share → Add to Home Screen on iPhone and iPad (Safari has no install question for websites), the
// browser menu → Install app on other Android browsers.
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, EllipsisVertical, Share, SquarePlus, Smartphone, WifiOff, X } from "lucide-react";
import { t } from "@bmserv/shared/terms";
import { useMe } from "../lib/hooks";
import { installLater, installLaterActive, isInstalled, isIos, isMobileDevice, promptInstall, useInstallOffer } from "../lib/install";
import { iconProps } from "./ui";

/** Wait a moment after the screen appears so the popup does not jump in front of it. */
const SHOW_AFTER_MS = 1200;

type View = "offer" | "iosSteps" | "androidSteps";

export function InstallPrompt() {
  const offer = useInstallOffer();
  const me = useMe();
  const titleId = useId();
  const [view, setView] = useState<View | null>(null);

  useEffect(() => {
    if (view || !isMobileDevice() || isInstalled() || installLaterActive()) return;
    const timer = window.setTimeout(() => setView("offer"), SHOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [view]);

  useEffect(() => {
    if (!view) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      installLater();
      setView(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);

  if (!view) return null;

  function later() {
    installLater();
    setView(null);
  }

  /** After the steps: hide for a day only, in case they did not finish. */
  function gotIt() {
    installLater("day");
    setView(null);
  }

  async function install() {
    if (offer) {
      const accepted = await promptInstall();
      if (!accepted) installLater();
      setView(null);
      return;
    }
    setView(isIos() ? "iosSteps" : "androidSteps");
  }

  const hospital = me.data?.hospital;
  const steps =
    view === "iosSteps"
      ? [
          { icon: Share, text: t.pwa.iosStep1 },
          { icon: SquarePlus, text: t.pwa.iosStep2 },
          { icon: Smartphone, text: t.pwa.iosStep3 },
        ]
      : [
          { icon: EllipsisVertical, text: t.pwa.androidStep1 },
          { icon: SquarePlus, text: t.pwa.androidStep2 },
          { icon: Smartphone, text: t.pwa.androidStep3 },
        ];

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

        {view === "offer" ? (
          <>
            <p className="install-intro">{t.pwa.installIntro}</p>
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
            <p className="install-intro">{view === "iosSteps" ? t.pwa.iosHow : t.pwa.androidHow}</p>
            <ol className="install-points install-steps">
              {steps.map((s) => (
                <li key={s.text}>
                  <span className="install-icon">
                    <s.icon {...iconProps} size={18} />
                  </span>
                  {s.text}
                </li>
              ))}
            </ol>
            <div className="install-actions">
              <button className="btn primary block" type="button" onClick={gotIt} autoFocus>
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
