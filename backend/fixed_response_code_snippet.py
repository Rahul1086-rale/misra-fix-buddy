# fixed_response_code_snippet.py
import re
import json


def extract_violation_mapping(response_text: str) -> dict:
    """Extract Violation_Mapping_list dictionary from response string."""
    start_key = "Violation_Mapping_list ="
    if start_key not in response_text:
        raise ValueError("Violation_Mapping_list not found in response.")

    # Extract JSON portion of the dictionary
    json_part = response_text.split(start_key, 1)[1].strip()
    
    try:
        # Load it safely using `eval` with dictionary only context
        violation_mapping = eval(json_part, {"__builtins__": None}, {})
        return violation_mapping
    except Exception as e:
        raise ValueError("Failed to parse Violation_Mapping_list") from e


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


def save_violation_mapping_to_json(violation_mapping, filepath="temp_violation_mapping.json"):
    """Save violation mapping dictionary to JSON file."""
    with open(filepath, "w") as f:
        json.dump(violation_mapping, f, indent=2)