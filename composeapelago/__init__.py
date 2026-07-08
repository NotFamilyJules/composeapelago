from BaseClasses import Item, Tutorial
from worlds.AutoWorld import WebWorld, World

from .Items import STARTING_NOTE_VALUES, create_item, create_itempool, item_table
from .Locations import get_location_names, get_total_locations
from .Options import ComposeapelagoOptions, create_option_groups
from .Regions import create_regions
from .Rules import set_rules
from .Songs import SONGS


def build_item_name_to_id() -> dict[str, int]:
    item_ids: dict[str, int] = {}
    for name, data in item_table.items():
        if data.ap_code is not None:
            item_ids[name] = data.ap_code
    return item_ids


def build_slot_options(world: "ComposeapelagoWorld") -> dict[str, object]:
    option_values: dict[str, object] = {}
    option_names = getattr(world.options_dataclass, "__annotations__", {})
    for option_name in option_names:
        if hasattr(world.options, option_name):
            option_values[option_name] = getattr(world.options, option_name).value
    return option_values


class ComposeapelagoWeb(WebWorld):
    theme = "Party"
    tutorials = [
        Tutorial(
            "Multiworld Setup Guide",
            "A guide to setting up Composeapelago for Archipelago. "
            "This guide covers single-player, multiworld, and related software.",
            "English",
            "setup_en.md",
            "setup/en",
            ["FamilyJules"],
        )
    ]


class ComposeapelagoWorld(World):
    """
    Composeapelago is a music notation game: reconstruct a song's melody by
    ear, one note at a time. Pitches and note values are locked behind
    Archipelago items, so you write the music you can afford to write.
    """
    game = "Composeapelago"
    item_name_to_id = build_item_name_to_id()
    location_name_to_id = get_location_names()
    options_dataclass = ComposeapelagoOptions
    option_groups = create_option_groups()
    web = ComposeapelagoWeb()

    # Set for real in create_items() when the pool overflows the location
    # count. Rules.py reads them (set_rules runs after create_items).
    precollected_note_value_count = 0
    precollected_pitch_count = 0
    precollected_track_count = 0
    precollected_measure_count = 0
    precollected_title_reveal_count = 0

    # Which premade song this seed plays, chosen in generate_early.
    song_key = ""

    def generate_early(self) -> None:
        # Quarter notes, whole notes, and rests are always starting
        # inventory: enough to grade out a melody's held notes and reach
        # the first few checks before any items arrive.
        for name in STARTING_NOTE_VALUES:
            self.multiworld.push_precollected(self.create_item(name))

        # Draw this run's song from the library bundled with this build.
        self.song_key = self.random.choice(sorted(SONGS.keys()))

    def create_regions(self) -> None:
        create_regions(self)

    def set_rules(self) -> None:
        set_rules(self)

    def create_items(self) -> None:
        self.multiworld.itempool.extend(create_itempool(self))

    def create_item(self, name: str) -> Item:
        return create_item(self, name)

    def get_filler_item_name(self) -> str:
        return "Metronome Click"

    def fill_slot_data(self) -> dict[str, object]:
        slot_data = {}
        slot_data["options"] = build_slot_options(self)
        slot_data["song"] = self.song_key
        slot_data["Seed"] = self.multiworld.seed_name
        slot_data["Slot"] = self.multiworld.player_name[self.player]
        slot_data["TotalLocations"] = get_total_locations(self)
        slot_data["TotalMeasures"] = SONGS[self.song_key]["measure_count"]
        return slot_data





