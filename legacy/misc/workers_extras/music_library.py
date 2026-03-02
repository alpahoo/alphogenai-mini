"""
Curated library of royalty-free music tracks from Kevin MacLeod
All tracks licensed under CC BY 4.0: https://creativecommons.org/licenses/by/4.0/

Attribution: Music by Kevin MacLeod (incompetech.com)
"""
from typing import Dict, List


MUSIC_LIBRARY: List[Dict[str, str]] = [
    {
        "label": "Uplifting Ambient",
        "url": "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Carefree.mp3",
        "category": "inspiring",
        "mood": "uplifting"
    },
    {
        "label": "Inspiring Piano",
        "url": "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Wallpaper.mp3",
        "category": "inspiring",
        "mood": "calm"
    },
    {
        "label": "Energetic Corporate",
        "url": "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Fluffing%20a%20Duck.mp3",
        "category": "corporate",
        "mood": "energetic"
    },
    {
        "label": "Cinematic Adventure",
        "url": "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Heroic%20Adventure.mp3",
        "category": "cinematic",
        "mood": "epic"
    },
    {
        "label": "Peaceful Ambient",
        "url": "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Laid%20Back%20Guitars.mp3",
        "category": "ambient",
        "mood": "peaceful"
    },
    {
        "label": "Upbeat Positive",
        "url": "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Pamgaea.mp3",
        "category": "corporate",
        "mood": "upbeat"
    },
    {
        "label": "Dramatic Cinematic",
        "url": "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Prelude%20and%20Action.mp3",
        "category": "cinematic",
        "mood": "dramatic"
    },
    {
        "label": "Cheerful Light",
        "url": "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Take%20a%20Chance.mp3",
        "category": "inspiring",
        "mood": "cheerful"
    },
]


def get_music_library() -> List[Dict[str, str]]:
    """Get the full music library"""
    return MUSIC_LIBRARY


def get_default_music_url() -> str:
    """Get the default music track URL"""
    return MUSIC_LIBRARY[0]["url"]


def get_music_by_category(category: str) -> List[Dict[str, str]]:
    """Get music tracks filtered by category"""
    return [track for track in MUSIC_LIBRARY if track["category"] == category]


def get_music_by_mood(mood: str) -> List[Dict[str, str]]:
    """Get music tracks filtered by mood"""
    return [track for track in MUSIC_LIBRARY if track["mood"] == mood]


def get_attribution() -> str:
    """Get the attribution text for Kevin MacLeod music"""
    return (
        "Music by Kevin MacLeod (incompetech.com)\n"
        "Licensed under Creative Commons: By Attribution 4.0 License\n"
        "https://creativecommons.org/licenses/by/4.0/"
    )
