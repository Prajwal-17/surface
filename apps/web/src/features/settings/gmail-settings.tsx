import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { gmailKey } from "@/features/outreach/outreach-composer";

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
    <section className="form-section space-y-3">
      <h2>Gmail</h2>
      <p className="max-w-prose text-sm text-muted-foreground">
        Connect a Google Desktop OAuth client to save outreach drafts in Gmail.
        Open Gmail to approve a send time.
      </p>
      <p className="text-sm">
        {status.data?.email
          ? `Connected as ${status.data.email}`
          : (status.data?.error ??
            (desktop?.gmailStatus
              ? "No Gmail account connected."
              : "Connect Gmail from the desktop app."))}
      </p>
      {status.data?.available && (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={connection.isPending}
            onClick={() => connection.mutate("connect")}
          >
            {connection.isPending
              ? "Waiting for Gmail…"
              : status.data.email
                ? "Reconnect or switch account"
                : "Connect Gmail"}
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
          {connection.error.message.replace(
            /^Error invoking remote method .*?: Error: /,
            "",
          )}
        </p>
      )}
    </section>
  );
}
