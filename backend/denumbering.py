# denumbering.py
import re

# def remove_line_numbers(input_file, output_file):
#     """Remove line numbers from a numbered C++ file"""
#     with open(input_file, 'r', encoding='utf-8') as infile, open(output_file, 'w', encoding='utf-8') as outfile:
#         for line in infile:
#             # Match line numbers like 123:, 123a:, 45b:, etc.
#             new_line = re.sub(r'^\d+[a-zA-Z]*:\s?', '', line)
#             outfile.write(new_line)

def remove_line_numbers(input_file, output_file):
    """Remove line numbers from a numbered C++ file"""
    with open(input_file, 'r', encoding='utf-8') as infile, open(output_file, 'w', encoding='utf-8') as outfile:
        for line in infile:
            # Remove line numbers like 123:, 123a:, 45b:, etc.
            new_line = re.sub(r'^\d+[a-zA-Z]*:\s?', '', line)
            # Preserve empty lines that were just line numbers
            if new_line.strip() == '':
                outfile.write('\n')
            else:
                outfile.write(new_line)