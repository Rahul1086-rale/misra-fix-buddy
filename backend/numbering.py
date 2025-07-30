# numbering.py
def add_line_numbers(input_file, output_file):
    """Add line numbers to a C++ file"""
    with open(input_file, 'r') as infile, open(output_file, 'w') as outfile:
        for i, line in enumerate(infile, start=1):
            outfile.write(f"{i}: {line}")