# Access rules.
#
# Early locations are free so correct rests can bootstrap the run. Past that,
# the seed must hand out more rhythm values, pitch items, backing tracks, and
# measure unlocks before deeper checks.

from math import ceil
from typing import TYPE_CHECKING
from worlds.generic.Rules import add_rule
from .Items import NOTE_VALUE_ITEM_NAMES, PITCH_ITEM_NAMES, measure_item_name
from .Locations import (
    LOCATION_MODE_BARS,
    bar_location_name,
    get_active_location_count,
    note_location_name,
)
from .Songs import SONGS

if TYPE_CHECKING:
    from . import ComposeapelagoWorld

# (fraction passed, note values needed, pitches needed, backing tracks needed)
RULE_TIERS = [
    (0.10, 2, 12, 1),
    (0.25, 3, 24, 2),
    (0.50, 4, 48, 3),
    (0.75, len(NOTE_VALUE_ITEM_NAMES), len(PITCH_ITEM_NAMES), 3),
]


def tier_requirements(world: "ComposeapelagoWorld", position: int, total: int) -> tuple[int, int, int, int]:
    note_values = 0
    pitches = 0
    tracks = 0
    track_names = SONGS[world.song_key]["track_items"]
    measure_items = SONGS[world.song_key]["measure_count"] - 1
    measures = min(measure_items, max(0, ceil(measure_items * position / total)))

    for fraction, note_value_count, pitch_count, track_count in RULE_TIERS:
        if position > total * fraction:
            note_values = note_value_count
            pitches = pitch_count
            tracks = min(track_count, len(track_names))

    earlier = position - 1
    note_values = min(note_values, world.precollected_note_value_count + earlier)
    pitches = min(pitches, world.precollected_pitch_count + earlier)
    tracks = min(tracks, world.precollected_track_count + earlier)
    measures = min(measures, world.precollected_measure_count + earlier)

    combined_budget = (
        world.precollected_note_value_count
        + world.precollected_pitch_count
        + world.precollected_track_count
        + world.precollected_measure_count
        + earlier
    )
    while note_values + pitches + tracks + measures > combined_budget:
        if pitches > 0:
            pitches -= 1
        elif measures > 0:
            measures -= 1
        elif note_values > 0:
            note_values -= 1
        else:
            tracks -= 1

    return note_values, pitches, tracks, measures


def set_rules(world: "ComposeapelagoWorld") -> None:
    player = world.player
    total = get_active_location_count(world)
    song = SONGS[world.song_key]
    track_names = song["track_items"]
    measure_names = [measure_item_name(n) for n in range(2, song["measure_count"] + 1)]

    if world.options.location_mode.value == LOCATION_MODE_BARS:
        location_name = bar_location_name
    else:
        location_name = note_location_name

    for position in range(1, total + 1):
        note_values, pitches, tracks, measures = tier_requirements(world, position, total)
        required_measures = tuple(measure_names[:measures])
        if note_values == 0 and pitches == 0 and tracks == 0 and not required_measures:
            continue
        add_rule(world.multiworld.get_location(location_name(position), player),
                 lambda state, note_values=note_values, pitches=pitches, tracks=tracks, required_measures=required_measures: (
                     state.has_from_list_unique(NOTE_VALUE_ITEM_NAMES, player, note_values)
                     and state.has_from_list_unique(PITCH_ITEM_NAMES, player, pitches)
                     and state.has_from_list_unique(track_names, player, tracks)
                     and all(state.has(name, player) for name in required_measures)
                 ))

    add_rule(world.multiworld.get_location("Melody Complete", player),
             lambda state: (
                 state.has_from_list_unique(NOTE_VALUE_ITEM_NAMES, player, len(NOTE_VALUE_ITEM_NAMES))
                 and state.has_from_list_unique(PITCH_ITEM_NAMES, player, len(PITCH_ITEM_NAMES))
                 and state.has_from_list_unique(track_names, player, len(track_names))
                 and all(state.has(name, player) for name in measure_names)
             ))

    world.multiworld.completion_condition[player] = lambda state: state.has("Victory", player)


