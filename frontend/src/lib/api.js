const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8011";
const DEMO_CACHE_ENABLED = import.meta.env.VITE_DEMO_CACHE === "1";
const DEMO_BASE = `${import.meta.env.BASE_URL || "/"}demo-cache`;

export function isDemoCacheEnabled() {
  return DEMO_CACHE_ENABLED;
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function fetchJson(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.status === "error") {
    throw new Error(data.message || `Request failed with ${response.status}`);
  }
  return data;
}

export function fetchCapabilities() {
  return fetchJson("/api/backend/capabilities");
}

export async function fetchDemoManifest() {
  const response = await fetch(`${DEMO_BASE}/manifest.json`, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Demo cache manifest unavailable (${response.status})`);
  return response.json();
}

export async function fetchDemoResultForSequence(sequence) {
  const manifest = await fetchDemoManifest();
  const sequenceHash = await sha256Hex(sequence);
  const item = (manifest.results || []).find((row) => row.sequence_sha256 === sequenceHash);
  if (!item) throw new Error("No bundled real-fold demo result for this sequence.");
  const response = await fetch(item.url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Demo result unavailable (${response.status})`);
  return response.json();
}

export async function fetchPhysicsStatus() {
  const data = await fetchJson("/api/physics/status");
  return data.physics || data;
}

export async function runLocalRelaxation(pdb, maxIterations = 200) {
  return fetchJson("/api/physics/local-relaxation", {
    method: "POST",
    body: JSON.stringify({ pdb, max_iterations: maxIterations }),
  });
}

// Fetch the public crystal structure for a target's PDB id. Prefer the backend
// proxy (adds server-side caching + a stable User-Agent), but fall back to the
// public RCSB endpoint directly when the backend is unreachable. Without this
// fallback, a backend-less/demo build fails every reference fetch and the viewer
// drops to the generic spiral fallback for EVERY target \u2014 making all examples
// look identical (the pre-refactor code fetched RCSB directly). RCSB serves CORS
// headers on files.rcsb.org, so the browser can read it without a proxy.
export async function fetchReferencePdb(pdbId) {
  const id = encodeURIComponent(pdbId);
  try {
    const response = await fetch(`${API_BASE}/api/reference/pdb/${id}`);
    const text = await response.text();
    if (response.ok && text.includes("ATOM")) return text;
    throw new Error(`RCSB proxy returned ${response.status}`);
  } catch (proxyErr) {
    // Backend down / wrong origin / network error -> go straight to RCSB.
    const direct = await fetch(`https://files.rcsb.org/download/${String(pdbId).toUpperCase()}.pdb`);
    if (!direct.ok) throw new Error(`RCSB ${pdbId} unavailable (${direct.status}); proxy: ${proxyErr.message}`, { cause: proxyErr });
    const text = await direct.text();
    if (!text.includes("ATOM")) throw new Error(`RCSB ${pdbId} returned no usable PDB`, { cause: proxyErr });
    return text;
  }
}

export async function fetchExamples() {
  const data = await fetchJson("/api/examples");
  return data.examples || [];
}

export function predictSequence(sequence, engine = "educational-simulator", options = {}) {
  return fetchJson("/api/predict", {
    method: "POST",
    body: JSON.stringify({ sequence, engine, ...options }),
  });
}

// The backend wraps job payloads in envelopes: create/get/cancel -> { job },
// result -> { result }, report -> { report }. Unwrap so callers get the object
// directly (fixes the `created.id === undefined` -> polling /jobs/undefined bug).
export async function createPredictionJob(sequence, engine = "educational-simulator", options = {}) {
  const data = await fetchJson("/api/predict/jobs", {
    method: "POST",
    body: JSON.stringify({ sequence, engine, ...options }),
  });
  return data.job || data;
}

export async function fetchPredictionJob(jobId) {
  const data = await fetchJson(`/api/predict/jobs/${jobId}`);
  return data.job || data;
}

export function fetchPredictionJobs() {
  return fetchJson("/api/predict/jobs");
}

export async function cancelPredictionJob(jobId) {
  const data = await fetchJson(`/api/predict/jobs/${jobId}/cancel`, { method: "POST" });
  return data.job || data;
}

export function fetchPredictionLogs(jobId) {
  return fetchJson(`/api/predict/jobs/${jobId}/logs`);
}

export async function fetchPredictionResult(jobId) {
  const data = await fetchJson(`/api/predict/jobs/${jobId}/result`);
  return data.result || data;
}

export async function fetchPredictionReport(jobId) {
  const data = await fetchJson(`/api/predict/jobs/${jobId}/report`);
  return data.report || data;
}

export async function fetchPredictionManifest(jobId) {
  const data = await fetchJson(`/api/predict/jobs/${jobId}/manifest`);
  return data.manifest || data;
}

export async function fetchPredictionFrame(jobId, frameIndex, modelIndex = null) {
  const query = modelIndex == null ? "" : `?model_index=${encodeURIComponent(modelIndex)}`;
  const data = await fetchJson(`/api/predict/jobs/${jobId}/frames/${encodeURIComponent(frameIndex)}${query}`);
  return data.frame || data;
}

export function compareEngines(sequence, engines) {
  return fetchJson("/api/compare", {
    method: "POST",
    body: JSON.stringify({ sequence, engines }),
  });
}
