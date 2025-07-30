# fixed_response_code_snippet.py
import re
import json

def extract_snippets_from_response(response_text):
    """
    Parses Gemini-style C++ response text and extracts line-numbered code,
    preserving backslashes and formatting. Returns a dictionary.
    """
    # Match all ```cpp ... ``` blocks (non-greedy)
    code_blocks = re.findall(r"```(?:cpp|c\+\+)?\s*\n(.*?)```", response_text, re.DOTALL)
    
    all_lines = {}

    for block in code_blocks:
        lines = block.strip().splitlines()
        for line in lines:
            match = re.match(r"^(\d+[a-zA-Z]*):(.*)$", line)
            if match:
                lineno = match.group(1).strip()
                code = match.group(2).rstrip()  # Do NOT strip backslashes
                all_lines[lineno] = code
            else:
                print(f"⚠️ Skipping: {line}")
    
    return all_lines


def save_snippets_to_json(snippets, filepath="temp_snippets.json"):
    with open(filepath, "w") as f:
        json.dump(snippets, f, indent=2)