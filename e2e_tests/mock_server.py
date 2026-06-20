import time
import numpy as np
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Tuple, Dict, Optional

app = FastAPI(title="AlphaFold 3D Companion Mock Backend")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global Mock Configuration
class MockState:
    vram_limit_aa: int = 150
    latency_seconds: float = 0.0
    simulate_oom: bool = False
    simulate_internal_error: bool = False
    simulate_corrupt_pdb: bool = False

state = MockState()

class PredictRequest(BaseModel):
    sequence: str

class ConfigureRequest(BaseModel):
    vram_limit_aa: Optional[int] = 150
    latency_seconds: Optional[float] = 0.0
    simulate_oom: Optional[bool] = False
    simulate_internal_error: Optional[bool] = False
    simulate_corrupt_pdb: Optional[bool] = False

# Chou-Fasman Propensity & NeRF coordinate generator logic
AA_MAP = {
    'A': 'ALA', 'R': 'ARG', 'N': 'ASN', 'D': 'ASP', 'C': 'CYS',
    'Q': 'GLN', 'E': 'GLU', 'G': 'GLY', 'H': 'HIS', 'I': 'ILE',
    'L': 'LEU', 'K': 'LYS', 'M': 'MET', 'F': 'PHE', 'P': 'PRO',
    'S': 'SER', 'T': 'THR', 'W': 'TRP', 'Y': 'TYR', 'V': 'VAL'
}

PROPENSITIES = {
    'A': (1.42, 0.83), 'R': (0.98, 0.93), 'N': (0.67, 0.89), 'D': (1.01, 0.54),
    'C': (0.70, 1.19), 'Q': (1.11, 1.10), 'E': (1.51, 0.37), 'G': (0.57, 0.75),
    'H': (1.00, 0.87), 'I': (1.08, 1.60), 'L': (1.21, 1.30), 'K': (1.14, 0.74),
    'M': (1.45, 1.05), 'F': (1.13, 1.38), 'P': (0.57, 0.55), 'S': (0.77, 0.75),
    'T': (0.83, 1.19), 'W': (1.08, 1.37), 'Y': (0.69, 1.47), 'V': (1.06, 1.70)
}

def predict_secondary_structure(sequence: str) -> List[str]:
    n = len(sequence)
    states = []
    for i in range(n):
        window_start = max(0, i - 2)
        window_end = min(n, i + 3)
        window_residues = sequence[window_start:window_end]
        
        avg_helix = sum(PROPENSITIES.get(r, (1.0, 1.0))[0] for r in window_residues) / len(window_residues)
        avg_sheet = sum(PROPENSITIES.get(r, (1.0, 1.0))[1] for r in window_residues) / len(window_residues)
        
        if avg_helix > avg_sheet and avg_helix > 1.0:
            states.append('H')
        elif avg_sheet > avg_helix and avg_sheet > 1.0:
            states.append('E')
        else:
            states.append('C')
            
    # Smoothing loops
    for i in range(1, n - 1):
        if states[i] != states[i-1] and states[i-1] == states[i+1]:
            states[i] = states[i-1]
            
    return states

def nerf_step(p1: np.ndarray, p2: np.ndarray, p3: np.ndarray, 
              d: float, theta: float, chi: float) -> np.ndarray:
    u_cb = p3 - p2
    u_cb_norm = np.linalg.norm(u_cb)
    u_cb = u_cb / u_cb_norm if u_cb_norm > 0 else u_cb
    
    u_ba = p2 - p1
    
    v_n = np.cross(u_ba, u_cb)
    v_n_norm = np.linalg.norm(v_n)
    v_n = v_n / v_n_norm if v_n_norm > 0 else v_n
    
    w_n = np.cross(v_n, u_cb)
    
    x = -d * np.cos(theta)
    y = d * np.sin(theta) * np.cos(chi)
    z = d * np.sin(theta) * np.sin(chi)
    
    p4 = p3 + x * u_cb + y * w_n + z * v_n
    return p4

def generate_backbone_coordinates(sequence: str, states: List[str]) -> Tuple[List[Dict[str, np.ndarray]], List[float]]:
    d_N_CA = 1.46
    d_CA_C = 1.52
    d_C_N = 1.33
    d_C_O = 1.23
    
    theta_C_N_CA = np.radians(121.0)
    theta_N_CA_C = np.radians(111.0)
    theta_CA_C_N = np.radians(116.0)
    
    coords = []
    plddts = []
    n_res = len(sequence)
    
    # 1. Initialize first residue atoms
    n_pos = np.array([0.0, 0.0, 0.0])
    ca_pos = np.array([d_N_CA, 0.0, 0.0])
    angle_rad = np.radians(180.0 - 111.0)
    c_pos = np.array([
        d_N_CA - d_CA_C * np.cos(angle_rad),
        d_CA_C * np.sin(angle_rad),
        0.0
    ])
    
    coords.append({'N': n_pos, 'CA': ca_pos, 'C': c_pos})
    
    # 2. Reconstruct subsequent residues
    for i in range(1, n_res):
        prev_coords = coords[-1]
        state_char = states[i]
        
        if state_char == 'H':
            phi = np.radians(-57.0)
            psi = np.radians(-47.0)
        elif state_char == 'E':
            phi = np.radians(-135.0)
            psi = np.radians(135.0)
        else:
            phi = np.radians(-60.0)
            psi = np.radians(30.0)
            
        omega = np.radians(180.0)
        
        n_curr = nerf_step(prev_coords['N'], prev_coords['CA'], prev_coords['C'], d_C_N, theta_CA_C_N, psi)
        ca_curr = nerf_step(prev_coords['CA'], prev_coords['C'], n_curr, d_N_CA, theta_C_N_CA, omega)
        c_curr = nerf_step(prev_coords['C'], n_curr, ca_curr, d_CA_C, theta_N_CA_C, phi)
        
        coords.append({'N': n_curr, 'CA': ca_curr, 'C': c_curr})
        
    # 3. Add Carbonyl Oxygen
    for i in range(n_res):
        c_i = coords[i]['C']
        ca_i = coords[i]['CA']
        
        if i < n_res - 1:
            n_next = coords[i+1]['N']
            v_ca = (ca_i - c_i) / np.linalg.norm(ca_i - c_i)
            v_n = (n_next - c_i) / np.linalg.norm(n_next - c_i)
            v_bis = v_ca + v_n
            v_bis /= np.linalg.norm(v_bis)
            o_pos = c_i - d_C_O * v_bis
        else:
            v_ca_c = (c_i - ca_i) / np.linalg.norm(c_i - ca_i)
            o_pos = c_i + d_C_O * v_ca_c
            
        coords[i]['O'] = o_pos
        
    # 4. Generate simulated pLDDT profile
    for i in range(n_res):
        state_char = states[i]
        if state_char == 'H':
            base_score = 92.5
        elif state_char == 'E':
            base_score = 88.0
        else:
            base_score = 64.0
            
        dist_to_end = min(i, n_res - 1 - i)
        if dist_to_end < 10:
            penalty = 1.0 - 0.35 * ((10 - dist_to_end) / 10.0)
            base_score *= penalty
            
        noise = 2.5 * np.sin(i * 0.6) + 1.2 * np.cos(i * 1.4)
        score = max(15.0, min(100.0, base_score + noise))
        plddts.append(float(round(score, 2)))
        
    return coords, plddts

def build_pdb_string(sequence: str, coords: List[Dict[str, np.ndarray]], plddts: List[float]) -> str:
    pdb_lines = []
    pdb_lines.append("HEADER    PROTEIN STRUCTURE SIMULATION")
    pdb_lines.append("COMPND    LOCAL SIMULATED BACKBONE MODEL")
    
    atom_idx = 1
    for res_idx, r_char in enumerate(sequence):
        res_name = AA_MAP.get(r_char.upper(), 'UNK')
        res_coords = coords[res_idx]
        plddt = plddts[res_idx]
        
        for atom_name in ['N', 'CA', 'C', 'O']:
            coord = res_coords[atom_name]
            element = atom_name[0]
            formatted_atom = f" {atom_name:<3s}"
            x, y, z = coord
            line = (
                f"ATOM  {atom_idx:5d} {formatted_atom}{res_name:3s} A{res_idx+1:4d}    "
                f"{x:8.3f}{y:8.3f}{z:8.3f}  1.00{plddt:6.2f}           {element:>2s}"
            )
            pdb_lines.append(line)
            atom_idx += 1
            
    pdb_lines.append("TER")
    pdb_lines.append("END")
    return "\n".join(pdb_lines) + "\n"

# Endpoints
@app.get("/health")
def health():
    return {"status": "healthy"}

@app.post("/api/mock/configure")
def configure(payload: ConfigureRequest):
    if payload.vram_limit_aa is not None:
        state.vram_limit_aa = payload.vram_limit_aa
    if payload.latency_seconds is not None:
        state.latency_seconds = payload.latency_seconds
    if payload.simulate_oom is not None:
        state.simulate_oom = payload.simulate_oom
    if payload.simulate_internal_error is not None:
        state.simulate_internal_error = payload.simulate_internal_error
    if payload.simulate_corrupt_pdb is not None:
        state.simulate_corrupt_pdb = payload.simulate_corrupt_pdb
    return {"status": "configured"}

@app.post("/api/predict")
def predict(payload: PredictRequest):
    # Handle global configurations
    if state.simulate_internal_error or payload.sequence == "MOCKINTERNALERROR":
        raise HTTPException(status_code=500, detail="Internal Server Error: Simulated crash")
        
    latency = state.latency_seconds
    if payload.sequence == "MOCKTIMEOUT":
        latency = 10.0
        
    if latency > 0:
        time.sleep(latency)
        
    # Check VRAM simulation
    if state.simulate_oom or payload.sequence == "MOCKVRAMERROR":
        return {
            "status": "error",
            "message": "VRAM limit exceeded: Sequence length too long for GPU memory (8GB VRAM constraint)."
        }
        
    # Sanitize FASTA format and whitespaces
    seq_raw = payload.sequence.strip()
    lines = seq_raw.split('\n')
    sanitized_lines = [line.strip() for line in lines if not line.strip().startswith('>')]
    sanitized = "".join(sanitized_lines).replace(" ", "")
    
    # Check sequence limit
    if len(sanitized) > state.vram_limit_aa:
        return {
            "status": "error",
            "message": "VRAM limit exceeded: Sequence length too long for GPU memory (8GB VRAM constraint)."
        }
        
    # Special triggers
    is_corrupt = state.simulate_corrupt_pdb or payload.sequence == "MOCKCORRUPT"
    is_success = payload.sequence == "MOCKSUCCESS"
    
    # Normal amino acid check (only bypass for special triggers)
    if not (is_success or is_corrupt or payload.sequence in ["MOCKTIMEOUT"]):
        # Validate characters
        valid_chars = set("ACDEFGHIKLMNPQRSTVWY")
        for char in sanitized.upper():
            if char not in valid_chars:
                return Response(
                    status_code=400,
                    content=f'{{"status": "error", "message": "Invalid amino acid sequence character \'{char}\'."}}',
                    media_type="application/json"
                )
                
    # If sequence is empty
    if len(sanitized) == 0:
        return Response(
            status_code=400,
            content='{"status": "error", "message": "Sequence cannot be empty."}',
            media_type="application/json"
        )
        
    # For MOCKSUCCESS or similar, let's use a standard sequence for coordinate rendering
    seq_for_coords = sanitized
    if is_success or payload.sequence in ["MOCKTIMEOUT", "MOCKCORRUPT"]:
        seq_for_coords = "MGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVP"
        
    # Generate coordinates
    clean_seq = "".join([c if c.upper() in AA_MAP else 'A' for c in seq_for_coords]).upper()
    states = predict_secondary_structure(clean_seq)
    coords, plddts = generate_backbone_coordinates(clean_seq, states)
    
    if is_corrupt:
        pdb_str = "INVALID PDB FORMAT CODES JUNK CONTENT"
    else:
        pdb_str = build_pdb_string(clean_seq, coords, plddts)
        
    # Adjust response sequence
    resp_seq = sanitized.upper()
    if is_success or payload.sequence in ["MOCKTIMEOUT", "MOCKCORRUPT"]:
        resp_seq = clean_seq
        
    return {
        "status": "success",
        "sequence": resp_seq,
        "pdb": pdb_str,
        "plddt": plddts
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
