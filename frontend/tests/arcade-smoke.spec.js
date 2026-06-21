import { expect, test } from "@playwright/test";

const pdb = `HEADER    AMINO ARCADE SMOKE
ATOM      1  N   GLY A   1       0.000   0.000   0.000  1.00 95.00           N
ATOM      2  CA  GLY A   1       1.460   0.000   0.000  1.00 95.00           C
ATOM      3  C   GLY A   1       2.000   1.430   0.000  1.00 95.00           C
ATOM      4  O   GLY A   1       1.200   2.350   0.000  1.00 95.00           O
ATOM      5  N   ALA A   2       3.340   1.610   0.000  1.00 73.00           N
ATOM      6  CA  ALA A   2       3.950   2.940   0.000  1.00 73.00           C
ATOM      7  C   ALA A   2       5.450   2.800   0.000  1.00 73.00           C
ATOM      8  O   ALA A   2       6.050   3.850   0.000  1.00 73.00           O
TER       9      ALA A   2
END`;

const analysis = {
  available: true,
  reference: "final",
  frames: [
    { recycle_index: 0, label: "Recycle 0", mean_plddt: 84, fraction_below_70: 0, rmsd_to_previous_a: null, rmsd_to_reference_a: 0.52, fape_to_reference_a: 0.44, delta_mean_plddt: null, geometry: { clashes: 0, bond_outliers: 1 }, contact_delta_to_reference: { gained_count: 0, lost_count: 0, jaccard: 1, gained: [], lost: [] } },
    { recycle_index: 1, label: "Recycle 1", mean_plddt: 86.5, fraction_below_70: 0, rmsd_to_previous_a: 0.31, rmsd_to_reference_a: 0.22, fape_to_reference_a: 0.19, delta_mean_plddt: 2.5, geometry: { clashes: 0, bond_outliers: 0 }, contact_delta_to_reference: { gained_count: 0, lost_count: 0, jaccard: 1, gained: [], lost: [] } },
    { recycle_index: 2, label: "Recycle 2", mean_plddt: 89, fraction_below_70: 0, rmsd_to_previous_a: 0.18, rmsd_to_reference_a: 0, fape_to_reference_a: 0, delta_mean_plddt: 2.5, geometry: { clashes: 0, bond_outliers: 0 }, contact_delta_to_reference: { gained_count: 0, lost_count: 0, jaccard: 1, gained: [], lost: [] } },
  ],
};

const result = {
  status: "success",
  engine: "localcolabfold",
  sequence: "MALWMRLLPLLALLALWGPDPAAAFVNQHLCGSHLVEALYLVCGERGFFYTPKTRREAEDLQVGQVELGGGPGAGSLQPLALEGSLQKRGIVEQCCTSICSLYQLENYCN",
  provenance: { kind: "real-af2", label: "REAL: LocalColabFold" },
  analysis,
  frames: [
    { label: "Recycle 0", pdb, plddt: [95, 73], ca: [[1.46, 0, 0], [3.95, 2.94, 0]], observables: { confidence: 84 } },
    { label: "Recycle 1", pdb, plddt: [92, 81], ca: [[1.46, 0, 0], [4.10, 2.50, 0]], observables: { confidence: 86.5 } },
    { label: "Recycle 2", pdb, plddt: [90, 88], ca: [[1.46, 0, 0], [4.25, 2.10, 0]], observables: { confidence: 89 } },
  ],
  models: [
    {
      rank: 1,
      model_id: "model_3",
      seed: "seed_000",
      mean_plddt: 89,
      ptm: 0.74,
      iptm: null,
      pae: [[0, 2.5], [2.5, 0]],
      frames: [
        { label: "Recycle 0", pdb, plddt: [95, 73], ca: [[1.46, 0, 0], [3.95, 2.94, 0]], observables: { confidence: 84 } },
        { label: "Recycle 1", pdb, plddt: [92, 81], ca: [[1.46, 0, 0], [4.10, 2.50, 0]], observables: { confidence: 86.5 } },
        { label: "Recycle 2", pdb, plddt: [90, 88], ca: [[1.46, 0, 0], [4.25, 2.10, 0]], observables: { confidence: 89 } },
      ],
      final_pdb: pdb,
      plddt: [90, 88],
      analysis,
    },
  ],
  ranking: { metric: "mean_plddt", order: ["model_3"] },
  plddt: [90, 88],
  pae: [[0, 2.5], [2.5, 0]],
  meta: {
    runtime_seconds: 12.3,
    cached: false,
    trajectory_note: "LocalColabFold recycle PDBs parsed as real inference-refinement frames.",
  },
  warnings: [],
};

async function mockBackend(page, jobPosts = [], rcsbRequests = []) {
  await page.route("http://127.0.0.1:8011/api/reference/pdb/*", route => {
    rcsbRequests.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "chemical/x-pdb", body: pdb });
  });
  await page.route("http://127.0.0.1:8011/api/backend/capabilities", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ status: "success", engines: [{ id: "localcolabfold", label: "LocalColabFold", available: true }, { id: "educational-simulator", label: "Educational simulator", available: true }] }),
  }));
  await page.route("http://127.0.0.1:8011/api/predict/jobs", route => {
    if (route.request().method() === "POST") {
      jobPosts.push(route.request().postDataJSON());
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "success", job: { id: "smoke-job", status: "running", engine: "localcolabfold", options: { num_recycle: 8, num_models: 1, msa_mode: "mmseqs2_uniref_env" }, cache_key: "smoke-cache" } }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "success", recent_jobs: [] }) });
  });
  await page.route("http://127.0.0.1:8011/api/predict/jobs/smoke-job", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ status: "success", job: { id: "smoke-job", status: "succeeded", engine: "localcolabfold", options: { num_recycle: 8, num_models: 1, msa_mode: "mmseqs2_uniref_env" }, cache_key: "smoke-cache" } }),
  }));
  await page.route("http://127.0.0.1:8011/api/predict/jobs/smoke-job/logs", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "success", logs: ["Running on GPU", "Done"] }) }));
  await page.route("http://127.0.0.1:8011/api/predict/jobs/smoke-job/result", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "success", result }) }));
  await page.route("http://127.0.0.1:8011/api/predict/jobs/smoke-job/report", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "success", report: { provenance: result.provenance, artifact_summary: { frames: 3 } } }) }));
  await page.route("http://127.0.0.1:8011/api/physics/status", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "success", available: false, label: "local relaxation", mode: "openmm-local-relaxation", message: "OpenMM is not installed. Physics mode is disabled.", packages: { openmm: false, pdbfixer: false } }) }));
  await page.route("http://127.0.0.1:8011/api/predict/jobs/smoke-job/manifest", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "success", manifest: { job_id: "smoke-job", engine: "localcolabfold", frame_count: 3, model_count: 1 } }) }));
  await page.route("http://127.0.0.1:8011/api/predict/jobs/smoke-job/frames/*", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "success", frame: result.frames[0] }) }));
}

test("arcade shell, lens interaction, and real recycle frames", async ({ page }) => {
  const consoleErrors = [];
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", error => consoleErrors.push(error.message));

  const jobPosts = [];
  const rcsbRequests = [];
  await mockBackend(page, jobPosts, rcsbRequests);
  await page.goto("/");

  await expect(page.locator(".arcade-shell")).toBeVisible();
  await expect(page.locator("header")).toContainText("AMINO ARCADE");
  await expect(page.locator("header")).toContainText("FIY");
  await expect(page.locator("header")).not.toContainText("SCORE");
  await expect(page.getByText("Salivary amylase", { exact: true })).toBeVisible();
  await expect.poll(() => rcsbRequests.some((url) => url.endsWith("/1SMD"))).toBe(true);
  await page.getByTitle("result inspector, downloads, and backend specifics").click();
  await expect(page.getByText("TARGET", { exact: true }).locator("..")).toContainText("496 aa");
  await expect(page.getByText("MSA MODE", { exact: true }).locator("..")).toContainText("MMseqs2");
  await page.getByRole("button", { name: "✕" }).click();
  await page.getByRole("button", { name: "2", exact: true }).click();
  await expect(page.getByText("GFP", { exact: true })).toBeVisible();
  await expect.poll(() => rcsbRequests.some((url) => url.endsWith("/1EMA"))).toBe(true);
  await expect(page.getByRole("button", { name: "Triangle Updates pair-table" })).toBeVisible();
  await expect(page.getByTestId("mol-lens-annotation")).toContainText("triangle");
  await page.locator('button[title="Open Triangle Updates lens overlay"]').click();
  await expect(page.getByText("FULL SCENE")).toBeVisible();
  await page.getByRole("button", { name: "✕" }).click();
  await page.getByRole("button", { name: "5", exact: true }).click();
  await expect(page.getByText("Phosphoglycerate kinase", { exact: true })).toBeVisible();
  await expect.poll(() => rcsbRequests.some((url) => url.endsWith("/3PGK"))).toBe(true);

  await expect(page.getByTestId("mol-playfield")).toHaveAttribute("data-color-mode", "ss");
  await expect(page.getByText("Loading Mol*…")).toHaveCount(0, { timeout: 20000 });
  await expect.poll(async () => page.locator(".molstar-dark-host .msp-btn").count()).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Fold", exact: true }).click();
  expect(jobPosts[0].num_recycle).toBe(8);
  expect(jobPosts[0].num_models).toBe(1);
  expect(jobPosts[0].msa_mode).toBe("mmseqs2_uniref_env");
  expect(jobPosts[0].sequence.length).toBe(416);
  await expect(page.getByTestId("job-popup")).toBeVisible();
  await expect(page.getByTestId("job-popup")).toContainText("recycles requested: 8");
  await expect(page.getByTestId("job-popup")).toContainText("models requested: 1");
  await expect(page.getByTestId("job-popup")).toContainText("MSA mode: mmseqs2_uniref_env");
  await expect(page.getByText("Real LocalColabFold recycle snapshots")).toBeVisible();
  await expect(page.getByText("pLDDT + Δ RMSD OVER RECYCLES")).toBeVisible();
  await expect(page.getByText("BOND OUTLIERS", { exact: true })).toBeVisible();
  await expect(page.getByText("Cα-FAPE (Å)", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "SHOW pLDDT" }).click();
  await expect(page.getByTestId("mol-playfield")).toHaveAttribute("data-color-mode", "plddt");
  await expect(page.getByTestId("mol-residue-color-legend")).toContainText("pLDDT");
  await expect(page.getByRole("button", { name: "Recycle 0" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Recycle 1" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Recycle 2" })).toBeVisible();
  await page.getByRole("button", { name: "SHOW SS" }).click();
  await page.getByRole("button", { name: "Recycle 0" }).click();
  await expect(page.getByTestId("mol-residue-color-legend")).toContainText("Still to settle this recycle");
  await page.getByRole("button", { name: "Recycle 2" }).click();
  await expect(page.getByTestId("mol-residue-color-legend")).toContainText("0 Å (settled)");
  await page.getByRole("tab", { name: "PAE" }).click();
  await expect(page.getByLabel("Real predicted aligned error matrix")).toBeVisible();

  await page.getByRole("button", { name: /FIY/i }).click();
  await expect(page.getByTestId("mol-playfield")).toBeVisible();
  await expect(page.getByText("Loading Mol*…")).toHaveCount(0, { timeout: 20000 });
  await page.getByRole("button", { name: "Trp-cage" }).click();
  await expect(page.getByLabel("Amino acid sequence")).toHaveValue("NLYIQWLKDGGPSSGRPPPS");
  await page.getByRole("button", { name: "Ubiquitin" }).click();
  await expect(page.getByLabel("Amino acid sequence")).toHaveValue("MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGR");

  const unnamedControls = await page.locator("button, select, textarea").evaluateAll((controls) => controls
    .filter((el) => !el.disabled)
    .map((el) => ({ tag: el.tagName, text: el.textContent?.trim(), aria: el.getAttribute("aria-label"), title: el.getAttribute("title") }))
    .filter((item) => !(item.text || item.aria || item.title)));
  expect(unnamedControls).toEqual([]);
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();

  const unexpectedErrors = consoleErrors.filter((text) => !/Could not create a WebGL rendering context|reprCount/.test(text));
  expect(unexpectedErrors).toEqual([]);
});
