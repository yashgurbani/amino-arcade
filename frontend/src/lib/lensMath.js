export function matInv(A) {
  const n = A.length;
  const M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c += 1) {
    let p = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c];
    for (let j = 0; j < 2 * n; j += 1) M[c][j] /= d;
    for (let r = 0; r < n; r += 1) if (r !== c) {
      const f = M[r][c];
      for (let j = 0; j < 2 * n; j += 1) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((r) => r.slice(n));
}

export function coevData() {
  const n = 6;
  const contacts = [[0, 2], [2, 4], [1, 3], [3, 5]];
  const J = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 2.2 : 0)));
  contacts.forEach(([a, b]) => { J[a][b] = J[b][a] = -0.9; });
  const cov = matInv(J);
  const corr = (M) => M.map((row, i) => row.map((v, j) => (i === j ? 1 : v / Math.sqrt(M[i][i] * M[j][j]))));
  const corrCov = corr(cov);
  const corrPrec = J.map((row, i) => row.map((v, j) => (i === j ? 1 : -v / Math.sqrt(J[i][i] * J[j][j]))));
  const isC = (i, j) => contacts.some(([a, b]) => (a === i && b === j) || (a === j && b === i));
  let trap = null;
  let best = 0;
  for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) if (!isC(i, j) && Math.abs(corrCov[i][j]) > best) {
    best = Math.abs(corrCov[i][j]);
    trap = [i, j];
  }
  return { n, contacts, corrCov, corrPrec, isC, trap };
}

export function triangleMaxViolation(D) {
  let m = 0;
  let tri = null;
  const n = D.length;
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) if (i !== j) for (let k = 0; k < n; k += 1) if (k !== i && k !== j) {
    const v = D[i][j] - (D[i][k] + D[k][j]);
    if (v > m) { m = v; tri = [i, k, j]; }
  }
  return { v: m, tri };
}

export function ipaData({ thetaG = 0 } = {}) {
  const d2r = Math.PI / 180;
  const R = (a) => [[Math.cos(a), -Math.sin(a)], [Math.sin(a), Math.cos(a)]];
  const ap = (M, v) => [M[0][0] * v[0] + M[0][1] * v[1], M[1][0] * v[0] + M[1][1] * v[1]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const t1 = [-3.2, 1], t2 = [3, -1.2], a1 = 30 * d2r, a2 = -55 * d2r, p1 = [1.6, 0.5], p2 = [-1.1, 1.1];
  const q0 = add(ap(R(a1), p1), t1), k0 = add(ap(R(a2), p2), t2), d0 = Math.hypot(q0[0] - k0[0], q0[1] - k0[1]);
  const ag = thetaG * d2r, tg = [1.8, 1.4], T = (p) => add(ap(R(ag), p), tg);
  const q1 = T(q0), k1 = T(k0), d1 = Math.hypot(q1[0] - k1[0], q1[1] - k1[1]);
  return { q0, k0, q1, k1, d0, d1, residual: Math.abs(d1 - d0), naiveShift: Math.hypot(q1[0] - q0[0], q1[1] - q0[1]),
    t1: T(t1), t2: T(t2), o1: T(add(ap(R(a1), [1.4, 0]), t1)), o2: T(add(ap(R(a2), [1.4, 0]), t2)) };
}

export function fapeTarget() {
  return [[-4, -2.2], [-3, -0.2], [-2, 1.4], [-0.4, 2], [1.1, 2.2], [2.6, 1.3], [3.3, -0.2], [3, -1.8], [1.7, -2.6]];
}

export function fapeData({ reflected = false } = {}) {
  const tgt = fapeTarget();
  const pred = reflected ? tgt.map((p) => [-p[0], p[1]]) : tgt.map((p) => [p[0], p[1]]);
  const n = tgt.length;
  const clamp = 4;
  const frameErr = (A, B) => {
    let sum = 0, cnt = 0;
    for (let i = 0; i < n - 1; i += 1) {
      const mk = (P) => {
        const o = P[i], dx = P[i + 1][0] - o[0], dy = P[i + 1][1] - o[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
        return P.map((p) => { const rx = p[0] - o[0], ry = p[1] - o[1]; return [rx * ux + ry * uy, -rx * uy + ry * ux]; });
      };
      const la = mk(A), lb = mk(B);
      for (let j = 0; j < n; j += 1) { sum += Math.min(clamp, Math.hypot(la[j][0] - lb[j][0], la[j][1] - lb[j][1])); cnt += 1; }
    }
    return sum / cnt;
  };
  let ds = 0, dc = 0;
  for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) {
    const a = Math.hypot(pred[i][0] - pred[j][0], pred[i][1] - pred[j][1]), b = Math.hypot(tgt[i][0] - tgt[j][0], tgt[i][1] - tgt[j][1]);
    ds += (a - b) * (a - b); dc += 1;
  }
  return { tgt, pred, fape: frameErr(pred, tgt), fapeAligned: frameErr(tgt, tgt), distRmsd: Math.sqrt(ds / dc), refl: reflected };
}

export function recycleShape(x) {
  const n = 12, A = [], B = [];
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1);
    A.push([-5 + t * 10, Math.sin(t * Math.PI * 3) * 0.6]);
    const a = t * Math.PI * 4;
    B.push([Math.cos(a) * (1 + t * 2.5), Math.sin(a) * (1 + t * 2.5)]);
  }
  return A.map((p, i) => [p[0] + (B[i][0] - p[0]) * x, p[1] + (B[i][1] - p[1]) * x]);
}
