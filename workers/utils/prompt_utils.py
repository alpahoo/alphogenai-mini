"""
Prompt utilities for Runway API compliance
Ensures all prompts stay under 1000-character limit
"""
import json
import re

MAX_PROMPT_LENGTH = 900


def _strip_json_wrappers(text: str) -> str:
    """Extract text from accidental JSON wrapping"""
    try:
        obj = json.loads(text)
        if isinstance(obj, dict):
            for key in ("prompt", "description", "scene", "text"):
                if key in obj and isinstance(obj[key], str):
                    return obj[key]
            vals = [v for v in obj.values() if isinstance(v, str)]
            if vals:
                return ". ".join(vals)
    except Exception:
        pass
    return text


def _squash_whitespace(text: str) -> str:
    """Replace multiple whitespace with single space"""
    return re.sub(r"\s+", " ", text).strip()


def shorten_prompt(text: str, max_len: int = MAX_PROMPT_LENGTH) -> str:
    """
    Sanitize and truncate prompt to fit Runway API limits
    
    Args:
        text: Raw prompt text
        max_len: Maximum allowed length (default 900)
        
    Returns:
        Sanitized prompt under max_len characters
    """
    text = _strip_json_wrappers(text)
    
    text = _squash_whitespace(text)
    
    if len(text) <= max_len:
        return text
    
    text = re.sub(r"\([^)]{80,}\)", "", text)
    text = re.sub(r"\[[^\]]{80,}\]", "", text)
    text = _squash_whitespace(text)
    
    if len(text) > max_len:
        sentences = re.split(r"(?<=[.!?])\s+", text)
        result = []
        current_len = 0
        for sentence in sentences:
            if current_len + len(sentence) + 1 > max_len:
                break
            result.append(sentence)
            current_len += len(sentence) + 1
        text = " ".join(result).strip()
    
    if len(text) > max_len:
        text = text[:max_len].rstrip()
    
    return text
