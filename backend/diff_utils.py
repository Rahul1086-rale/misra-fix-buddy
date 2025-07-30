# diff_utils.py - Utility functions for creating diffs between original and fixed files

import os
import tempfile
import re
from typing import Tuple, Optional, List
from denumbering import remove_line_numbers
from replace import merge_fixed_snippets_into_file

def create_temp_fixed_denumbered_file(
    numbered_file_path: str, 
    fixed_snippets: dict, 
    project_id: str,
    upload_folder: str = "uploads"
) -> Tuple[str, str]:
    """
    Create a temporary fixed and denumbered file for diff comparison.
    
    Args:
        numbered_file_path: Path to the numbered file
        fixed_snippets: Dictionary of fixed code snippets
        project_id: Project identifier
        upload_folder: Upload folder path
        
    Returns:
        Tuple of (temp_fixed_numbered_path, temp_fixed_denumbered_path)
    """
    
    # Create temporary fixed numbered file
    temp_fixed_numbered_path = os.path.join(
        upload_folder, 
        f"{project_id}_temp_fixed_numbered.cpp"
    )
    
    # Apply fixes to create temp fixed numbered file
    merge_fixed_snippets_into_file(
        numbered_file_path, 
        fixed_snippets, 
        temp_fixed_numbered_path
    )
    
    # Create temporary fixed denumbered file
    temp_fixed_denumbered_path = os.path.join(
        upload_folder, 
        f"{project_id}_temp_fixed_denumbered.cpp"
    )
    
    # Remove line numbers from the fixed file
    remove_line_numbers(temp_fixed_numbered_path, temp_fixed_denumbered_path)
    
    return temp_fixed_numbered_path, temp_fixed_denumbered_path

def get_file_content(file_path: str) -> Optional[str]:
    """
    Read and return file content as string.
    
    Args:
        file_path: Path to the file
        
    Returns:
        File content as string or None if error
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        print(f"Error reading file {file_path}: {str(e)}")
        return None

def create_diff_data(original_file_path: str, fixed_file_path: str, fixed_snippets: dict = None) -> dict:
    """
    Create diff data structure for frontend consumption.
    
    Args:
        original_file_path: Path to original file
        fixed_file_path: Path to fixed file
        fixed_snippets: Dictionary of fixed code snippets
        
    Returns:
        Dictionary containing diff data
    """
    original_content = get_file_content(original_file_path)
    fixed_content = get_file_content(fixed_file_path)
    
    # Extract precise line mappings and changes if fixed_snippets provided
    highlight_data = {}
    if fixed_snippets:
        try:
            mappings_data = get_line_mappings_and_changes(fixed_snippets, original_content, fixed_content)
            highlight_data = {
                "line_mappings": mappings_data['line_mappings'],
                "changed_lines": [item['original'] for item in mappings_data['changed_lines']],
                "changed_lines_fixed": [item['fixed'] for item in mappings_data['changed_lines']],
                "added_lines": mappings_data['added_lines'],
                "removed_lines": mappings_data['removed_lines']
            }
        except Exception as e:
            print(f"Error extracting highlight lines: {str(e)}")
            highlight_data = {"line_mappings": {}, "changed_lines": [], "changed_lines_fixed": [], "added_lines": [], "removed_lines": []}
    
    return {
        "original": original_content or "",
        "fixed": fixed_content or "",
        "has_changes": original_content != fixed_content if original_content and fixed_content else False,
        "highlight": highlight_data
    }

def get_line_mappings_and_changes(json_data, original_content, fixed_content):
    """
    Create precise line mappings and detect actual changes between original and fixed content.
    
    Args:
        json_data: Dictionary mapping line keys to content
        original_content: Original file content as string
        fixed_content: Fixed file content as string
        
    Returns:
        Dictionary with line mappings and change information
    """
    original_lines = original_content.split('\n') if original_content else []
    fixed_lines = fixed_content.split('\n') if fixed_content else []
    
    line_mappings = {}  # original_line_num: fixed_line_num
    changed_lines = []  # lines that were modified
    added_lines = []    # lines that were newly added
    removed_lines = []  # lines that were removed
    
    inserted_count = 0
    sorted_keys = sorted(json_data.keys(), key=lambda k: (int(re.match(r'\d+', k).group()), k))

    for key in sorted_keys:
        base_line = int(re.match(r'\d+', key).group())
        
        if re.search(r'[a-z]$', key):
            # This is a newly inserted line
            inserted_count += 1
            fixed_line_num = base_line + inserted_count
            added_lines.append(fixed_line_num)
        else:
            # This is a modified or replaced line
            fixed_line_num = base_line + inserted_count
            line_mappings[base_line] = fixed_line_num
            
            # Compare actual content to detect changes
            if (base_line <= len(original_lines) and 
                fixed_line_num <= len(fixed_lines)):
                original_line_content = original_lines[base_line - 1].strip()
                fixed_line_content = fixed_lines[fixed_line_num - 1].strip()
                
                if original_line_content != fixed_line_content:
                    changed_lines.append({
                        'original': base_line,
                        'fixed': fixed_line_num,
                        'original_content': original_line_content,
                        'fixed_content': fixed_line_content
                    })
    
    return {
        'line_mappings': line_mappings,
        'changed_lines': changed_lines,
        'added_lines': added_lines,
        'removed_lines': removed_lines
    }

def cleanup_temp_files(*file_paths: str) -> None:
    """
    Clean up temporary files.
    
    Args:
        file_paths: Variable number of file paths to clean up
    """
    for file_path in file_paths:
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                print(f"Cleaned up temp file: {file_path}")
        except Exception as e:
            print(f"Error cleaning up file {file_path}: {str(e)}")