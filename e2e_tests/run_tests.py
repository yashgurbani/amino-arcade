import os
import sys
import subprocess
import time
import urllib.request
import json
import unittest

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

def main():
    server_port = 8000
    server_url = f"http://127.0.0.1:{server_port}"
    mock_server_dir = os.path.dirname(__file__)
    mock_server_path = os.path.join(mock_server_dir, "mock_server.py")
    
    print(f"=== Starting E2E Mock Server on port {server_port} ===")
    
    # Spawn mock server in background
    # Use sys.executable to ensure we use the same Python interpreter
    server_process = subprocess.Popen(
        [sys.executable, mock_server_path],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    
    try:
        print("Waiting for mock server to be healthy...")
        if not wait_for_mock_server(server_url):
            print("Error: Mock server failed to start in time.", file=sys.stderr)
            sys.exit(1)
            
        print("Mock server is healthy. Running test suite...")
        
        # Execute tests via unittest discovery
        loader = unittest.TestLoader()
        suite = loader.discover(start_dir=mock_server_dir, pattern="test_suite.py")
        
        runner = unittest.TextTestRunner(verbosity=2)
        result = runner.run(suite)
        
        print("\n=== Test execution results ===")
        print(f"Tests run: {result.testsRun}")
        print(f"Errors: {len(result.errors)}")
        print(f"Failures: {len(result.failures)}")
        
        # Check that we actually ran 40 tests
        if result.testsRun != 40:
            print(f"Warning: Expected 40 test cases to run, but ran {result.testsRun} instead.", file=sys.stderr)
            sys.exit(1)
            
        if not result.wasSuccessful():
            print("E2E Test Suite FAILED.", file=sys.stderr)
            sys.exit(1)
            
        print("All 40 E2E tests PASSED successfully.")
        sys.exit(0)
        
    finally:
        print("=== Terminating E2E Mock Server ===")
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
