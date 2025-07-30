# replace.py
import json
import re

def merge_fixed_snippets_into_file(original_file: str, fixes_dict: dict, output_file: str):
    """
    Replaces or inserts fixed lines (with line numbers) into the original numbered file.
    Writes the result to output_file.
    """
    # Load the original numbered C++ file into a dictionary
    with open(original_file, "r", encoding="utf-8") as f:
        original_lines = {}
        for line in f:
            match = re.match(r"^(\d+[a-zA-Z]*):(.*)$", line.rstrip('\n'))

            if match:
                lineno = match.group(1).strip()
                content = match.group(2)
                original_lines[lineno] = content
            else:
                print(f"⚠️ Skipped invalid line: {line.strip()}")

    # Merge fixed lines
    merged_lines = original_lines.copy()
    for lineno, fixed_code in fixes_dict.items():
        merged_lines[lineno] = fixed_code

    # Sort by line number (numbers first, then a-z suffixes)
    def line_sort_key(k):
        num_part = int(re.match(r"(\d+)", k).group(1))
        suffix = re.sub(r"\d+", "", k)
        return (num_part, suffix)

    sorted_keys = sorted(merged_lines.keys(), key=line_sort_key)

    # Write to output
    with open(output_file, "w", encoding="utf-8") as f:
        for lineno in sorted_keys:
            f.write(f"{lineno}:{merged_lines[lineno]}\n")

    print(f"✅ Merged output written to: {output_file}")