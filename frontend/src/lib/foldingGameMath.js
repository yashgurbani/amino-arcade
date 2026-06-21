import { coevolutionMatrices, fapeState, ipaState, recyclingFrames, trianglePoints } from "./conceptMath.js";

export const MISSIONS = [
  {
    id: "coevolution",
    label: "Coevolution",
    question: "Why does correlation between MSA columns not equal contact?",
    objective: "Separate direct couplings from transitive covariance.",
    paper: "Fig. 1 input embeddings; learned pair representation.",
    toyBoundary: "Uses an inspectable 6x6 inverse-covariance toy model.",
  },
  {
    id: "triangle",
    label: "Triangle updates",
    question: "Can residue distances be edited independently?",
    objective: "Drive maximum triangle violation below epsilon.",
    paper: "Evoformer triangle multiplication and attention.",
    toyBoundary: "Relaxes explicit distances; AF2 updates learned pair features.",
  },
  {
    id: "ipa",
    label: "IPA",
    question: "Should global pose change the model's geometry readout?",
    objective: "Keep invariant residual below 1e-6 after a global transform.",
    paper: "Structure module, Supplement Algorithm 22.",
    toyBoundary: "Two local frames and two points show the invariance.",
  },
  {
    id: "fape",
    label: "FAPE",
    question: "Can a mirror image satisfy all distances and still be wrong?",
    objective: "Make the reflected structure score worse than the aligned one.",
    paper: "Frame-aligned point error, Supplement section 1.9.2.",
    toyBoundary: "2D chain illustrates chirality; real FAPE uses all atoms.",
  },
  {
    id: "recycling",
    label: "Recycling",
    question: "Is the fold movie physical time?",
    objective: "Reach a representational fixed point.",
    paper: "Iterative refinement and recycling.",
    toyBoundary: "Represents optimization cycles, never kinetic folding.",
  },
];

export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function buildTeachingTrajectory(sequence, perturbations = {}) {
  const recycles = recyclingFrames(9, Boolean(perturbations.freezeRecycle));
  const strengthBase = perturbations.covarianceOnly ? 0.16 : 0.58;
  const forceReflection = Boolean(perturbations.forceReflection);
  const disableTriangle = Boolean(perturbations.disableTriangle);

  return recycles.map((recycle, index) => {
    const t = index / Math.max(1, recycles.length - 1);
    const strength = strengthBase * (0.35 + 0.65 * t);
    const coevolution = coevolutionMatrices(strength);
    const triangle = disableTriangle ? trianglePoints(1.1, 4.8, 1.2) : trianglePoints(2.2 + t, 3.2, 2.4);
    const ipa = ipaState({ globalRotation: t * 1.7, tx: 0.8 * t, ty: -0.4 * t, relativePose: 0.45 });
    const fape = fapeState(forceReflection, t * 0.35);
    const recycleDelta = perturbations.freezeRecycle ? 0.42 : Math.max(0.015, 0.62 * (1 - t) ** 2);
    const fapeScore = forceReflection ? fape.meanError + 0.45 : Math.max(0.08, fape.meanError * (1 - t * 0.7));
    const confidence = perturbations.freezeRecycle ? Math.min(recycle.confidence, 72) : recycle.confidence;
    const triangleViolation = disableTriangle ? triangle.violation : Math.max(0, triangle.violation * (1 - t));

    return {
      index,
      label: index === 0 ? "MSA seed" : `Recycle ${index}`,
      ca: recycle.points.map(([x, y], residueIndex) => [x * 12, y * 12, residueIndex * 1.6]),
      plddt: Array.from({ length: Math.max(1, Math.min(sequence.length, 80)) }, (_, residueIndex) =>
        clamp(confidence + Math.sin(residueIndex * 0.8) * 5, 15, 98)
      ),
      observables: {
        covariance: {
          matrix: coevolution.covariance,
          contacts: [...coevolution.contacts],
          indirectPair: coevolution.indirect,
        },
        triangleViolation,
        ipaInvariantError: Math.abs(ipa.invariantDistance - ipa.displayedDistance),
        fape: fapeScore,
        recycleDelta,
        constraintViolations: Math.round(triangleViolation * 4),
        confidence,
      },
    };
  });
}

export function evaluateMissions(frame) {
  const observables = frame.observables;
  return {
    coevolution: clamp((observables.covariance?.contacts?.length || 0) / 4),
    triangle: clamp(1 - (observables.triangleViolation || 0) / 2),
    ipa: clamp(1 - Math.min(1, (observables.ipaInvariantError || 0) * 1e6)),
    fape: clamp(1 - (observables.fape || 0) / 1.5),
    recycling: clamp(1 - (observables.recycleDelta || 0) / 0.65),
  };
}

export function scoreFrame(frame) {
  const progress = evaluateMissions(frame);
  const confidence = clamp((frame.observables.confidence || 0) / 100);
  const missionMean = mean(Object.values(progress));
  return Math.round((missionMean * 0.7 + confidence * 0.3) * 100);
}

export function summarizePlddt(plddt = []) {
  const values = plddt.filter(Number.isFinite);
  return {
    mean: values.length ? Math.round(mean(values) * 10) / 10 : 0,
    high: values.filter((value) => value >= 90).length,
    confident: values.filter((value) => value >= 70 && value < 90).length,
    low: values.filter((value) => value < 70).length,
  };
}
