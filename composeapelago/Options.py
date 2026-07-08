# All YAML options for Composeapelago.
# The song is not a YAML option: each build randomly picks from its bundled
# song library during generation.

from dataclasses import dataclass
from typing import Dict, List
from Options import Choice, OptionGroup
from worlds.AutoWorld import PerGameCommonOptions


def create_option_groups() -> List[OptionGroup]:
    return [
        OptionGroup(name=name, options=options)
        for name, options in COMPOSEAPELAGO_OPTION_GROUPS.items()
    ]


class LocationMode(Choice):
    """
    per_note: each location is "Note N placed correctly".
    bars: each location is "Bar N completed".
    How many of those locations exist comes from the chosen song itself
    (see Songs.py), not from the YAML.
    """
    display_name = "Location Mode"
    option_per_note = 0
    option_bars = 1
    default = 0


@dataclass
class ComposeapelagoOptions(PerGameCommonOptions):
    location_mode:               LocationMode


COMPOSEAPELAGO_OPTION_GROUPS: Dict[str, List[type]] = {
    "Melody": [
        LocationMode,
    ],
}

