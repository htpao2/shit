import subprocess
import json
import sys
import os

def run_test(command, args):
    """
    Tests the VCPScholarV2 plugin by simulating a VCP call.

    Args:
        command (str): The command to execute (e.g., 'search_arxiv').
        args (dict): The arguments for the command.

    Returns:
        dict: The parsed JSON response from the plugin.
    """
    print(f"--- Testing command: {command} ---")

    # Construct the full path to the server script
    script_path = os.path.join(os.path.dirname(__file__), 'server.py')
    
    # Prepare the input data in the format expected by the plugin (flattened JSON)
    input_payload = args.copy()
    input_payload["command"] = command
    input_json = json.dumps(input_payload)

    try:
        # Execute the server.py script as a separate process
        # We use sys.executable to ensure we're using the same python interpreter
        process = subprocess.Popen(
            [sys.executable, script_path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,  # Use text mode for stdin/stdout/stderr
            encoding='utf-8'
        )

        # Send the JSON input to the script's stdin and close it
        stdout, stderr = process.communicate(input=input_json, timeout=60) # 60 second timeout

        # Check for errors
        if process.returncode != 0:
            print(f"Error: Plugin exited with code {process.returncode}")
            print("Stderr:")
            print(stderr)
            return None
        
        if stderr:
            print("Stderr (non-fatal):")
            print(stderr)

        # Parse the JSON output from the script's stdout
        try:
            output_data = json.loads(stdout)
            print("Test PASSED.")
            print("Response:")
            # Pretty print the first result for readability
            if isinstance(output_data.get('result'), list) and output_data['result']:
                 print(json.dumps(output_data['result'][0], indent=2, ensure_ascii=False))
            else:
                 print(json.dumps(output_data, indent=2, ensure_ascii=False))
            return output_data
        except json.JSONDecodeError:
            print("Error: Failed to decode JSON from plugin output.")
            print("Raw stdout:")
            print(stdout)
            return None

    except subprocess.TimeoutExpired:
        print("Error: Test timed out.")
        process.kill()
        return None
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return None
    finally:
        print("--- Test Finished ---\n")


if __name__ == "__main__":
    # Ensure dependencies are installed
    print("Reminder: Make sure you have installed the dependencies from requirements.txt")
    print("You can run: pip install -r requirements.txt\n")
    
    # --- Test Case 1: Search arXiv ---
    run_test(
        command="search_arxiv",
        args={"query": "transformer architecture", "max_results": 1}
    )

    # --- Test Case 2: Search Google Scholar ---
    run_test(
        command="search_google_scholar",
        args={"query": "large language model", "max_results": 1}
    )
    
    # --- Test Case 3: Invalid Command ---
    run_test(
        command="non_existent_command",
        args={}
    )