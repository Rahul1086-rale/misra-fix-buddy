# diff_async_utils.py - Async version of diff utilities with database integration

import os
import asyncio
import re
from typing import Tuple, Optional, List, Dict, Any
from concurrent.futures import ThreadPoolExecutor
from denumbering import remove_line_numbers
from replace import merge_fixed_snippets_into_file
from database import db

# Thread pool for I/O operations
executor = ThreadPoolExecutor(max_workers=5)

async def create_temp_fixed_denumbered_file_async(
    numbered_file_path: str, 
    fixed_snippets: dict, 
    project_id: str,
    upload_folder: str = "uploads"
) -> Tuple[str, str]:
    """
    Async version of create_temp_fixed_denumbered_file.
    """
    
    def _create_files():
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
    
    # Run file operations in thread pool
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, _create_files)

async def get_file_content_async(file_path: str) -> Optional[str]:
    """
    Async version of get_file_content.
    """
    def _read_file():
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception as e:
            print(f"Error reading file {file_path}: {str(e)}")
            return None
    
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, _read_file)

async def create_diff_data_async(
    project_id: str, 
    session_id: str = None,
    only_accepted: bool = False
) -> dict:
    """
    Async version of create_diff_data with database integration.
    
    Args:
        project_id: Project identifier
        session_id: Session identifier (if None, uses project_id)
        only_accepted: If True, only includes accepted changes
        
    Returns:
        Dictionary containing diff data
    """
    
    # Get session data
    if session_id:
        session = await db.get_session(session_id)
    else:
        session = await db.get_session_by_project(project_id)
    
    if not session:
        return {
            "original": "",
            "fixed": "",
            "has_changes": False,
            "highlight": {"line_mappings": {}, "changed_lines": [], "changed_lines_fixed": [], "added_lines": [], "removed_lines": []},
            "review_data": {"pending_changes": [], "accepted_changes": [], "rejected_changes": [], "current_line": None}
        }
    
    # Get file paths
    numbered_file_path = session.get('numbered_file_path')
    if not numbered_file_path or not os.path.exists(numbered_file_path):
        return {
            "original": "",
            "fixed": "",
            "has_changes": False,
            "highlight": {"line_mappings": {}, "changed_lines": [], "changed_lines_fixed": [], "added_lines": [], "removed_lines": []},
            "review_data": {"pending_changes": [], "accepted_changes": [], "rejected_changes": [], "current_line": None}
        }
    
    # Get snippets (either all or only accepted)
    if only_accepted:
        fixed_snippets = await db.get_filtered_snippets(session['session_id'])
    else:
        fixed_snippets = session.get('fixed_snippets', {})
    
    # Create temporary files with current snippets
    temp_fixed_numbered_path, temp_fixed_denumbered_path = await create_temp_fixed_denumbered_file_async(
        numbered_file_path, fixed_snippets, project_id
    )
    
    # Update session with temp file paths
    await db.update_session(
        session['session_id'],
        temp_fixed_numbered_path=temp_fixed_numbered_path,
        temp_fixed_denumbered_path=temp_fixed_denumbered_path
    )
    
    # Read file contents
    original_content = await get_file_content_async(numbered_file_path)
    fixed_content = await get_file_content_async(temp_fixed_denumbered_path)
    
    # Extract precise line mappings and changes
    highlight_data = {}
    review_data = {}
    
    if fixed_snippets:
        try:
            mappings_data = await get_line_mappings_and_changes_async(
                fixed_snippets, original_content, fixed_content
            )
            highlight_data = {
                "line_mappings": mappings_data['line_mappings'],
                "changed_lines": [item['original'] for item in mappings_data['changed_lines']],
                "changed_lines_fixed": [item['fixed'] for item in mappings_data['changed_lines']],
                "added_lines": mappings_data['added_lines'],
                "removed_lines": mappings_data['removed_lines']
            }
            
            # Add review data
            all_snippets = session.get('fixed_snippets', {})
            accepted_changes = session.get('accepted_changes', [])
            rejected_changes = session.get('rejected_changes', [])
            reviewed_changes = set(accepted_changes + rejected_changes)
            
            pending_changes = [
                line_key for line_key in all_snippets.keys() 
                if line_key not in reviewed_changes
            ]
            
            # Get current line to review
            current_line = await db.get_next_fix_line(session['session_id'])
            
            review_data = {
                "pending_changes": sorted(pending_changes, key=lambda k: int(k.split('a')[0] if 'a' in k else k)),
                "accepted_changes": accepted_changes,
                "rejected_changes": rejected_changes,
                "current_line": current_line,
                "total_changes": len(all_snippets),
                "reviewed_count": len(reviewed_changes)
            }
            
        except Exception as e:
            print(f"Error extracting highlight lines: {str(e)}")
            highlight_data = {"line_mappings": {}, "changed_lines": [], "changed_lines_fixed": [], "added_lines": [], "removed_lines": []}
            review_data = {"pending_changes": [], "accepted_changes": [], "rejected_changes": [], "current_line": None}
    
    return {
        "original": original_content or "",
        "fixed": fixed_content or "",
        "has_changes": original_content != fixed_content if original_content and fixed_content else False,
        "highlight": highlight_data,
        "review_data": review_data,
        "session_id": session['session_id']
    }

async def get_line_mappings_and_changes_async(json_data, original_content, fixed_content):
    """
    Async version of get_line_mappings_and_changes.
    """
    def _process_mappings():
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
    
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, _process_mappings)

async def cleanup_temp_files_async(*file_paths: str) -> None:
    """
    Async version of cleanup_temp_files.
    """
    def _cleanup():
        for file_path in file_paths:
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
                    print(f"Cleaned up temp file: {file_path}")
            except Exception as e:
                print(f"Error cleaning up file {file_path}: {str(e)}")
    
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(executor, _cleanup)