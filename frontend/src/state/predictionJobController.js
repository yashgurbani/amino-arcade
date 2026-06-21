import {
  createPredictionJob,
  fetchDemoResultForSequence,
  fetchPredictionJob,
  fetchPredictionLogs,
  fetchPredictionReport,
  fetchPredictionResult,
  isDemoCacheEnabled,
} from "../lib/api";

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function runPredictionJob({ sequence, engine, options, onLog, onJob }) {
  if (isDemoCacheEnabled()) {
    onLog?.("DEMO", "loading bundled LocalColabFold result", "info");
    try {
      const result = await fetchDemoResultForSequence(sequence);
      const job = {
        id: `demo-${result.meta?.target?.n || "cache"}`,
        status: "succeeded",
        engine: result.engine || "localcolabfold",
        options: result.meta?.options || options,
        cache_key: result.cache_key,
      };
      onJob?.(job);
      onLog?.("✓", `demo fold loaded · ${result.frames?.length || 0} recycle frames`, "success");
      return { result, report: null, job, demo: true };
    } catch (error) {
      onLog?.("DEMO", `${error.message}; running backend instead`, "warn");
    }
  }

  const created = await createPredictionJob(sequence, engine, options);
  onJob?.(created);
  onLog?.("JOB", `created ${created.id} · ${created.status}`, "info");
  let current = created;
  const maxPolls = engine === "localcolabfold" ? 2000 : 160;
  let lastLogLen = 0;
  for (let p = 0; p < maxPolls; p += 1) {
    await wait(engine === "localcolabfold" ? 1200 : 450);
    current = await fetchPredictionJob(created.id);
    onJob?.(current);
    if (p === 0 || p % 10 === 0 || ["succeeded", "failed", "cancelled"].includes(current.status)) {
      onLog?.("STAT", `${engine} · ${String(current.status).toUpperCase()}`, "muted");
    }
    try {
      const data = await fetchPredictionLogs(created.id);
      const lines = data.logs || [];
      if (lines.length > lastLogLen) {
        const fresh = lines.slice(lastLogLen);
        lastLogLen = lines.length;
        fresh.forEach((line) => onLog?.("··", String(line), "muted"));
      }
    } catch {
      // Log polling should never fail the run.
    }
    if (["succeeded", "failed", "cancelled"].includes(current.status)) break;
  }
  if (current.status !== "succeeded") throw new Error(current.message || `job ${current.status}`);
  const [result, report] = await Promise.all([
    fetchPredictionResult(created.id),
    fetchPredictionReport(created.id).catch(() => null),
  ]);
  onLog?.("✓", `fold complete · ${result.frames?.length || 0} recycle frames`, "success");
  return { result, report, job: current, demo: false };
}
