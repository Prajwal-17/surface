/**
 * Build-time desktop channel. The value is replaced by esbuild from
 * SURFACE_DESKTOP_CHANNEL when scripts/build.mjs compiles the main process.
 *
 * A packaged binary must not switch channels at runtime, so the channel is a
 * compile-time constant rather than an environment variable read by Electron.
 */
export type DesktopChannel = "development" | "production";

declare const SURFACE_DESKTOP_CHANNEL_BUILD: DesktopChannel;

export const desktopChannel: DesktopChannel = SURFACE_DESKTOP_CHANNEL_BUILD;

export interface DesktopIdentity {
  channel: DesktopChannel;
  appName: string;
  productName: string;
  executableName: string;
  appId: string;
  desktopName: string;
}

export function desktopIdentity(
  channel: DesktopChannel = desktopChannel,
): DesktopIdentity {
  const development = channel === "development";
  return {
    channel,
    appName: development ? "Surface Dev" : "Surface",
    productName: development ? "Surface Dev" : "Surface",
    executableName: development ? "surface-dev" : "surface",
    appId: development ? "dev.surface.desktop.dev" : "dev.surface.desktop",
    desktopName: development ? "surface-dev.desktop" : "surface.desktop",
  };
}
