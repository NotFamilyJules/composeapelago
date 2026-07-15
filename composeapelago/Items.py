# Item tables and item pool creation.

from typing import TYPE_CHECKING, List
from BaseClasses import Item, ItemClassification
from .Locations import get_total_locations
from .Songs import SONGS
from .Types import ComposeapelagoItem, ItemData

if TYPE_CHECKING:
    from . import ComposeapelagoWorld

PITCH_CLASS_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
LOWEST_OCTAVE = 1
HIGHEST_OCTAVE = 7
PRIORITY_OCTAVES = (4, 5)
MAX_MEASURES = 150

STARTING_NOTE_VALUES = ["Quarter Note", "Whole Note", "Rest"]
SONG_TITLE_REVEAL_ITEM = "Song Title Reveal"
PROGRESSIVE_MEASURE_ITEM = "Progressive Measure"
RANDOM_HINT_ITEM = "Random Hint"
NEXT_PITCH_ITEM = "Next Pitch"
VOICE_CRACK_TRAP_ITEM = "Voice Crack Trap"
DRUNK_DRUMMER_TRAP_ITEM = "Drunk Drummer Trap"
TUNING_TRAP_ITEM = "Tuning Trap"
UNDO_ITEM = "Undo"
REDO_ITEM = "Redo"
COPY_ITEM = "Copy"
PASTE_ITEM = "Paste"

NOTE_VALUE_ITEM_NAMES = [
    "Half Note",
    "Eighth Note",
    "Sixteenth Note",
    "Dotted Modifier",
    "Tie",
]

FILLER_ITEM_NAMES = [
    "Metronome Click",
    "Practice Token",
    "Tuning Fork",
    "Staff Paper",
    "Pencil",
]
FILLER_ITEM_NAME = FILLER_ITEM_NAMES[0]


def pitch_item_name(pitch_class: str, octave: int) -> str:
    return f"{pitch_class}{octave}"



def is_priority_pitch(name: str) -> bool:
    return name[-1].isdigit() and int(name[-1]) in PRIORITY_OCTAVES


def create_itempool(world: "ComposeapelagoWorld") -> List[Item]:
    itempool: List[Item] = []
    song = SONGS[world.song_key]
    track_item_names = song["track_items"]
    measure_item_names = [PROGRESSIVE_MEASURE_ITEM for _ in range(min(MAX_MEASURES, song["measure_count"]) - 1)]
    bars_mode = getattr(world.options, "location_mode").value == 1
    if bars_mode:
        for name in measure_item_names:
            world.multiworld.push_precollected(create_item(world, name))
        world.precollected_measure_count = len(measure_item_names)
        measure_item_names = []
    pool_names = (
        list(composeapelago_pitches.keys())
        + list(NOTE_VALUE_ITEM_NAMES)
        + list(track_item_names)
        + [SONG_TITLE_REVEAL_ITEM, UNDO_ITEM, REDO_ITEM, COPY_ITEM, PASTE_ITEM]
        + measure_item_names
    )

    total_locations = get_total_locations(world)
    overflow = len(pool_names) - total_locations
    if overflow > 0:
        spare_pitches = [name for name in composeapelago_pitches if not is_priority_pitch(name)]
        priority_pitches = [name for name in composeapelago_pitches if is_priority_pitch(name)]
        world.random.shuffle(spare_pitches)
        world.random.shuffle(priority_pitches)
        overflow_order = spare_pitches + priority_pitches + list(NOTE_VALUE_ITEM_NAMES) + list(track_item_names) + [SONG_TITLE_REVEAL_ITEM] + measure_item_names
        precollect_names = overflow_order[:overflow]
        for name in precollect_names:
            world.multiworld.push_precollected(create_item(world, name))
            pool_names.remove(name)
        world.precollected_note_value_count = sum(1 for name in precollect_names if name in NOTE_VALUE_ITEM_NAMES)
        world.precollected_pitch_count = sum(1 for name in precollect_names if name in composeapelago_pitches)
        world.precollected_track_count = sum(1 for name in precollect_names if name in track_item_names)
        world.precollected_measure_count += sum(1 for name in precollect_names if name in measure_item_names)
        world.precollected_title_reveal_count = 1 if SONG_TITLE_REVEAL_ITEM in precollect_names else 0

    for name in pool_names:
        itempool.append(create_item(world, name))

    open_slots = total_locations - len(itempool)
    special_item_pattern = [
        RANDOM_HINT_ITEM,
        NEXT_PITCH_ITEM,
        VOICE_CRACK_TRAP_ITEM,
        RANDOM_HINT_ITEM,
        NEXT_PITCH_ITEM,
        DRUNK_DRUMMER_TRAP_ITEM,
        RANDOM_HINT_ITEM,
        NEXT_PITCH_ITEM,
        TUNING_TRAP_ITEM,
    ]
    for index in range(open_slots):
        itempool.append(create_item(world, special_item_pattern[index % len(special_item_pattern)]))

    victory = create_item(world, "Victory")
    world.multiworld.get_location("Melody Complete", world.player).place_locked_item(victory)

    filler_needed = total_locations - len(itempool)
    itempool.extend(
        create_item(world, FILLER_ITEM_NAMES[index % len(FILLER_ITEM_NAMES)])
        for index in range(filler_needed)
    )

    return itempool


def create_item(world: "ComposeapelagoWorld", name: str) -> Item:
    data = item_table[name]
    return ComposeapelagoItem(name, data.classification, data.ap_code, world.player)


composeapelago_pitches = {
    pitch_item_name(pitch_class, octave): ItemData(
        76241001 + (octave - LOWEST_OCTAVE) * len(PITCH_CLASS_NAMES) + pc_index,
        ItemClassification.progression,
    )
    for octave in range(LOWEST_OCTAVE, HIGHEST_OCTAVE + 1)
    for pc_index, pitch_class in enumerate(PITCH_CLASS_NAMES)
}
PITCH_ITEM_NAMES = list(composeapelago_pitches)

composeapelago_note_values = {
    "Quarter Note":            ItemData(76242001, ItemClassification.progression),
    "Whole Note":              ItemData(76242002, ItemClassification.progression),
    "Half Note":               ItemData(76242003, ItemClassification.progression),
    "Eighth Note":             ItemData(76242004, ItemClassification.progression),
    "Sixteenth Note":          ItemData(76242005, ItemClassification.progression),
    "Dotted Modifier":         ItemData(76242006, ItemClassification.progression),
    "Tie":                     ItemData(76242007, ItemClassification.progression),
    "Rest":                    ItemData(76242008, ItemClassification.progression),
}

composeapelago_filler = {
    "Metronome Click":         ItemData(76243001, ItemClassification.filler, 0),
    "Practice Token":          ItemData(76243002, ItemClassification.filler, 0),
    "Tuning Fork":             ItemData(76243003, ItemClassification.filler, 0),
    "Staff Paper":             ItemData(76243004, ItemClassification.filler, 0),
    "Pencil":                  ItemData(76243005, ItemClassification.filler, 0),
}

composeapelago_tracks = {
    "Bass Track":              ItemData(76244001, ItemClassification.progression),
    "Chord Track":             ItemData(76244002, ItemClassification.progression),
    "Drum Track":              ItemData(76244003, ItemClassification.progression),
    "Harmony Track":           ItemData(76244004, ItemClassification.progression),
    "Counter Melody Track":    ItemData(76244005, ItemClassification.progression),
    "Extra Track 1":           ItemData(76244006, ItemClassification.progression),
    "Extra Track 2":           ItemData(76244007, ItemClassification.progression),
    "Extra Track 3":           ItemData(76244008, ItemClassification.progression),
}

composeapelago_special = {
    SONG_TITLE_REVEAL_ITEM:     ItemData(76244101, ItemClassification.useful),
    RANDOM_HINT_ITEM:           ItemData(76244102, ItemClassification.useful),
    VOICE_CRACK_TRAP_ITEM:      ItemData(76244103, ItemClassification.trap),
    DRUNK_DRUMMER_TRAP_ITEM:    ItemData(76244104, ItemClassification.trap),
    NEXT_PITCH_ITEM:            ItemData(76244105, ItemClassification.useful),
    TUNING_TRAP_ITEM:           ItemData(76244106, ItemClassification.trap),
    UNDO_ITEM:                  ItemData(76244107, ItemClassification.useful),
    REDO_ITEM:                  ItemData(76244108, ItemClassification.useful),
    COPY_ITEM:                  ItemData(76244109, ItemClassification.useful),
    PASTE_ITEM:                 ItemData(76244110, ItemClassification.useful),
}

composeapelago_measures = {
    PROGRESSIVE_MEASURE_ITEM:    ItemData(76247001, ItemClassification.progression),
}

composeapelago_events = {
    "Victory":                 ItemData(None, ItemClassification.progression),
}

item_table = {
    **composeapelago_pitches,
    **composeapelago_note_values,
    **composeapelago_tracks,
    **composeapelago_special,
    **composeapelago_measures,
    **composeapelago_filler,
    **composeapelago_events,
}


