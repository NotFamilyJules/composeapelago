# Access rules.
#
# This file tells Archipelago which checks are reachable with which items.
#
# Composeapelago uses a ladder of checks:
#   Note 1 placed correctly
#   Note 2 placed correctly
#   Note 3 placed correctly
#   ...
#
# The first chunk of checks has no rule. Those free checks let AP place the
# early writing kit: all rhythm items, octave 4/5 notes, and early measure items.
# Later chunks require more octave rings, tracks, and measures.

from typing import TYPE_CHECKING
from worlds.generic.Rules import add_rule
from .Items import (
    NOTE_VALUE_ITEM_NAMES,
    PITCH_CLASS_NAMES,
    PITCH_ITEM_NAMES,
    PROGRESSIVE_MEASURE_ITEM,
    pitch_item_name,
)
from .Locations import (
    LOCATION_MODE_BARS,
    bar_location_name,
    get_active_location_count,
    note_location_name,
)
from .Songs import SONGS

if TYPE_CHECKING:
    from . import ComposeapelagoWorld

# The webapp and APWorld support at most 999 note checks and 150 measures.
MAX_MEASURES = 150

# A sphere here means a chunk of checks in logic.
# 50 is intentional: sphere 1 needs enough free checks to contain all rhythm
# items, all octave 4/5 pitch items, and the first 15 Progressive Measure items.
CHECKS_PER_SPHERE = 50

# Each sphere asks for 15 more Progressive Measure items.
MEASURES_UNLOCKED_PER_SPHERE = 15

# Pitch progression starts with the most common melody octaves.
# Sphere 1: octaves 4 and 5
# Sphere 2: octave 3
# Sphere 3: octave 6
# Sphere 4: octave 2
# Sphere 5: octaves 1 and 7
OCTAVES_REQUIRED_BY_SPHERE = [
    (4, 5),
    (4, 5, 3),
    (4, 5, 3, 6),
    (4, 5, 3, 6, 2),
    (4, 5, 3, 6, 2, 1, 7),
]

# Backing tracks are paced separately from pitch/rhythm.
TRACKS_REQUIRED_BY_SPHERE = [0, 1, 2, 3, 3]


def get_sphere_for_check(check_number: int) -> int:
    """Return which logic sphere this check belongs to.

    Sphere 0 is the free opening section. Sphere 1 is the first gated section.
    """
    return min(
        len(OCTAVES_REQUIRED_BY_SPHERE),
        max(0, (check_number - 1) // CHECKS_PER_SPHERE),
    )


def get_pitch_items_for_octaves(octaves: tuple[int, ...]) -> tuple[str, ...]:
    """Turn octave numbers into AP item names like C4, C#4, D4, etc."""
    pitch_items: list[str] = []
    for octave in octaves:
        for pitch_class in PITCH_CLASS_NAMES:
            pitch_items.append(pitch_item_name(pitch_class, octave))
    return tuple(pitch_items)


def get_measure_item_count_for_song(world: "ComposeapelagoWorld") -> int:
    """How many Progressive Measure items this song can use.

    Measure 1 is always visible, so a 56-measure song needs 55 measure items.
    """
    song_measure_count = SONGS[world.song_key]["measure_count"]
    visible_measure_count = min(MAX_MEASURES, song_measure_count)
    return visible_measure_count - 1


def get_requirements_for_check(
    world: "ComposeapelagoWorld",
    check_number: int,
) -> tuple[int, tuple[str, ...], int, int]:
    """Decide what this check should require.

    Returns four things:
      1. how many rhythm items are required
      2. which exact pitch items are required
      3. how many backing track items are required
      4. how many Progressive Measure items are required
    """
    sphere = get_sphere_for_check(check_number)

    if sphere == 0:
        return 0, tuple(), 0, 0

    song = SONGS[world.song_key]
    track_count_for_song = len(song["track_items"])

    required_rhythm_item_count = len(NOTE_VALUE_ITEM_NAMES)
    required_pitch_items = get_pitch_items_for_octaves(OCTAVES_REQUIRED_BY_SPHERE[sphere - 1])
    required_track_item_count = min(TRACKS_REQUIRED_BY_SPHERE[sphere - 1], track_count_for_song)
    required_measure_item_count = min(
        get_measure_item_count_for_song(world),
        sphere * MEASURES_UNLOCKED_PER_SPHERE,
    )

    return reduce_requirements_to_possible_count(
        world,
        check_number,
        required_rhythm_item_count,
        required_pitch_items,
        required_track_item_count,
        required_measure_item_count,
    )


def reduce_requirements_to_possible_count(
    world: "ComposeapelagoWorld",
    check_number: int,
    rhythm_item_count: int,
    pitch_items: tuple[str, ...],
    track_item_count: int,
    measure_item_count: int,
) -> tuple[int, tuple[str, ...], int, int]:
    """Never require more items than AP could have placed before this check.

    Example: check 5 cannot require 20 items unless those items were already
    precollected. This keeps generation possible.
    """
    earlier_check_count = check_number - 1

    rhythm_item_count = min(
        rhythm_item_count,
        world.precollected_note_value_count + earlier_check_count,
    )
    pitch_items = pitch_items[:world.precollected_pitch_count + earlier_check_count]
    track_item_count = min(
        track_item_count,
        world.precollected_track_count + earlier_check_count,
    )
    measure_item_count = min(
        measure_item_count,
        world.precollected_measure_count + earlier_check_count,
    )

    total_items_that_can_exist_before_this_check = (
        world.precollected_note_value_count
        + world.precollected_pitch_count
        + world.precollected_track_count
        + world.precollected_measure_count
        + earlier_check_count
    )

    while (
        rhythm_item_count
        + len(pitch_items)
        + track_item_count
        + measure_item_count
        > total_items_that_can_exist_before_this_check
    ):
        if pitch_items:
            pitch_items = pitch_items[:-1]
        elif measure_item_count > 0:
            measure_item_count -= 1
        elif track_item_count > 0:
            track_item_count -= 1
        else:
            rhythm_item_count -= 1

    return rhythm_item_count, pitch_items, track_item_count, measure_item_count


def player_has_required_items(
    state,
    player: int,
    track_item_names: list[str],
    rhythm_item_count: int,
    pitch_items: tuple[str, ...],
    track_item_count: int,
    measure_item_count: int,
) -> bool:
    """This is the actual yes/no logic AP checks during generation."""
    has_rhythm_items = state.has_from_list_unique(
        NOTE_VALUE_ITEM_NAMES,
        player,
        rhythm_item_count,
    )
    has_pitch_items = all(state.has(item_name, player) for item_name in pitch_items)
    has_track_items = state.has_from_list_unique(
        track_item_names,
        player,
        track_item_count,
    )
    has_measure_items = state.has(
        PROGRESSIVE_MEASURE_ITEM,
        player,
        measure_item_count,
    )

    return has_rhythm_items and has_pitch_items and has_track_items and has_measure_items


def add_rule_for_staff_check(
    world: "ComposeapelagoWorld",
    location_name: str,
    track_item_names: list[str],
    rhythm_item_count: int,
    pitch_items: tuple[str, ...],
    track_item_count: int,
    measure_item_count: int,
) -> None:
    """Attach one rule to one note/bar check."""
    player = world.player
    location = world.multiworld.get_location(location_name, player)

    add_rule(
        location,
        lambda state: player_has_required_items(
            state,
            player,
            track_item_names,
            rhythm_item_count,
            pitch_items,
            track_item_count,
            measure_item_count,
        ),
    )


def add_rule_for_goal(world: "ComposeapelagoWorld", track_item_names: list[str]) -> None:
    """The goal requires the full writing kit and all song measures."""
    player = world.player
    total_measure_item_count = get_measure_item_count_for_song(world)
    goal_location = world.multiworld.get_location("Melody Complete", player)

    add_rule(
        goal_location,
        lambda state: (
            state.has_from_list_unique(NOTE_VALUE_ITEM_NAMES, player, len(NOTE_VALUE_ITEM_NAMES))
            and state.has_from_list_unique(PITCH_ITEM_NAMES, player, len(PITCH_ITEM_NAMES))
            and state.has_from_list_unique(track_item_names, player, len(track_item_names))
            and state.has(PROGRESSIVE_MEASURE_ITEM, player, total_measure_item_count)
        ),
    )


def set_rules(world: "ComposeapelagoWorld") -> None:
    """Archipelago calls this once while building the multiworld."""
    player = world.player
    total_check_count = get_active_location_count(world)
    song = SONGS[world.song_key]
    track_item_names = song["track_items"]

    if world.options.location_mode.value == LOCATION_MODE_BARS:
        get_location_name = bar_location_name
    else:
        get_location_name = note_location_name

    for check_number in range(1, total_check_count + 1):
        rhythm_item_count, pitch_items, track_item_count, measure_item_count = get_requirements_for_check(
            world,
            check_number,
        )

        # No add_rule is needed when a check has no requirements.
        if rhythm_item_count == 0 and not pitch_items and track_item_count == 0 and measure_item_count == 0:
            continue

        add_rule_for_staff_check(
            world,
            get_location_name(check_number),
            track_item_names,
            rhythm_item_count,
            pitch_items,
            track_item_count,
            measure_item_count,
        )

    add_rule_for_goal(world, track_item_names)
    world.multiworld.completion_condition[player] = lambda state: state.has("Victory", player)