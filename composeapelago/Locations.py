# Location tables and the helpers that decide which locations are active.
#
# The full tables always contain every possible location (AP needs the
# complete name -> id map at import time). Which ones actually exist in a
# given seed is decided by location_mode + the matching count option, via
# is_valid_location().

from typing import Dict, TYPE_CHECKING
from .Songs import SONGS
from .Types import LocData

if TYPE_CHECKING:
    from . import ComposeapelagoWorld

# Hard caps on the location tables (AP needs every possible location name
# at import time). Songs added to Songs.py must fit inside these.
# Note ids are 76245000+N and bar ids are 76246000+N, so the note cap can
# never go above 999 without the two id ranges colliding.
MAX_NOTE_LOCATIONS = 999
MAX_BAR_LOCATIONS = 150
TITLE_GUESS_LOCATION = "Song title guessed"
TITLE_GUESS_LOCATION_ID = 76248001

# Values of the location_mode option.
LOCATION_MODE_PER_NOTE = 0
LOCATION_MODE_BARS = 1


def note_location_name(n: int) -> str:
    return f"Note {n} placed correctly"


def bar_location_name(n: int) -> str:
    return f"Bar {n} completed"


def get_active_location_count(world: "ComposeapelagoWorld") -> int:
    """How many real (non-event) locations this seed has. The count comes
    from the chosen song itself: its melody's note count or bar count."""
    song = SONGS[world.song_key]
    if world.options.location_mode.value == LOCATION_MODE_BARS:
        return min(song["bar_count"], MAX_BAR_LOCATIONS)
    return song["note_count"]


def is_valid_location(world: "ComposeapelagoWorld", name: str) -> bool:
    """A location is valid when it belongs to the active mode and its number
    is within the chosen song's count."""
    if name == TITLE_GUESS_LOCATION:
        return True
    if name in event_locations:
        return True
    count = get_active_location_count(world)
    if world.options.location_mode.value == LOCATION_MODE_BARS:
        return name in bar_location_numbers and bar_location_numbers[name] <= count
    return name in note_location_numbers and note_location_numbers[name] <= count


def get_total_locations(world: "ComposeapelagoWorld") -> int:
    """Total real locations (events excluded, they have no address)."""
    return get_active_location_count(world) + 1


def get_location_names() -> Dict[str, int]:
    return {name: data.ap_code for name, data in location_table.items() if data.ap_code is not None}


composeapelago_note_locations = {
    note_location_name(n): LocData(76245000 + n, "Staff")
    for n in range(1, MAX_NOTE_LOCATIONS + 1)
}

composeapelago_bar_locations = {
    bar_location_name(n): LocData(76246000 + n, "Staff")
    for n in range(1, MAX_BAR_LOCATIONS + 1)
}

# The goal. No ap_code because it is an event: the Victory item gets locked
# onto it during generation and it never appears on the server.
event_locations = {
    "Melody Complete": LocData(None, "Staff"),
}

special_locations = {
    TITLE_GUESS_LOCATION: LocData(TITLE_GUESS_LOCATION_ID, "Staff"),
}

# Reverse lookups so is_valid_location and Rules.py can go from a location
# name back to its note/bar number without string parsing.
note_location_numbers = {note_location_name(n): n for n in range(1, MAX_NOTE_LOCATIONS + 1)}
bar_location_numbers = {bar_location_name(n): n for n in range(1, MAX_BAR_LOCATIONS + 1)}

location_table = {
    **composeapelago_note_locations,
    **composeapelago_bar_locations,
    **special_locations,
    **event_locations,
}
