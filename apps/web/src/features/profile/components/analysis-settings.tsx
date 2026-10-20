import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { analysisSettingsSchema } from "backend/contracts";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { SettingsLoading } from "@/components/feedback/loading-state";
import { toast } from "sonner";
import { ScanLine, Pause, Play } from "lucide-react";
export function AnalysisSettings() {
  const client = useQueryClient();
  const settings = useQuery({
    queryKey: ["analysis-settings"],
    queryFn: async () =>
      analysisSettingsSchema.parse(await apiClient("/api/analysis/settings")),
  });
  const save = useMutation({
    mutationFn: (paused: boolean) =>
      apiClient("/api/analysis/settings", {
        method: "PUT",
        body: JSON.stringify({ paused }),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["analysis-settings"] });
      toast.success("AI settings updated");
    },
    onError: (e) => toast.error(e.message),
  });
  if (settings.error) return <p role="alert">{settings.error.message}</p>;
  if (!settings.data) return <SettingsLoading />;
  const data = settings.data;
  return (
    <section className="mx-auto mt-8 max-w-3xl space-y-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <ScanLine className="size-5 text-brand" /> AI settings
      </h2>
      <p className="text-muted-foreground">
        {!data.configured
          ? "OmniRoute is not configured. Add its endpoint, model, and API key to the backend environment."
          : "OmniRoute is connected. Research, summaries, and assessments run when you request them."}
      </p>
      <div className="rounded-lg border bg-card p-5 space-y-3">
        <p className="font-medium">
          {data.paused ? "AI is paused" : "AI is available"}
        </p>
        <p className="text-sm text-muted-foreground">
          Pause new research, summaries, and assessments. Saved results remain
          available. Résumé imports can still be requested explicitly.
        </p>
        <Button
          variant="outline"
          disabled={save.isPending}
          onClick={() => save.mutate(!data.paused)}
        >
          {data.paused ? <Play /> : <Pause />}
          {data.paused ? "Resume AI" : "Pause AI"}
        </Button>
      </div>
    </section>
  );
}
