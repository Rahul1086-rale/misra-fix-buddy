# review_manager.py - Manages accept/reject state for individual fixes

import json
import os
from typing import Dict, List, Set, Any

class ReviewManager:
    """Manages the state of accepted/rejected fixes for a project"""
    
    def __init__(self, project_id: str, upload_folder: str = "uploads"):
        self.project_id = project_id
        self.upload_folder = upload_folder
        self.review_file = os.path.join(upload_folder, f"{project_id}_review_state.json")
        self._load_review_state()
    
    def _load_review_state(self):
        """Load existing review state from file"""
        if os.path.exists(self.review_file):
            try:
                with open(self.review_file, 'r') as f:
                    data = json.load(f)
                    self.accepted_lines = set(data.get('accepted_lines', []))
                    self.rejected_lines = set(data.get('rejected_lines', []))
                    self.current_review_index = data.get('current_review_index', 0)
            except Exception as e:
                print(f"Error loading review state: {str(e)}")
                self._reset_review_state()
        else:
            self._reset_review_state()
    
    def _reset_review_state(self):
        """Reset review state to default"""
        self.accepted_lines = set()
        self.rejected_lines = set()
        self.current_review_index = 0
    
    def _save_review_state(self):
        """Save current review state to file"""
        try:
            data = {
                'accepted_lines': list(self.accepted_lines),
                'rejected_lines': list(self.rejected_lines),
                'current_review_index': self.current_review_index
            }
            with open(self.review_file, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"Error saving review state: {str(e)}")
    
    def accept_line(self, line_key: str):
        """Accept a specific line fix"""
        self.accepted_lines.add(line_key)
        self.rejected_lines.discard(line_key)  # Remove from rejected if it was there
        self._save_review_state()
    
    def reject_line(self, line_key: str):
        """Reject a specific line fix"""
        self.rejected_lines.add(line_key)
        self.accepted_lines.discard(line_key)  # Remove from accepted if it was there
        self._save_review_state()
    
    def reset_line(self, line_key: str):
        """Reset a specific line fix to pending state by removing it from both sets"""
        self.accepted_lines.discard(line_key)
        self.rejected_lines.discard(line_key)
        self._save_review_state()
    
    def get_line_status(self, line_key: str) -> str:
        """Get the review status of a line: 'accepted', 'rejected', or 'pending'"""
        if line_key in self.accepted_lines:
            return 'accepted'
        elif line_key in self.rejected_lines:
            return 'rejected'
        else:
            return 'pending'
    
    def get_accepted_snippets(self, all_snippets: Dict[str, str]) -> Dict[str, str]:
        """Get only the accepted snippets from all available snippets"""
        return {
            line_key: content 
            for line_key, content in all_snippets.items() 
            if line_key in self.accepted_lines
        }
    
    def get_review_summary(self, all_snippets: Dict[str, str]) -> Dict[str, Any]:
        """Get a summary of the review state"""
        total_fixes = len(all_snippets)
        accepted_count = len(self.accepted_lines.intersection(all_snippets.keys()))
        rejected_count = len(self.rejected_lines.intersection(all_snippets.keys()))
        pending_count = total_fixes - accepted_count - rejected_count
        
        return {
            'total_fixes': total_fixes,
            'accepted_count': accepted_count,
            'rejected_count': rejected_count,
            'pending_count': pending_count,
            'current_review_index': self.current_review_index
        }
    
    def set_current_review_index(self, index: int):
        """Set the current review index for navigation"""
        self.current_review_index = index
        self._save_review_state()
    
    def get_fix_list(self, all_snippets: Dict[str, str]) -> List[Dict[str, Any]]:
        """Get a list of all fixes with their review status"""
        fixes = []
        for i, (line_key, content) in enumerate(sorted(all_snippets.items(), key=lambda x: self._parse_line_key(x[0]))):
            fixes.append({
                'index': i,
                'line_key': line_key,
                'content': content,
                'status': self.get_line_status(line_key)
            })
        return fixes
    
    def _parse_line_key(self, line_key: str) -> tuple:
        """Parse line key for sorting (e.g., '123' -> (123, ''), '123a' -> (123, 'a'))"""
        import re
        match = re.match(r'(\d+)([a-zA-Z]*)', line_key)
        if match:
            return (int(match.group(1)), match.group(2))
        return (0, line_key)
    
    def reset_review(self):
        """Reset all review state"""
        self._reset_review_state()
        self._save_review_state()
