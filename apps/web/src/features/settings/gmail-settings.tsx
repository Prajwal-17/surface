import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const gmailKey = ["gmail-status"] as const;

function cleanIpcError(error: Error) {
  return error.message.replace(/^Error invoking remote method .*?: Error: /, "");
}

export function GmailSettings() {
  const desktop = window.surfaceDesktop;
  const client = useQueryClient();
  const [smtpEmail, setSmtpEmail] = useState("");
  const [smtpPending, setSmtpPending] = useState(false);
  const [smtpError, setSmtpError] = useState<string | null>(null);
  const smtpForm = useRef<HTMLFormElement>(null);
  const appInfo = useQuery({
    queryKey: ["desktop-app-info"],
    enabled: Boolean(desktop),
    queryFn: () => desktop!.appInfo(),
  });
  const status = useQuery({
    queryKey: gmailKey,
    enabled: Boolean(desktop?.gmailStatus),
    queryFn: () => desktop!.gmailStatus(),
  });
  const connection = useMutation({
    mutationFn: (action: "connect" | "disconnect") =>
      action === "connect"
        ? desktop!.connectGmail()
        : desktop!.disconnectGmail(),
    onSuccess: (record, action) => {
      client.setQueryData(gmailKey, record);
      if (action === "connect" && record.email) setSmtpEmail(record.email);
      if (action === "disconnect") {
        setSmtpEmail("");
        smtpForm.current?.reset();
      }
    },
  });
  const busy = connection.isPending || smtpPending;

  return (
    <section className="form-section space-y-5">
      <div className="space-y-1">
        <h2>Gmail</h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          Use Google OAuth to save Gmail drafts, or an app password to schedule
          SMTP messages. Credentials stay encrypted on this desktop.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span
          className={`size-2 rounded-full ${status.data?.email ? "bg-success" : "bg-muted-foreground/40"}`}
          aria-hidden="true"
        />
        {status.data?.email ? (
          <>
            <span className="text-muted-foreground">Connected as</span>
            <span className="font-medium">{status.data.email}</span>
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
              {status.data.connectionType === "smtp"
                ? "App password · SMTP"
                : "Google OAuth · Gmail API"}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">
            {status.data?.error ??
              (desktop?.gmailStatus
                ? "No Gmail account connected."
                : "Connect Gmail from the desktop app.")}
          </span>
        )}
      </div>

      {status.data?.available && (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy}
            onClick={() => connection.mutate("connect")}
          >
            {connection.isPending
              ? "Waiting for Google sign-in…"
              : status.data.connectionType === "oauth"
                ? "Reconnect or switch account"
                : "Connect with Google OAuth"}
          </Button>
          {status.data.email && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => connection.mutate("disconnect")}
            >
              Disconnect
            </Button>
          )}
        </div>
      )}
      {connection.error && (
        <p className="text-sm text-destructive" role="alert">
          {cleanIpcError(connection.error)}
        </p>
      )}

      {status.data?.available && (
        <div className="max-w-2xl space-y-2 rounded-lg border border-border bg-muted/20 p-3.5 text-xs leading-5">
          <p className="font-medium text-foreground">
            Google OAuth keeps Gmail drafts in sync
          </p>
          <p className="text-muted-foreground">
            The first OAuth connection needs a Google Desktop app client JSON.
            Choose the file, then sign in to Google in the browser that opens.
            The JSON identifies the app; it is not your email password.
          </p>
          <p className="text-muted-foreground">
            Create or download the Desktop app OAuth client from{" "}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-link underline underline-offset-4 hover:text-foreground"
            >
              Google Cloud credentials
            </a>
            . You can also set <code>SURFACE_GMAIL_CLIENT_FILE</code> before
            launching Surface.
          </p>
        </div>
      )}

      <div className="max-w-2xl space-y-3 border-t border-border pt-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Use a Google app password</h3>
          <p className="text-xs leading-5 text-muted-foreground">
            This connects through Gmail SMTP for scheduled sending. Drafts stay
            in Surface and are not copied into Gmail Drafts. Google requires
            2-Step Verification, and some managed or protected accounts do not
            offer app passwords.
          </p>
          <p className="text-xs leading-5 text-muted-foreground">
            Paste only the generated app password below, never your regular
            Google password. Surface verifies it with Gmail and stores it
            encrypted on this desktop.
          </p>
          <a
            href="https://myaccount.google.com/apppasswords"
            target="_blank"
            rel="noreferrer"
            className="inline-block text-xs font-medium text-link underline underline-offset-4 hover:text-foreground"
          >
            Create an app password in your Google Account
          </a>
        </div>

        {status.data?.available ? (
          <form
            ref={smtpForm}
            className="grid max-w-xl gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const values = new FormData(form);
              const credentials = {
                email: String(values.get("gmailEmail") ?? ""),
                appPassword: String(values.get("appPassword") ?? ""),
              };
              if (!desktop) return;
              setSmtpPending(true);
              setSmtpError(null);
              try {
                const record = await desktop.connectGmailSmtp(credentials);
                client.setQueryData(gmailKey, record);
                setSmtpEmail(record.email ?? credentials.email);
                form.reset();
              } catch (error) {
                setSmtpError(
                  cleanIpcError(
                    error instanceof Error
                      ? error
                      : new Error("Gmail could not verify this app password."),
                  ),
                );
              } finally {
                setSmtpPending(false);
              }
            }}
          >
            <label className="space-y-1.5 text-xs font-medium">
              Gmail address
              <Input
                name="gmailEmail"
                type="email"
                value={smtpEmail || status.data.email || ""}
                onChange={(event) => setSmtpEmail(event.target.value)}
                autoComplete="username"
                placeholder="you@gmail.com"
                maxLength={254}
                required
              />
            </label>
            <label className="space-y-1.5 text-xs font-medium">
              16-character app password
              <Input
                name="appPassword"
                type="password"
                autoComplete="new-password"
                placeholder="Paste app password"
                maxLength={24}
                required
              />
            </label>
            <Button type="submit" disabled={busy}>
              {smtpPending
                ? "Checking Gmail…"
                : status.data.connectionType === "smtp"
                  ? "Replace app password"
                  : "Connect with app password"}
            </Button>
          </form>
        ) : (
          <p className="text-xs text-muted-foreground">
            Open Surface on the desktop app to enter and save an app password.
          </p>
        )}
        {smtpError && (
          <p className="text-sm text-destructive" role="alert">
            {smtpError}
          </p>
        )}
      </div>

      {status.data?.email && appInfo.data?.channel === "development" && (
        <p className="max-w-2xl rounded-lg border border-warning/20 bg-warning/5 px-3.5 py-2.5 text-xs leading-5 text-warning">
          Development safety is on: scheduled messages are always sent to{" "}
          <span className="font-semibold">{status.data.email}</span>, even if a
          draft names another recipient.
        </p>
      )}
    </section>
  );
}
