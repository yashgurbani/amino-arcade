import os
import sys
import subprocess
import time
import urllib.request
import urllib.error
import json
import unittest

MOCK_SERVER_URL = "http://127.0.0.1:8000"

def wait_for_mock_server(url: str, timeout: float = 5.0) -> bool:
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            req = urllib.request.Request(f"{url}/health", method="GET")
            with urllib.request.urlopen(req, timeout=1.0) as response:
                if response.getcode() == 200:
                    body = json.loads(response.read().decode('utf-8'))
                    if body.get("status") == "healthy":
                        return True
        except Exception:
            pass
        time.sleep(0.2)
    return False

def configure_mock(payload: dict):
    url = f"{MOCK_SERVER_URL}/api/mock/configure"
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=2.0) as response:
            return response.getcode(), json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8')
    except Exception as e:
        return -1, str(e)

def send_predict(payload: dict):
    url = f"{MOCK_SERVER_URL}/api/predict"
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=5.0) as response:
            return response.getcode(), json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode('utf-8'))
        except Exception:
            body = e.read().decode('utf-8')
        return e.code, body
    except Exception as e:
        return -1, str(e)

def run_specific_test(test_name: str):
    # Runs a single test case from test_suite
    mock_server_dir = os.path.dirname(__file__)
    cmd = [sys.executable, "-m", "unittest", f"test_suite.E2ETestSuite.{test_name}"]
    env = os.environ.copy()
    env["BYPASS_MOCK_RESET"] = "1"
    res = subprocess.run(cmd, cwd=mock_server_dir, env=env, capture_output=True, text=True)
    return res.returncode == 0, res.stdout + "\n" + res.stderr

def main():
    server_port = 8000
    server_url = f"http://127.0.0.1:{server_port}"
    mock_server_dir = os.path.dirname(__file__)
    mock_server_path = os.path.join(mock_server_dir, "mock_server.py")
    
    print("=== Starting E2E Mock Server for Stress Testing ===")
    server_process = subprocess.Popen(
        [sys.executable, mock_server_path],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    
    try:
        if not wait_for_mock_server(server_url):
            print("Error: Mock server failed to start.", file=sys.stderr)
            sys.exit(1)
            
        print("Mock server is healthy. Starting Stress & Boundary Testing...")
        
        # Reset configuration
        configure_mock({})
        
        results = []
        
        # Test 1: Empty sequence
        code, body = send_predict({"sequence": ""})
        results.append(("Empty Sequence", code == 400 and body.get("status") == "error", f"Code: {code}, Body: {body}"))
        
        # Test 2: Minimal boundary (1 AA)
        code, body = send_predict({"sequence": "M"})
        results.append(("Minimal Boundary (1 AA)", code == 200 and body.get("status") == "success" and len(body.get("plddt", [])) == 1, f"Code: {code}, Body: {body}"))
        
        # Test 3: Normal sequence limit boundary (150 AA)
        code, body = send_predict({"sequence": "M" * 150})
        results.append(("Max Limit Boundary (150 AA)", code == 200 and body.get("status") == "success" and len(body.get("plddt", [])) == 150, f"Code: {code}, Body: {body}"))
        
        # Test 4: Exceed limit boundary (151 AA)
        code, body = send_predict({"sequence": "M" * 151})
        results.append(("Exceed Limit Boundary (151 AA)", code == 200 and body.get("status") == "error" and "VRAM limit exceeded" in body.get("message", ""), f"Code: {code}, Body: {body}"))
        
        # Test 5: Extremely long sequence (10000 AA)
        code, body = send_predict({"sequence": "M" * 10000})
        results.append(("Extremely Long Sequence (10000 AA)", code == 200 and body.get("status") == "error" and "VRAM limit exceeded" in body.get("message", ""), f"Code: {code}, Body: {body}"))
        
        # Test 6: Non-IUPAC characters (X)
        code, body = send_predict({"sequence": "MGEELFTX"})
        results.append(("Non-IUPAC Character Rejection", code == 400 and body.get("status") == "error" and "Invalid amino acid sequence character" in body.get("message", ""), f"Code: {code}, Body: {body}"))
        
        # Test 7: Special Unicode / Emoji
        code, body = send_predict({"sequence": "MGEELFT😊"})
        results.append(("Unicode/Emoji Rejection", code == 400 and body.get("status") == "error", f"Code: {code}, Body: {body}"))
        
        # Test 8: Missing sequence parameter
        code, body = send_predict({"invalid_param": "MGEEL"})
        results.append(("Missing Parameter", code == 422, f"Code: {code}, Body: {body}"))
        
        # Test 9: Malformed JSON body
        # For malformed JSON, we manually send raw bytes
        try:
            req = urllib.request.Request(f"{MOCK_SERVER_URL}/api/predict", data=b"{invalid-json", headers={'Content-Type': 'application/json'}, method='POST')
            with urllib.request.urlopen(req) as resp:
                code_json, body_json = resp.getcode(), resp.read()
        except urllib.error.HTTPError as e:
            code_json, body_json = e.code, e.read().decode('utf-8')
        results.append(("Malformed JSON Body", code_json == 400 or code_json == 422, f"Code: {code_json}, Body: {body_json}"))

        # Test 10: Configure negative VRAM limit
        code, body = configure_mock({"vram_limit_aa": -10})
        # FastAPI/Pydantic or mock server doesn't validate positive values, but let's see how it behaves
        results.append(("Configure Negative VRAM", code == 200, f"Code: {code}, Body: {body}"))
        # Check predict with a 5 AA sequence after negative limit
        code_neg, body_neg = send_predict({"sequence": "MGEEL"})
        results.append(("Predict with Negative VRAM Limit", code_neg == 200 and body_neg.get("status") == "error", f"Code: {code_neg}, Body: {body_neg}"))

        # Test 11: Configure huge VRAM limit
        configure_mock({"vram_limit_aa": 100000})
        code, body = send_predict({"sequence": "M" * 500})
        results.append(("Predict 500 AA with Huge VRAM Limit", code == 200 and body.get("status") == "success", f"Code: {code}, Body: {body}"))

        # Test 12: Configure negative latency
        code, body = configure_mock({"latency_seconds": -5.0})
        results.append(("Configure Negative Latency", code == 200, f"Code: {code}, Body: {body}"))

        # Test 13: Configure invalid boolean type
        code, body = configure_mock({"simulate_oom": "not-a-boolean"})
        results.append(("Configure Invalid Boolean", code == 422, f"Code: {code}, Body: {body}"))

        print("\n=== Boundary & Stress Test Results ===")
        for name, passed, detail in results:
            status_str = "PASSED" if passed else "FAILED"
            msg = f"[{status_str}] {name}: {detail}"
            print(msg.encode('ascii', errors='backslashreplace').decode('ascii'))
            
        print("\n=== Testing E2E Test Suite Sensitivity to Mock Anomalies ===")
        
        # Reset mock
        configure_mock({})
        
        # Case A: Force internal server error
        print("Configuring mock server to simulate internal errors...")
        configure_mock({"simulate_internal_error": True})
        passed, output = run_specific_test("test_t1_f1_01_valid_sequence_prediction")
        print(f"E2E Test Sensitivity Case A (Internal Error): Expected failure. Did E2E test fail? {'YES (Passes sensitivity check)' if not passed else 'NO (Fails sensitivity check)'}")
        if passed:
            print("WARNING: test_t1_f1_01 did not detect internal server error!")
            print("Test Output:\n", output)
            
        # Case B: Force OOM error
        print("Configuring mock server to simulate OOM...")
        configure_mock({"simulate_oom": True})
        passed, output = run_specific_test("test_t1_f1_01_valid_sequence_prediction")
        print(f"E2E Test Sensitivity Case B (OOM): Expected failure. Did E2E test fail? {'YES (Passes sensitivity check)' if not passed else 'NO (Fails sensitivity check)'}")
        if passed:
            print("WARNING: test_t1_f1_01 did not detect OOM error!")
            print("Test Output:\n", output)
            
        # Case C: Force corrupt PDB structure
        print("Configuring mock server to simulate corrupt PDB...")
        configure_mock({"simulate_corrupt_pdb": True})
        passed, output = run_specific_test("test_t1_f2_08_successful_3d_model_rendering")
        print(f"E2E Test Sensitivity Case C (Corrupt PDB): Expected failure. Did E2E test fail? {'YES (Passes sensitivity check)' if not passed else 'NO (Fails sensitivity check)'}")
        if passed:
            print("WARNING: test_t1_f2_08 did not detect corrupt PDB!")
            print("Test Output:\n", output)

        # Case D: Force strict VRAM limit (e.g. 5)
        print("Configuring mock server to VRAM limit = 5...")
        configure_mock({"vram_limit_aa": 5})
        passed, output = run_specific_test("test_t1_f1_01_valid_sequence_prediction")
        print(f"E2E Test Sensitivity Case D (Low VRAM): Expected failure. Did E2E test fail? {'YES (Passes sensitivity check)' if not passed else 'NO (Fails sensitivity check)'}")
        if passed:
            print("WARNING: test_t1_f1_01 did not detect low VRAM restriction!")
            print("Test Output:\n", output)

    finally:
        print("\n=== Terminating E2E Mock Server ===")
        if os.name == 'nt':
            try:
                # Force kill process tree on Windows to release port 8000
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(server_process.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                server_process.wait(timeout=3.0)
                print("Mock server and children terminated via taskkill.")
            except Exception as e:
                print(f"Failed to taskkill process tree: {e}. Falling back to terminate().")
                server_process.terminate()
                try:
                    server_process.wait(timeout=3.0)
                except subprocess.TimeoutExpired:
                    server_process.kill()
                    server_process.wait()
        else:
            server_process.terminate()
            try:
                server_process.wait(timeout=3.0)
                print("Mock server terminated cleanly.")
            except subprocess.TimeoutExpired:
                print("Force-killing mock server process...")
                server_process.kill()
                server_process.wait()
                print("Mock server killed.")

if __name__ == "__main__":
    main()
