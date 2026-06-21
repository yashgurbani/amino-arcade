import numpy as np
from typing import List, Tuple, Dict

# Educational simulator used by the companion app.
#
# This is intentionally not a real AlphaFold2 implementation. It creates
# deterministic backbone-like coordinates so the UI can teach pLDDT coloring,
# local frames, recycling, and API behavior without requiring model weights.

# Standard 1-letter to 3-letter amino acid code mapping
AA_MAP = {
    'A': 'ALA', 'R': 'ARG', 'N': 'ASN', 'D': 'ASP', 'C': 'CYS',
    'Q': 'GLN', 'E': 'GLU', 'G': 'GLY', 'H': 'HIS', 'I': 'ILE',
    'L': 'LEU', 'K': 'LYS', 'M': 'MET', 'F': 'PHE', 'P': 'PRO',
    'S': 'SER', 'T': 'THR', 'W': 'TRP', 'Y': 'TYR', 'V': 'VAL'
}

# Propensities for Helix and Sheet (Chou-Fasman derived values)
PROPENSITIES = {
    # Residue: (P_alpha, P_beta)
    'A': (1.42, 0.83), 'R': (0.98, 0.93), 'N': (0.67, 0.89), 'D': (1.01, 0.54),
    'C': (0.70, 1.19), 'Q': (1.11, 1.10), 'E': (1.51, 0.37), 'G': (0.57, 0.75),
    'H': (1.00, 0.87), 'I': (1.08, 1.60), 'L': (1.21, 1.30), 'K': (1.14, 0.74),
    'M': (1.45, 1.05), 'F': (1.13, 1.38), 'P': (0.57, 0.55), 'S': (0.77, 0.75),
    'T': (0.83, 1.19), 'W': (1.08, 1.37), 'Y': (0.69, 1.47), 'V': (1.06, 1.70)
}

def predict_secondary_structure(sequence: str) -> List[str]:
    """
    Predicts secondary structure states ('H' for Helix, 'E' for Strand, 'C' for Coil)
    for each residue in the sequence using a propensity-based window approach.
    """
    n = len(sequence)
    states = []
    
    # Calculate smoothed propensities using a sliding window of size 5
    for i in range(n):
        window_start = max(0, i - 2)
        window_end = min(n, i + 3)
        window_residues = sequence[window_start:window_end]
        
        avg_helix = sum(PROPENSITIES.get(r.upper(), (1.0, 1.0))[0] for r in window_residues) / len(window_residues)
        avg_sheet = sum(PROPENSITIES.get(r.upper(), (1.0, 1.0))[1] for r in window_residues) / len(window_residues)
        
        if avg_helix > avg_sheet and avg_helix > 1.0:
            states.append('H')
        elif avg_sheet > avg_helix and avg_sheet > 1.0:
            states.append('E')
        else:
            states.append('C')
            
    # Smoothing pass: remove isolated single-residue states to make it physically realistic
    for i in range(1, n - 1):
        if states[i] != states[i-1] and states[i-1] == states[i+1]:
            states[i] = states[i-1]
            
    return states

def nerf_step(p1: np.ndarray, p2: np.ndarray, p3: np.ndarray, 
              d: float, theta: float, chi: float) -> np.ndarray:
    """
    Natural Extension Reference Frame (NeRF) algorithm step.
    Computes Cartesian coordinates of atom p4 given the coordinates of three
    previously placed atoms p1, p2, p3, the bond length d, the bond angle theta
    (angle p2-p3-p4), and the dihedral angle chi (rotation around bond p2-p3).
    """
    # Vectors and units
    u_cb = p3 - p2
    u_cb_norm = np.linalg.norm(u_cb)
    u_cb = u_cb / u_cb_norm if u_cb_norm > 0 else u_cb
    
    u_ba = p2 - p1
    
    # Normal to plane p1-p2-p3
    v_n = np.cross(u_ba, u_cb)
    v_n_norm = np.linalg.norm(v_n)
    v_n = v_n / v_n_norm if v_n_norm > 0 else v_n
    
    # Cross normal
    w_n = np.cross(v_n, u_cb)
    
    # Position in local coordinates
    # theta is the bond angle (angle between bonds is pi - theta)
    x = -d * np.cos(theta)
    y = d * np.sin(theta) * np.cos(chi)
    z = d * np.sin(theta) * np.sin(chi)
    
    # Transform to global coordinates
    p4 = p3 + x * u_cb + y * w_n + z * v_n
    return p4

def generate_backbone_coordinates(sequence: str, states: List[str]) -> Tuple[List[Dict[str, np.ndarray]], List[float]]:
    """
    Generates Cartesian coordinates (N, CA, C, O) and pLDDT scores for each residue.
    """
    # Standard bond lengths (in Angstroms)
    d_N_CA = 1.46
    d_CA_C = 1.52
    d_C_N = 1.33
    d_C_O = 1.23
    
    # Standard bond angles (in Radians)
    theta_C_N_CA = np.radians(121.0)
    theta_N_CA_C = np.radians(111.0)
    theta_CA_C_N = np.radians(116.0)
    
    coords = []
    plddts = []
    n_res = len(sequence)
    
    if n_res == 0:
        return [], []
        
    # 1. Initialize first residue atoms (N, CA, C)
    # Place N at origin
    n_pos = np.array([0.0, 0.0, 0.0])
    
    # Place CA along x-axis
    ca_pos = np.array([d_N_CA, 0.0, 0.0])
    
    # Place C in x-y plane
    angle_rad = np.radians(180.0 - 111.0)  # Using N-CA-C angle
    c_pos = np.array([
        d_N_CA - d_CA_C * np.cos(angle_rad),
        d_CA_C * np.sin(angle_rad),
        0.0
    ])
    
    coords.append({'N': n_pos, 'CA': ca_pos, 'C': c_pos})
    
    # 2. Reconstruct subsequent residues using NeRF
    for i in range(1, n_res):
        prev_coords = coords[-1]
        
        # Dihedral angles for current residue from predicted secondary structure
        state = states[i]
        if state == 'H':
            phi = np.radians(-57.0)
            psi = np.radians(-47.0)
        elif state == 'E':
            phi = np.radians(-135.0)
            psi = np.radians(135.0)
        else:  # 'C'
            phi = np.radians(-60.0)
            psi = np.radians(30.0)
            
        omega = np.radians(180.0)  # Trans-peptide bond
        
        # Place N_i using N_{i-1}, CA_{i-1}, C_{i-1}
        # Dihedral around CA-C is psi_{i-1} (we use current psi as simplification)
        n_curr = nerf_step(prev_coords['N'], prev_coords['CA'], prev_coords['C'], d_C_N, theta_CA_C_N, psi)
        
        # Place CA_i using CA_{i-1}, C_{i-1}, N_i
        # Dihedral around C-N is omega (trans-peptide bond)
        ca_curr = nerf_step(prev_coords['CA'], prev_coords['C'], n_curr, d_N_CA, theta_C_N_CA, omega)
        
        # Place C_i using C_{i-1}, N_i, CA_i
        # Dihedral around N-CA is phi
        c_curr = nerf_step(prev_coords['C'], n_curr, ca_curr, d_CA_C, theta_N_CA_C, phi)
        
        coords.append({'N': n_curr, 'CA': ca_curr, 'C': c_curr})
        
    # 3. Add Carbonyl Oxygen (O) for each residue
    # Place O in the plane of CA, C, N_next (trans to hydrogen)
    for i in range(n_res):
        c_i = coords[i]['C']
        ca_i = coords[i]['CA']
        
        if i < n_res - 1:
            n_next = coords[i+1]['N']
            # Compute bisector direction of CA-C and N_next-C
            v_ca = (ca_i - c_i) / np.linalg.norm(ca_i - c_i)
            v_n = (n_next - c_i) / np.linalg.norm(n_next - c_i)
            v_bis = v_ca + v_n
            v_bis /= np.linalg.norm(v_bis)
            o_pos = c_i - d_C_O * v_bis
        else:
            # For the last residue, pretend there is a dummy next N
            dummy_n = nerf_step(coords[-1]['N'], coords[-1]['CA'], coords[-1]['C'], d_C_N, theta_CA_C_N, np.radians(-47.0))
            v_ca = (ca_i - c_i) / np.linalg.norm(ca_i - c_i)
            v_n = (dummy_n - c_i) / np.linalg.norm(dummy_n - c_i)
            v_bis = v_ca + v_n
            v_bis /= np.linalg.norm(v_bis)
            o_pos = c_i - d_C_O * v_bis
            
        coords[i]['O'] = o_pos
        
    # 4. Generate simulated realistic pLDDT profile
    for i in range(n_res):
        state = states[i]
        # Base confidence
        if state == 'H':
            base_score = 92.5
        elif state == 'E':
            base_score = 88.0
        else:
            base_score = 64.0
            
        # Terminal penalty (ends of the protein are more flexible/disordered)
        dist_to_end = min(i, n_res - 1 - i)
        if dist_to_end < 10:
            penalty = 1.0 - 0.35 * ((10 - dist_to_end) / 10.0)
            base_score *= penalty
            
        # Add deterministic pseudo-random fluctuation (not random seed dependent, so it's reproducible)
        noise = 2.5 * np.sin(i * 0.6) + 1.2 * np.cos(i * 1.4)
        score = max(15.0, min(100.0, base_score + noise))
        plddts.append(float(round(score, 2)))
        
    return coords, plddts

def build_pdb_string(sequence: str, coords: List[Dict[str, np.ndarray]], plddts: List[float]) -> str:
    """Formats coordinates and pLDDTs into a standard PDB string."""
    pdb_lines = []
    pdb_lines.append("HEADER    PROTEIN STRUCTURE SIMULATION")
    pdb_lines.append("COMPND    LOCAL SIMULATED BACKBONE MODEL")
    
    def format_atom_name(name: str) -> str:
        if len(name) < 4:
            return f" {name:<3s}"
        return f"{name:<4s}"
        
    atom_idx = 1
    for res_idx, r_char in enumerate(sequence):
        res_name = AA_MAP.get(r_char.upper(), 'UNK')
        res_coords = coords[res_idx]
        plddt = plddts[res_idx]
        
        # Write heavy backbone atoms
        for atom_name in ['N', 'CA', 'C', 'O']:
            coord = res_coords[atom_name]
            element = atom_name[0]
            atom_name_formatted = format_atom_name(atom_name)
            
            x, y, z = coord
            line = (
                f"ATOM  "                  # 1-6
                f"{atom_idx:5d}"            # 7-11
                f" "                        # 12
                f"{atom_name_formatted}"    # 13-16
                f" "                        # 17
                f"{res_name:3s}"            # 18-20
                f" "                        # 21
                f"A"                        # 22
                f"{res_idx+1:4d}"           # 23-26
                f" "                        # 27
                f"   "                      # 28-30
                f"{x:8.3f}"                 # 31-38
                f"{y:8.3f}"                 # 39-46
                f"{z:8.3f}"                 # 47-54
                f" 1.00"                    # 55-60
                f"{plddt:6.2f}"             # 61-66
                f"          "               # 67-76
                f"{element:>2s}"            # 77-78
            )
            pdb_lines.append(line)
            atom_idx += 1
            
    pdb_lines.append("TER")
    pdb_lines.append("END")
    return "\n".join(pdb_lines) + "\n"

def predict_structure(sequence: str) -> Tuple[str, List[float]]:
    """
    Predict structure from sequence. Returns PDB string and pLDDT scores.
    """
    states = predict_secondary_structure(sequence)
    coords, plddts = generate_backbone_coordinates(sequence, states)
    pdb_string = build_pdb_string(sequence, coords, plddts)
    return pdb_string, plddts
