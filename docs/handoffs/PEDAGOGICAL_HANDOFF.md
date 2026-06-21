# PEDAGOGICAL HANDOFF — FoldYourProtein

This is the *why* and the *what to teach*. `SPEC.md` and `IMPLEMENTATION_PLAN.md` describe the machine; this describes the mind it's supposed to build in the learner. Written for whoever designs the learning experience (and for the owner, who is studying Jumper et al. while also being an artist — so the cross-domain notes at the end are deliberate, not decoration).

---

## 1. The pedagogical thesis

AlphaFold2 is usually taught as either (a) a black box that "solved protein folding" or (b) a wall of 32 supplementary algorithms. Both fail the learner. The first gives no mechanism; the second gives no intuition. This companion takes a third path: **teach the five geometric ideas that make AF2 work as manipulable invariants, then let the learner connect each to the real paper and a real fold.**

The design question that should govern every feature: *does this help the learner feel why the idea is necessary, or does it just show them that it is true?* Necessity beats truth for learning. The "break it" affordance (perturb the model, watch the observable degrade) exists because feeling a thing fail teaches more than watching it succeed.

A Socratic frame for the build: before each concept scene, the app should pose the question the algorithm answers, not the algorithm. "Two residues mutate together across evolution — does that mean they touch?" is a better entry than "here is direct coupling analysis."

---

## 2. Learning objectives, per concept

Each maps to a mission (SPEC §4.2), a paper location, and an "aha" the learner should leave with. The honest abstraction — what the toy *is* and *isn't* — is part of the objective, not a disclaimer.

### 2.1 Coevolution (inverse Potts)
- **Question:** Why does correlation between MSA columns not equal contact?
- **Objective:** Distinguish a *direct* coupling from an *indirect* (transitive) correlation by reading the precision matrix, not the covariance matrix.
- **Aha:** The matrix inverse "explains away" indirect paths. Contacts live in the precision matrix's off-diagonal blocks. (`C⁻¹ ≈ −J`.)
- **Paper:** Fig. 1, input embeddings; companion guide §2. Real AF2 generalizes this into a *learned* pair representation rather than a one-shot inversion — say so.
- **Toy boundary:** 6×6 planted-contact matrix is inspectable; AF2 never does an explicit DCA inversion.

### 2.2 Triangle updates (pair-table consistency)
- **Question:** Can you edit residue–residue distances independently?
- **Objective:** Drive the maximum triangle-inequality violation below ε by relaxing a pair-distance matrix.
- **Aha:** A table of pairwise distances must be *globally* consistent to be realizable as one 3D object; triangle operations propagate constraints through residue triples.
- **Paper:** p. 586 pair representation; Supplement §1.6 (triangle multiplication/attention).
- **Toy boundary:** we relax explicit distances; the Evoformer operates on *learned* pair features, not raw distances.

### 2.3 Invariant Point Attention (SE(3))
- **Question:** If you rotate and translate the whole protein, should the model's read of its geometry change?
- **Objective:** Apply a random global transform and confirm the query–key distance is invariant (residual < 1e-6).
- **Aha:** A protein has no privileged origin or orientation; attention over points in residue-local frames is invariant to global pose by construction. The invariance *is* the design.
- **Paper:** Fig. 3 structure module; Supplement Algorithm 22.
- **Toy boundary:** two frames, two points — enough to see the invariance; real IPA mixes scalar + point + pair-bias attention over many points.

### 2.4 FAPE & chirality
- **Question:** If a predicted structure matches all distances, is it correct?
- **Objective:** Make a *reflected* (mirror-image) structure score worse than the aligned one.
- **Aha:** Distance agreement is not enough — reflection preserves distances but breaks handedness. Comparing in residue-local frames (FAPE) catches it. Biology is chiral.
- **Paper:** p. 587; Supplement §1.9.2 (note the FAPE clamp).
- **Toy boundary:** 2D chain illustrates the failure mode; real FAPE is over all atoms in all frames with a clamp.

### 2.5 Recycling (fixed-point refinement)
- **Question:** Is the iteration you watch a movie of a protein folding in time?
- **Objective:** Reach the fixed point (Δstructure < δ) within N cycles.
- **Aha:** Recycling refines *representations*, not physical time. Late convergence is a signal, not a kinetic pathway. This is the single most-misunderstood point and deserves the strongest honesty framing.
- **Paper:** p. 585 iterative refinement; Supplement Algorithm 2.
- **Toy boundary:** the trajectory is representational iteration; **never** narrate it as folding kinetics.

### 2.6 The meta-objective: confidence ≠ correctness ≠ thermodynamics
pLDDT is predicted local reliability. PAE is domain-placement confidence. Neither is free energy or a folding probability. Every result view should reinforce this. The owner — a physicist — will appreciate that this is exactly the place where physical intuition (energy landscapes) and the ML model (learned confidence) must be kept distinct.

---

## 3. Curriculum / mission ordering

Two valid paths; the app should support both:

1. **Paper-faithful order** (matches Jumper et al. flow): Coevolution → Triangle → IPA → FAPE → Recycling → Results. Best for someone reading the paper alongside.
2. **Necessity-first order** (better cold-start pedagogy): Recycling (what is the loop?) → IPA (why frames?) → Triangle (why consistency?) → Coevolution (where does signal come from?) → FAPE (how is it trained?). Each answers the previous one's open question.

Default to paper-faithful (the primary user is studying the paper); offer necessity-first as a "guided tour" toggle.

Each mission ends with an **interpretation card** that explicitly states: the question, the computed result, the paper location, and the toy-vs-real boundary. Unlocking is earned (computed objective met), so the card lands when the learner has the experience to anchor it.

---

## 4. Honesty as pedagogy (not just compliance)

The scientific-honesty contract (SPEC §2) is itself a teaching tool. A learner who internalizes "this number came from a teaching optimizer, this one from a real AF2-family run, and here's why they differ" has learned something deeper than the algorithm: they've learned to ask *what does this output license me to claim?* Make the provenance object legible, not hidden. The "what this is / isn't" card pinned in the arena is a feature, not a footnote.

---

## 5. Creative options to build from here (backlog, gated behind v3)

These are deliberately more speculative — the "what else could this become" the request asked for. Grouped by ambition. None should jump the v3 acceptance criteria, but they're worth holding in view because some are cheap and delightful.

### 5.1 Cheap, high-delight (days)
- **Daily fold ritual.** A small, schedulable "protein of the day" — pick a cached/known structure, pose one Socratic question, log the learner's answer. (Fits the owner's atomic-habits / daily-ritual interest; a scheduled task could surface it each morning.)
- **Sequence sandbox.** Let the user mutate a residue and watch the simulator's secondary-structure propensity and confidence shift. Honest because it's the teaching model; teaches the sequence→structure intuition viscerally.
- **Equation ↔ scene linking.** Click an equation in the paper-grounding deck → jump to the scene that makes it manipulable. Tightens the paper-to-intuition loop.

### 5.2 Medium (1–2 weeks each)
- **Contact-prediction challenge.** Show an MSA; the learner guesses contacts; score against the precision-matrix answer. A genuine inverse-Potts game.
- **"Fold golf."** Given a target fold and a budget of recycles/parameters, reach the lowest FAPE. Leaderboard against your own past runs (local, no cloud).
- **PAE detective.** Given a multi-domain protein, use the PAE map to call domain boundaries before revealing them. Teaches what PAE actually means.
- **Annotated trajectory export.** Export a fold trajectory as a captioned GIF/video with the provenance and observables burned in — shareable, honest, and a teaching artifact in its own right.

### 5.3 Ambitious / cross-domain (the polymath angle)
- **Protein-as-music.** Map secondary-structure runs, pLDDT, and torsion angles to a sonification (Tone.js). Helices and sheets become motifs; confidence becomes timbre. This is not a gimmick — sonification of high-dimensional structure is a real analysis modality, and it connects the owner's music practice to the science. Honesty rule still applies: it sonifies the *teaching* model unless a real structure is loaded.
- **Generative structural art.** Use the confidence-colored CA trace and contact geometry as a generative-art seed (the existing SVG projection is already halfway there). A "print this fold" poster mode with the provenance as fine print. Connects the photography/visual practice.
- **Energy-landscape companion.** A physics-flavored side-scene contrasting the *thermodynamic* picture (funnel, Levinthal) with the *ML* picture (representational fixed point). This is the place to be most careful and most rewarding for a physicist: explicitly hold the two models apart and discuss where each is the right map.
- **Philosophy-of-models thread.** A recurring "map vs territory" note: pLDDT is a model of a model's reliability; the fold is a model of a structure that is itself a model of a dynamic ensemble. Good fuel for the owner's philosophy interest, and it sharpens scientific humility.

### 5.4 Integration with the owner's study workflow
- Hook the daily ritual into a scheduled morning task (the platform supports scheduled tasks).
- Export interpretation cards as spaced-repetition prompts (Anki-style) so the paper actually sticks.
- A "today I learned" log that ties each session to a paper section — turning the companion into a study instrument, not just a demo.

---

## 6. What "success" feels like for the learner

Not "I watched a protein fold." Rather: *"I can take a residue pair, tell you whether their coevolution implies contact and how I'd check; I can rotate a structure and know the model doesn't care; I can look at a confident-looking fold and tell you what it does and doesn't prove."* The app succeeds when the learner argues with it — when they reach for the "break it" toggle to test their own understanding.

---

## 7. Open pedagogical questions (for the owner to decide)

- How much of the real paper math to expose inline vs. link out? (Lean: expose the *idea* and the *one equation*, link the algorithm.)
- Single-learner depth vs. classroom breadth? The current primary user is a depth case; the creative backlog leans breadth. Pick before building §5.2+.
- Should the daily ritual be in-app or pushed (notification/email)? Affects whether to build scheduling now.

---

## 8. Sources

Same as `SPEC.md §9`. Pedagogy-specific: the AlphaFold2 companion guide PDF referenced in `frontend/src/data/paperGrounding.js` (`AlphaFold2_Companion_Guide.pdf`), and Jumper et al. Supplementary Information for exact algorithm definitions. Sonification-as-analysis and chirality-in-biology framings are standard; verify specific claims against current literature before publishing any of the §5.3 ideas as fact.
