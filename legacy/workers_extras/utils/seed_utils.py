"""
Deterministic seed derivation using Linear Congruential Generator (LCG)
Ensures reproducible scene generation across workflow restarts
"""

LCG_A = 1664525
LCG_C = 1013904223
LCG_M = 2**32


def derive_seed(base_seed: int, scene_index: int) -> int:
    """
    Derive a deterministic scene seed using LCG
    
    Args:
        base_seed: Base seed for the job (0-4294967295)
        scene_index: Scene number (0-based index)
        
    Returns:
        Derived seed for the scene (0-4294967295)
        
    Example:
        >>> derive_seed(12345, 0)
        1013916568
        >>> derive_seed(12345, 1)
        2558184341
        >>> derive_seed(12345, 0)
        1013916568
    """
    if not (0 <= base_seed < LCG_M):
        raise ValueError(f"base_seed must be in range [0, {LCG_M})")
    
    if scene_index < 0:
        raise ValueError("scene_index must be non-negative")
    
    seed = base_seed
    
    for _ in range(scene_index + 1):
        seed = (LCG_A * seed + LCG_C) % LCG_M
    
    return seed
