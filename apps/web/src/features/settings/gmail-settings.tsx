import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

const gmailKey = ["gmail-status"] as const;

function cleanIpcError(error: Error) {
  return error.message.replace(/^Error invoking remote method .*?: Error: /, "");
}

export function GmailSettings() {
  const desktop = window.surfaceDesktop;
  const client = useQueryClient();
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
    onSuccess: (record) => client.setQueryData(gmailKey, record),
  });

  return (
    <section className="form-section space-y-5">
      <div className="space-y-1">
        <h2>Gmail</h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          Save writing assistant drafts directly to Gmail. Surface never sends
          email; open the draft in Gmail and choose Schedule send there.
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
              Google OAuth
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
            disabled={connection.isPending}
            onClick={() => connection.mutate("connect")}
          >
            {connection.isPending
              ? "Waiting for Google sign-in…"
              : status.data.connectionType === "oauth"
                ? "Reconnect or switch account"
                : "Connect with Google"}
          </Button>
          {status.data.email && (
            <Button
              variant="outline"
              disabled={connection.isPending}
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
          <p className="font-medium text-foreground">Draft first, schedule in Gmail</p>
          <p className="text-muted-foreground">
            Google OAuth lets Surface create and update drafts in your Gmail
            Drafts folder. After a draft opens, use Gmail’s Schedule send to
            choose its delivery time. App-password SMTP cannot create Gmail
            drafts or use Gmail’s scheduling controls.
          </p>
          <p className="text-muted-foreground">
            The first connection needs a Google Desktop app client JSON. Choose
            the file, then sign in to Google in the browser that opens. The JSON
            identifies the app; it is not your email password. Create a Desktop
            OAuth client in{" "}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-link underline underline-offset-4 hover:text-foreground"
            >
              Google Cloud credentials
            </a>
            .
          </p>
        </div>
      )}
    </section>
  );
}
