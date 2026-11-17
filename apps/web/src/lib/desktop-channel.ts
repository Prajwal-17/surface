import { useEffect, useState } from "react";

export type DesktopChannel = "development" | "production";

/**
 * Read the channel from the Electron main process. Web-only builds return null,
 * so desktop identity markers stay out of the browser experience.
 */
export function useDesktopChannel(): DesktopChannel | null {
  const [channel, setChannel] = useState<DesktopChannel | null>(null);

  useEffect(() => {
    const appInfo = window.surfaceDesktop?.appInfo;
    if (!appInfo) return;
    let active = true;
    void appInfo()
      .then((info) => {
        if (active) setChannel(info.channel);
      })
      .catch(() => {
        /* The desktop marker is optional if the bridge is unavailable. */
      });
    return () => {
      active = false;
    };
  }, []);

  return channel;
}
