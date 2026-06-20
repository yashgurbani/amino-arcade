from __future__ import annotations

import os
import stat
import time
import unittest
import uuid
import warnings
import threading
from pathlib import Path
from unittest.mock import patch

import numpy as np
from starlette.exceptions import StarletteDeprecationWarning

warnings.filterwarnings(
    "ignore",
    message=r"Using `httpx` with `starlette\.testclient` is deprecated.*",
    category=StarletteDeprecationWarning,
)

from fastapi.testclient import TestClient

from backend.app import app
from backend import job_queue
from backend.guardrails import InferenceConfig, preflight
from backend.physics import PhysicsRelaxationError, PhysicsStatus
from backend.prediction_engine import predict_structure
from backend.adapters import _localcolabfold_command, _run_dir, predict_with_engine
from backend.pdb_utils import read_model_groups, read_pdbs


class TestBackendAPI(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_simulator_returns_trajectory_and_teaching_provenance(self):
        sequence = "MGEELFTGVVPILVELDGDVNGHK"
        response = self.client.post("/api/predict", json={"sequence": sequence})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["provenance"]["kind"], "teaching-sim")
        self.assertNotEqual(data["provenance"]["kind"], "real-af2")
        self.assertGreaterEqual(len(data["frames"]), 1)
        self.assertIn("observables", data["frames"][-1])
        self.assertIn("pdb", data)

    def test_prediction_engine_keeps_realistic_backbone_bonds(self):
        sequence = "MGEELFTGVVPILVELDGDVNGHK"
        pdb, plddt = predict_structure(sequence)
        self.assertEqual(len(plddt), len(sequence))
        atoms = []
        for line in pdb.splitlines():
            if line.startswith("ATOM"):
                atoms.append(
                    {
                        "name": line[12:16].strip(),
                        "residue": int(line[22:26].strip()),
                        "coord": np.array([float(line[30:38]), float(line[38:46]), float(line[46:54])]),
                    }
                )
        self.assertEqual(len(atoms), 4 * len(sequence))
        for i in range(len(sequence)):
            residue = {a["name"]: a["coord"] for a in atoms if a["residue"] == i + 1}
            self.assertAlmostEqual(np.linalg.norm(residue["N"] - residue["CA"]), 1.46, delta=0.02)
            self.assertAlmostEqual(np.linalg.norm(residue["CA"] - residue["C"]), 1.52, delta=0.02)
            self.assertAlmostEqual(np.linalg.norm(residue["C"] - residue["O"]), 1.23, delta=0.02)

    def test_validation_and_preflight(self):
        invalid = self.client.post("/api/predict", json={"sequence": "MGEELX"})
        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(invalid.json()["message"], "Invalid amino acid sequence character 'X'.")

        long_teaching = self.client.post("/api/predict", json={"sequence": "A" * 800, "engine": "educational-simulator"})
        self.assertEqual(long_teaching.status_code, 200)

        ok = preflight(InferenceConfig(engine="localcolabfold", sequence_length=40, num_models=1, num_recycle=1))
        self.assertTrue(ok["ok"])
        blocked = preflight(InferenceConfig(engine="localcolabfold", sequence_length=140, num_models=5, num_recycle=12))
        self.assertFalse(blocked["ok"])
        self.assertIn("VRAM", blocked["message"])
        near_limit = preflight(InferenceConfig(engine="localcolabfold", sequence_length=768, num_models=1, num_recycle=4))
        self.assertTrue(near_limit["ok"])
        over_limit = preflight(InferenceConfig(engine="localcolabfold", sequence_length=769, num_models=1, num_recycle=4))
        self.assertFalse(over_limit["ok"])
        self.assertIn("safe limit", over_limit["message"])

        blocked_predict = self.client.post("/api/predict", json={"sequence": "A" * 800, "engine": "localcolabfold"})
        self.assertEqual(blocked_predict.status_code, 400)
        self.assertIn("safe limit", blocked_predict.json()["message"])

    def test_physics_status_and_relaxation_are_honest_when_openmm_missing(self):
        with patch("backend.physics.find_spec", return_value=None):
            status = self.client.get("/api/physics/status")
            self.assertEqual(status.status_code, 200)
            physics = status.json()["physics"]
            self.assertFalse(physics["available"])
            self.assertEqual(physics["label"], "local relaxation")
            self.assertIn("OpenMM is not installed", physics["message"])

            response = self.client.post(
                "/api/physics/local-relaxation",
                json={
                    "pdb": "ATOM      1  CA  ALA A   1       0.000   0.000   0.000  1.00 90.00           C\nEND\n",
                    "max_iterations": 10,
                },
            )
            self.assertEqual(response.status_code, 503)
            self.assertIn("OpenMM is not installed", response.json()["message"])

    def test_physics_relaxation_parametrization_failure_returns_422(self):
        nonstandard_pdb = (
            "ATOM      1  CA  MSE A   1       0.000   0.000   0.000  1.00 90.00           C\n"
            "END\n"
        )
        available = PhysicsStatus(
            available=True,
            label="local relaxation",
            mode="openmm-local-relaxation",
            message="OpenMM is available.",
            packages={"openmm": True, "pdbfixer": False},
        )
        with (
            patch("backend.app.physics_status", return_value=available),
            patch("backend.app.local_relaxation", side_effect=PhysicsRelaxationError("OpenMM could not relax this structure: No template found for residue MSE")),
        ):
            response = self.client.post(
                "/api/physics/local-relaxation",
                json={"pdb": nonstandard_pdb, "max_iterations": 10},
            )
        self.assertEqual(response.status_code, 422)
        body = response.json()
        self.assertEqual(body["status"], "error")
        self.assertTrue(body["not_folding"])
        self.assertIn("MSE", body["message"])

    def test_reference_pdb_proxy_returns_pdb_text(self):
        class FakeRcsbResponse:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def read(self):
                return b"HEADER    TEST\nATOM      1  CA  ALA A   1       0.000   0.000   0.000  1.00 90.00           C\nEND\n"

        with patch("backend.app.urlopen", return_value=FakeRcsbResponse()):
            response = self.client.get("/api/reference/pdb/4ins")
        self.assertEqual(response.status_code, 200)
        self.assertIn("ATOM", response.text)
        self.assertEqual(response.headers["content-type"].split(";")[0], "chemical/x-pdb")

    def test_job_logs_cancel_and_report(self):
        response = self.client.post("/api/predict/jobs", json={"sequence": "MGEELFTG"})
        self.assertEqual(response.status_code, 200)
        job_id = response.json()["job"]["id"]

        final = None
        for _ in range(30):
            status = self.client.get(f"/api/predict/jobs/{job_id}")
            final = status.json()["job"]
            if final["status"] in {"succeeded", "failed", "cancelled"}:
                break
            time.sleep(0.05)
        self.assertEqual(final["status"], "succeeded")

        logs = self.client.get(f"/api/predict/jobs/{job_id}/logs")
        self.assertEqual(logs.status_code, 200)
        self.assertTrue(logs.json()["logs"])

        result = self.client.get(f"/api/predict/jobs/{job_id}/result")
        self.assertEqual(result.status_code, 200)
        self.assertIn("pdb", result.json()["result"])
        self.assertEqual(result.json()["result"]["provenance"]["kind"], "teaching-sim")

        report = self.client.get(f"/api/predict/jobs/{job_id}/report")
        self.assertEqual(report.status_code, 200)
        self.assertEqual(report.json()["report"]["provenance"]["kind"], "teaching-sim")

        manifest = self.client.get(f"/api/predict/jobs/{job_id}/manifest")
        self.assertEqual(manifest.status_code, 200)
        manifest_data = manifest.json()["manifest"]
        self.assertEqual(manifest_data["frame_count"], 1)
        self.assertEqual(manifest_data["frames"][0]["index"], 0)
        self.assertTrue(manifest_data["frames"][0]["has_pdb"])
        self.assertNotIn("pdb", manifest_data["frames"][0])
        self.assertNotIn("pdb", manifest_data)

        frame = self.client.get(f"/api/predict/jobs/{job_id}/frames/0")
        self.assertEqual(frame.status_code, 200)
        self.assertTrue(frame.json()["frame"]["pdb"].startswith("HEADER"))

        missing_frame = self.client.get(f"/api/predict/jobs/{job_id}/frames/99")
        self.assertEqual(missing_frame.status_code, 404)

        cancel = self.client.post(f"/api/predict/jobs/{job_id}/cancel")
        self.assertEqual(cancel.status_code, 200)

    def test_persisted_job_reload_hydrates_full_cached_result(self):
        response = self.client.post("/api/predict/jobs", json={"sequence": "MGEELFTG"})
        self.assertEqual(response.status_code, 200)
        job_id = response.json()["job"]["id"]
        for _ in range(30):
            status = self.client.get(f"/api/predict/jobs/{job_id}")
            if status.json()["job"]["status"] == "succeeded":
                break
            time.sleep(0.05)

        loaded = job_queue.reload_persisted_jobs()
        self.assertGreaterEqual(loaded, 1)

        job = self.client.get(f"/api/predict/jobs/{job_id}")
        self.assertEqual(job.status_code, 200)
        self.assertEqual(job.json()["job"]["status"], "succeeded")

        result = self.client.get(f"/api/predict/jobs/{job_id}/result")
        self.assertEqual(result.status_code, 200)
        self.assertTrue(result.json()["result"]["pdb"].startswith("HEADER"))

        report = self.client.get(f"/api/predict/jobs/{job_id}/report")
        self.assertEqual(report.status_code, 200)
        self.assertTrue(report.json()["report"]["artifact_summary"]["has_pdb"])

    def test_examples_capabilities_and_compare(self):
        capabilities = self.client.get("/api/backend/capabilities").json()
        self.assertEqual(capabilities["status"], "success")
        self.assertTrue(any(engine["id"] == "localcolabfold" for engine in capabilities["engines"]))

        examples = self.client.get("/api/examples").json()
        self.assertGreaterEqual(len(examples["examples"]), 1)

        compare = self.client.post(
            "/api/compare",
            json={"sequence": "MGEELFTG", "engines": ["educational-simulator", "definitely-not-real"]},
        )
        self.assertEqual(compare.status_code, 200)
        self.assertEqual(compare.json()["comparisons"][0]["status"], "success")
        self.assertEqual(compare.json()["comparisons"][1]["status"], "error")

    def test_stubbed_localcolabfold_is_real_af2_path(self):
        tmp_path = Path("prediction-cache") / "test-stubs"
        tmp_path.mkdir(parents=True, exist_ok=True)
        stub = tmp_path / ("stub_colabfold.bat" if os.name == "nt" else "stub_colabfold.sh")
        if os.name == "nt":
            stub.write_text(
                r"""@echo off
set out=
:argloop
if "%~1"=="" goto doneargs
set out=%~1
shift
goto argloop
:doneargs
mkdir "%out%" 2>nul
echo HEADER    STUB>%out%\stub_unrelaxed_rank_001_model.r0.pdb
echo ATOM      1  CA  MET A   1       0.000   0.000   0.000  1.00 71.00           C>>%out%\stub_unrelaxed_rank_001_model.r0.pdb
echo END>>%out%\stub_unrelaxed_rank_001_model.r0.pdb
echo HEADER    STUB>%out%\stub_unrelaxed_rank_001_model.r1.pdb
echo ATOM      1  CA  MET A   1       1.000   0.000   0.000  1.00 91.00           C>>%out%\stub_unrelaxed_rank_001_model.r1.pdb
echo END>>%out%\stub_unrelaxed_rank_001_model.r1.pdb
echo HEADER    STUB>%out%\stub_rank_001.pdb
echo ATOM      1  CA  MET A   1       1.000   0.000   0.000  1.00 91.00           C>>%out%\stub_rank_001.pdb
echo END>>%out%\stub_rank_001.pdb
echo {"pae": [[0.0, 3.25], [3.25, 0.0]], "max_pae": 31.0}>%out%\stub_scores_rank_001_model_1.json
""",
                encoding="utf-8",
            )
        else:
            stub.write_text(
                """#!/usr/bin/env sh
for arg in "$@"; do out="$arg"; done
mkdir -p "$out"
cat > "$out/stub_unrelaxed_rank_001_model.r0.pdb" <<'PDB'
HEADER    STUB
ATOM      1  CA  MET A   1       0.000   0.000   0.000  1.00 71.00           C
END
PDB
cat > "$out/stub_unrelaxed_rank_001_model.r1.pdb" <<'PDB'
HEADER    STUB
ATOM      1  CA  MET A   1       1.000   0.000   0.000  1.00 91.00           C
END
PDB
cat > "$out/stub_rank_001.pdb" <<'PDB'
HEADER    STUB
ATOM      1  CA  MET A   1       1.000   0.000   0.000  1.00 91.00           C
END
PDB
cat > "$out/stub_scores_rank_001_model_1.json" <<'JSON'
{"pae": [[0.0, 3.25], [3.25, 0.0]], "max_pae": 31.0}
JSON
""",
                encoding="utf-8",
            )
            stub.chmod(stub.stat().st_mode | stat.S_IXUSR)
        alphabet = "ACDEFGHIKLMNPQRSTVWY"
        sequence = "MGEELFTG" + "".join(alphabet[int(char, 16) % len(alphabet)] for char in uuid.uuid4().hex[:4])
        with patch.dict(os.environ, {"LOCALCOLABFOLD_BIN": str(stub.resolve()), "AF_COMPANION_MAX_SEQUENCE": "150"}):
            response = self.client.post("/api/predict", json={"sequence": sequence, "engine": "localcolabfold"})
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual(data["provenance"]["kind"], "real-af2")
        self.assertEqual(data["engine"], "localcolabfold")
        self.assertEqual([frame["label"] for frame in data["frames"]], ["Recycle 0", "Recycle 1"])
        self.assertTrue(all(frame["pdb"].startswith("HEADER") for frame in data["frames"]))
        self.assertIn("recycle PDBs", data["meta"]["trajectory_note"])
        self.assertEqual(data["pae"], [[0.0, 3.25], [3.25, 0.0]])
        self.assertEqual([model["rank"] for model in data["models"]], [1])
        self.assertEqual([frame["label"] for frame in data["models"][0]["frames"]], ["Recycle 0", "Recycle 1"])
        self.assertEqual(data["ranking"]["metric"], "mean_plddt")
        self.assertEqual(data["models"][0]["mean_plddt"], 91.0)



    def test_localcolabfold_command_uses_current_boolean_template_flag(self):
        fasta = Path("query.fasta")
        out_dir = Path("out")
        with patch.dict(os.environ, {"LOCALCOLABFOLD_TEMPLATES": "0"}, clear=False):
            cmd = _localcolabfold_command("colabfold_batch", fasta, out_dir)
        self.assertNotIn("--templates", cmd)
        self.assertNotIn("0", cmd)
        self.assertIn("--overwrite-existing-results", cmd)
        self.assertIn("--save-recycles", cmd)
        self.assertEqual(cmd[-2:], [str(fasta), str(out_dir)])

        with patch.dict(
            os.environ,
            {
                "LOCALCOLABFOLD_TEMPLATES": "1",
                "LOCALCOLABFOLD_MSA_MODE": "single_sequence",
                "LOCALCOLABFOLD_MODEL_TYPE": "alphafold2_ptm",
                "LOCALCOLABFOLD_DATA_DIR": "models/colabfold-data",
                "LOCALCOLABFOLD_DISABLE_UNIFIED_MEMORY": "1",
            },
            clear=False,
        ):
            template_cmd = _localcolabfold_command("colabfold_batch", fasta, out_dir)
        self.assertIn("--templates", template_cmd)
        self.assertIn("--msa-mode", template_cmd)
        self.assertIn("single_sequence", template_cmd)
        self.assertIn("--model-type", template_cmd)
        self.assertIn("alphafold2_ptm", template_cmd)
        self.assertIn("--data", template_cmd)
        self.assertIn("models/colabfold-data", template_cmd)
        self.assertIn("--disable-unified-memory", template_cmd)
        self.assertEqual(template_cmd[-2:], [str(fasta), str(out_dir)])

    def test_localcolabfold_command_supports_reproducibility_seed_sweep(self):
        fasta = Path("query.fasta")
        out_dir = Path("out")
        with patch.dict(
            os.environ,
            {"LOCALCOLABFOLD_NUM_SEEDS": "2", "LOCALCOLABFOLD_RANDOM_SEED": "0"},
            clear=False,
        ):
            cmd = _localcolabfold_command("colabfold_batch", fasta, out_dir)
        self.assertEqual(cmd[cmd.index("--num-seeds") + 1], "2")
        self.assertEqual(cmd[cmd.index("--random-seed") + 1], "0")

    def test_msa_mode_is_normalized_into_job_options_and_cache_key(self):
        sequence = "MGEELFTG"
        opts_a = job_queue.normalize_options({"num_recycle": 8, "num_models": 1, "msa_mode": "single_sequence"})
        opts_b = job_queue.normalize_options({"num_recycle": 8, "num_models": 1, "msa_mode": "mmseqs2_uniref_env"})
        self.assertEqual(opts_a["msa_mode"], "single_sequence")
        self.assertEqual(opts_b["msa_mode"], "mmseqs2_uniref_env")
        self.assertNotEqual(
            job_queue.cache_key(sequence, "localcolabfold", opts_a),
            job_queue.cache_key(sequence, "localcolabfold", opts_b),
        )

        response = self.client.post(
            "/api/predict/jobs",
            json={"sequence": sequence, "engine": "educational-simulator", "msa_mode": "single_sequence"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["job"]["options"]["msa_mode"], "single_sequence")

    def test_msa_mode_option_feeds_localcolabfold_command(self):
        fasta = Path("query.fasta")
        out_dir = Path("out")
        with patch.dict(os.environ, {"LOCALCOLABFOLD_MSA_MODE": "mmseqs2_uniref_env"}, clear=False):
            cmd = _localcolabfold_command("colabfold_batch", fasta, out_dir)
        self.assertIn("--msa-mode", cmd)
        self.assertIn("mmseqs2_uniref_env", cmd)

    def test_run_dir_uses_hash_not_sequence_prefix_only(self):
        seq_a = "A" * 28 + "C"
        seq_b = "A" * 28 + "D"
        dir_a = _run_dir("localcolabfold", seq_a)
        dir_b = _run_dir("localcolabfold", seq_b)
        self.assertNotEqual(dir_a, dir_b)
        self.assertIn("AAAAAAAAAAAAAAAAAAAAAAAAAAAA", dir_a.name)
        self.assertNotIn(seq_a, str(dir_a))

    def test_localcolabfold_prediction_is_single_flight_around_process_env(self):
        barrier = threading.Barrier(2)
        seen: list[tuple[int, str | None]] = []

        def fake_predict(sequence, cancel_event=None, log_callback=None):
            seen.append((len(seen), os.environ.get("LOCALCOLABFOLD_NUM_RECYCLE")))
            if len(seen) == 1:
                barrier.wait(timeout=2)
                time.sleep(0.05)
            return {"status": "success", "frames": [{"pdb": "HEADER\nATOM\n"}], "provenance": {"kind": "real-af2"}}

        def call(recycles):
            return predict_with_engine("ACDEFG", "localcolabfold", options={"num_recycle": recycles})

        with patch("backend.adapters._predict_localcolabfold", side_effect=fake_predict):
            thread = threading.Thread(target=call, args=(2,))
            thread.start()
            barrier.wait(timeout=2)
            second = call(7)
            thread.join(timeout=2)

        self.assertEqual(second["status"], "success")
        self.assertEqual([value for _, value in seen], ["2", "7"])


    def test_recycle_pdbs_are_preferred_and_sorted_numerically(self):
        tmp_path = Path("prediction-cache") / "test-recycle-order"
        tmp_path.mkdir(parents=True, exist_ok=True)
        for name in ["query_unrelaxed_rank_001_model.r10.pdb", "query_unrelaxed_rank_001_model.r2.pdb", "query_unrelaxed_rank_001_model.r0.pdb", "query_rank_001.pdb"]:
            (tmp_path / name).write_text("HEADER    STUB\nATOM      1  CA  MET A   1       0.000   0.000   0.000  1.00 91.00           C\nEND\n", encoding="utf-8")
        ordered = [path.name for path in read_pdbs(tmp_path)]
        self.assertEqual(
            ordered,
            [
                "query_unrelaxed_rank_001_model.r0.pdb",
                "query_unrelaxed_rank_001_model.r2.pdb",
                "query_unrelaxed_rank_001_model.r10.pdb",
            ],
        )

    def test_model_groups_keep_ranked_recycles_separate(self):
        tmp_path = Path("prediction-cache") / "test-ranked-model-groups"
        tmp_path.mkdir(parents=True, exist_ok=True)
        for name in [
            "query_unrelaxed_rank_002_alphafold2_ptm_model_4_seed_000.r1.pdb",
            "query_unrelaxed_rank_001_alphafold2_ptm_model_3_seed_000.r1.pdb",
            "query_unrelaxed_rank_002_alphafold2_ptm_model_4_seed_000.r0.pdb",
            "query_unrelaxed_rank_001_alphafold2_ptm_model_3_seed_000.r0.pdb",
            "query_unrelaxed_rank_002_alphafold2_ptm_model_4_seed_000.pdb",
            "query_unrelaxed_rank_001_alphafold2_ptm_model_3_seed_000.pdb",
        ]:
            (tmp_path / name).write_text("HEADER    STUB\nATOM      1  CA  MET A   1       0.000   0.000   0.000  1.00 91.00           C\nEND\n", encoding="utf-8")
        groups = read_model_groups(tmp_path)
        self.assertEqual([group["rank"] for group in groups], [1, 2])
        self.assertEqual(groups[0]["model_id"], "model_3")
        self.assertEqual(groups[1]["model_id"], "model_4")
        self.assertEqual([path.name for path in groups[0]["recycle_frames"]], [
            "query_unrelaxed_rank_001_alphafold2_ptm_model_3_seed_000.r0.pdb",
            "query_unrelaxed_rank_001_alphafold2_ptm_model_3_seed_000.r1.pdb",
        ])
        self.assertEqual([path.name for path in groups[1]["recycle_frames"]], [
            "query_unrelaxed_rank_002_alphafold2_ptm_model_4_seed_000.r0.pdb",
            "query_unrelaxed_rank_002_alphafold2_ptm_model_4_seed_000.r1.pdb",
        ])

    def test_model_groups_accept_rankless_localcolabfold_outputs(self):
        tmp_path = Path("prediction-cache") / "test-rankless-model-groups"
        tmp_path.mkdir(parents=True, exist_ok=True)
        for name in [
            "query_unrelaxed_alphafold2_ptm_model_2_seed_000.r0.pdb",
            "query_unrelaxed_alphafold2_ptm_model_1_seed_000.r1.pdb",
            "query_unrelaxed_alphafold2_ptm_model_2_seed_000.r1.pdb",
            "query_unrelaxed_alphafold2_ptm_model_1_seed_000.pdb",
            "query_unrelaxed_alphafold2_ptm_model_2_seed_000.pdb",
        ]:
            (tmp_path / name).write_text("HEADER    STUB\nATOM      1  CA  MET A   1       0.000   0.000   0.000  1.00 91.00           C\nEND\n", encoding="utf-8")
        groups = read_model_groups(tmp_path)
        self.assertEqual([group["rank"] for group in groups], [1, 2])
        self.assertEqual(groups[0]["model_id"], "model_1")
        self.assertEqual(groups[1]["model_id"], "model_2")
        self.assertEqual([path.name for path in groups[0]["recycle_frames"]], [
            "query_unrelaxed_alphafold2_ptm_model_1_seed_000.r1.pdb",
        ])
        self.assertEqual([path.name for path in groups[1]["recycle_frames"]], [
            "query_unrelaxed_alphafold2_ptm_model_2_seed_000.r0.pdb",
            "query_unrelaxed_alphafold2_ptm_model_2_seed_000.r1.pdb",
        ])

    def test_cancelling_localcolabfold_job_terminates_subprocess_path(self):
        tmp_path = Path("prediction-cache") / "test-stubs"
        tmp_path.mkdir(parents=True, exist_ok=True)
        unique = uuid.uuid4().hex
        stub = tmp_path / (f"slow_colabfold_{unique}.bat" if os.name == "nt" else f"slow_colabfold_{unique}.sh")
        marker = (tmp_path / f"slow_colabfold_started_{unique}.txt").resolve()
        if os.name == "nt":
            stub.write_text(
                "@echo off\n"
                f"echo started>{marker}\n"
                "ping -n 31 127.0.0.1 >nul\n"
                "exit /b 0\n",
                encoding="utf-8",
            )
        else:
            stub.write_text(
                f"#!/usr/bin/env sh\necho started > '{marker}'\nsleep 30\nexit 0\n",
                encoding="utf-8",
            )
            stub.chmod(stub.stat().st_mode | stat.S_IXUSR)

        alphabet = "ACDEFGHIKLMNPQRSTVWY"
        sequence = "ACDEFGHIKLMNPQ" + "".join(alphabet[int(char, 16) % len(alphabet)] for char in uuid.uuid4().hex[:4])
        cache_file = job_queue.cache_path(sequence, "localcolabfold")
        cache_file.unlink(missing_ok=True)
        with patch.dict(os.environ, {"LOCALCOLABFOLD_BIN": str(stub.resolve()), "AF_COMPANION_MAX_SEQUENCE": "150"}):
            response = self.client.post("/api/predict/jobs", json={"sequence": sequence, "engine": "localcolabfold"})
            self.assertEqual(response.status_code, 200)
            job_id = response.json()["job"]["id"]
            for _ in range(20):
                if marker.exists():
                    break
                time.sleep(0.05)
            cancel = self.client.post(f"/api/predict/jobs/{job_id}/cancel")
            self.assertEqual(cancel.status_code, 200)
            final = None
            for _ in range(80):
                final = self.client.get(f"/api/predict/jobs/{job_id}").json()["job"]
                if final["status"] == "cancelled":
                    break
                time.sleep(0.05)
        self.assertEqual(final["status"], "cancelled")
        logs = []
        for _ in range(40):
            logs = self.client.get(f"/api/predict/jobs/{job_id}/logs").json()["logs"]
            if any("terminating LocalColabFold subprocess" in line for line in logs):
                break
            time.sleep(0.05)
        self.assertTrue(any("terminating LocalColabFold subprocess" in line for line in logs))


if __name__ == "__main__":
    unittest.main()
