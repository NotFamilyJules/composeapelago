# Region layout. Deliberately tiny: everything lives on one staff.
#
# Menu -> Staff is the only connection. All gating happens through location
# rules in Rules.py, not through region access.

from typing import TYPE_CHECKING
from BaseClasses import Region
from .Locations import is_valid_location, location_table
from .Types import ComposeapelagoLocation

if TYPE_CHECKING:
    from . import ComposeapelagoWorld


def create_regions(world: "ComposeapelagoWorld") -> None:
    menu = create_region(world, "Menu")
    menu.connect(create_region(world, "Staff"), "Menu -> Staff")


def create_region(world: "ComposeapelagoWorld", name: str) -> Region:
    reg = Region(name, world.player, world.multiworld)

    reg.locations.extend(
        ComposeapelagoLocation(world.player, key, data.ap_code, reg)
        for key, data in location_table.items()
        if data.region == name and is_valid_location(world, key)
    )

    world.multiworld.regions.append(reg)
    return reg
