// Kabsch rigid-body superposition for Ca traces, in pure JS.
//
// Mirror of backend/analysis.py (kabsch / superpose / rmsd) so the viewer can
// align recycle frames *before* rendering. This removes the global tumbling that
// makes recycle playback look like the protein is "spinning" rather than
// refining (see HANDOFF_PEDAGOGY_AND_LENSES.md, Part 3.2). It is alignment only:
// no coordinates are invented, interpolated, or amplified.

// --- minimal 3x3 linear algebra (no deps; SVD via Jacobi eigen of A^T A) ---

function mul3(a, b) {
  const r = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i += 1)
    for (let j = 0; j < 3; j += 1)
      r[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
  return r;
}

function transpose3(m) {
  return [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
  ];
}

function det3(m) {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
}

// Symmetric 3x3 eigendecomposition via cyclic Jacobi rotations.
function jacobiEigen(aIn) {
  const a = aIn.map((row) => row.slice());
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep += 1) {
    let off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]);
    if (off < 1e-12) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      const apq = a[p][q];
      if (Math.abs(apq) < 1e-15) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * apq);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1);
      const s = t * c;
      for (let i = 0; i < 3; i += 1) {
        const aip = a[i][p];
        const aiq = a[i][q];
        a[i][p] = c * aip - s * aiq;
        a[i][q] = s * aip + c * aiq;
      }
      for (let i = 0; i < 3; i += 1) {
        const api = a[p][i];
        const aqi = a[q][i];
        a[p][i] = c * api - s * aqi;
        a[q][i] = s * api + c * aqi;
      }
      for (let i = 0; i < 3; i += 1) {
        const vip = v[i][p];
        const viq = v[i][q];
        v[i][p] = c * vip - s * viq;
        v[i][q] = s * vip + c * viq;
      }
    }
  }
  return { values: [a[0][0], a[1][1], a[2][2]], vectors: v };
}

function centroid(points) {
  const c = [0, 0, 0];
  for (const p of points) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  const n = points.length || 1;
  return [c[0] / n, c[1] / n, c[2] / n];
}

// Optimal proper rotation R and translation t mapping `mobile` onto `target`.
// Applying: aligned[i] = R * (mobile[i] - mobileCentroid) + targetCentroid.
export function kabsch(mobile, target) {
  if (mobile.length !== target.length || mobile.length === 0) {
    throw new Error(`kabsch: shape mismatch ${mobile.length} vs ${target.length}`);
  }
  const cm = centroid(mobile);
  const ct = centroid(target);
  // covariance H = P^T Q  (P mobile-centered, Q target-centered)
  const h = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let k = 0; k < mobile.length; k += 1) {
    const p = [mobile[k][0] - cm[0], mobile[k][1] - cm[1], mobile[k][2] - cm[2]];
    const q = [target[k][0] - ct[0], target[k][1] - ct[1], target[k][2] - ct[2]];
    for (let i = 0; i < 3; i += 1)
      for (let j = 0; j < 3; j += 1) h[i][j] += p[i] * q[j];
  }
  // H = U S V^T. Derive V (and singular values) from eig(H^T H), then build U
  // as U = H V S^-1 so the left/right singular vectors keep the correct sign
  // pairing (deriving U independently from H H^T loses it and breaks R).
  const hth = mul3(transpose3(h), h);
  const ev = jacobiEigen(hth);
  const order = [0, 1, 2].sort((x, y) => ev.values[y] - ev.values[x]);
  const vCols = order.map((idx) => [ev.vectors[0][idx], ev.vectors[1][idx], ev.vectors[2][idx]]);
  const sigma = order.map((idx) => Math.sqrt(Math.max(ev.values[idx], 0)));
  const hv = (v) => [
    h[0][0] * v[0] + h[0][1] * v[1] + h[0][2] * v[2],
    h[1][0] * v[0] + h[1][1] * v[1] + h[1][2] * v[2],
    h[2][0] * v[0] + h[2][1] * v[1] + h[2][2] * v[2],
  ];
  const uCols = vCols.map((v, i) => {
    const u = hv(v);
    const sig = sigma[i] > 1e-9 ? sigma[i] : 1e-9;
    return [u[0] / sig, u[1] / sig, u[2] / sig];
  });
  // Vm, Um have singular vectors as columns.
  const Vm = [[vCols[0][0], vCols[1][0], vCols[2][0]],
              [vCols[0][1], vCols[1][1], vCols[2][1]],
              [vCols[0][2], vCols[1][2], vCols[2][2]]];
  const Um = [[uCols[0][0], uCols[1][0], uCols[2][0]],
              [uCols[0][1], uCols[1][1], uCols[2][1]],
              [uCols[0][2], uCols[1][2], uCols[2][2]]];
  // R = V D U^T with D = diag(1, 1, sign(det(V U^T))) to force a proper rotation.
  const VUt = mul3(Vm, transpose3(Um));
  const dsign = det3(VUt) < 0 ? -1 : 1;
  const D = [[1, 0, 0], [0, 1, 0], [0, 0, dsign]];
  const R = mul3(mul3(Vm, D), transpose3(Um));
  const t = [
    ct[0] - (R[0][0] * cm[0] + R[0][1] * cm[1] + R[0][2] * cm[2]),
    ct[1] - (R[1][0] * cm[0] + R[1][1] * cm[1] + R[1][2] * cm[2]),
    ct[2] - (R[2][0] * cm[0] + R[2][1] * cm[1] + R[2][2] * cm[2]),
  ];
  return { rotation: R, translation: t };
}

export function applyTransform(points, { rotation: R, translation: t }) {
  return points.map((p) => [
    R[0][0] * p[0] + R[0][1] * p[1] + R[0][2] * p[2] + t[0],
    R[1][0] * p[0] + R[1][1] * p[1] + R[1][2] * p[2] + t[1],
    R[2][0] * p[0] + R[2][1] * p[1] + R[2][2] * p[2] + t[2],
  ]);
}

export function superpose(mobile, target) {
  return applyTransform(mobile, kabsch(mobile, target));
}

export function rmsd(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) {
    const dx = a[i][0] - b[i][0];
    const dy = a[i][1] - b[i][1];
    const dz = a[i][2] - b[i][2];
    s += dx * dx + dy * dy + dz * dz;
  }
  return Math.sqrt(s / (a.length || 1));
}

export function kabschRmsd(mobile, target) {
  return rmsd(superpose(mobile, target), target);
}

// --- PDB coordinate transform (for aligning real recycle frames in the viewer) ---

function parseCaFromPdb(pdbText) {
  const ca = [];
  for (const line of pdbText.split(/\r?\n/)) {
    if (!line.startsWith("ATOM")) continue;
    if (line.slice(12, 16).trim() !== "CA") continue;
    const x = parseFloat(line.slice(30, 38));
    const y = parseFloat(line.slice(38, 46));
    const z = parseFloat(line.slice(46, 54));
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) ca.push([x, y, z]);
  }
  return ca;
}

function fmtCoord(v) {
  // PDB columns are 8 chars, %8.3f
  return v.toFixed(3).padStart(8, " ").slice(-8);
}

// Apply a rigid transform to every ATOM/HETATM record in a PDB string.
export function transformPdb(pdbText, { rotation: R, translation: t }) {
  return pdbText
    .split(/\r?\n/)
    .map((line) => {
      if (!line.startsWith("ATOM") && !line.startsWith("HETATM")) return line;
      const x = parseFloat(line.slice(30, 38));
      const y = parseFloat(line.slice(38, 46));
      const z = parseFloat(line.slice(46, 54));
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return line;
      const nx = R[0][0] * x + R[0][1] * y + R[0][2] * z + t[0];
      const ny = R[1][0] * x + R[1][1] * y + R[1][2] * z + t[1];
      const nz = R[2][0] * x + R[2][1] * y + R[2][2] * z + t[2];
      return line.slice(0, 30) + fmtCoord(nx) + fmtCoord(ny) + fmtCoord(nz) + line.slice(54);
    })
    .join("\n");
}

// Rigidly superpose a recycle-frame PDB onto a reference Ca trace (e.g. the final
// recycle), so playback shows internal refinement instead of global tumbling.
// Alignment only - no atoms are moved relative to one another.
export function superposePdbToReference(pdbText, referenceCa, frameCa = null) {
  const mobile = frameCa && frameCa.length ? frameCa : parseCaFromPdb(pdbText);
  if (!mobile.length || !Array.isArray(referenceCa) || mobile.length !== referenceCa.length) {
    return pdbText; // shapes differ; never guess
  }
  return transformPdb(pdbText, kabsch(mobile, referenceCa));
}
