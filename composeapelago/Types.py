# Shared classes used across the whole package.
# Keeping these in one small file means every other file can import them
# without circular-import headaches.

from BaseClasses import Location, Item, ItemClassification


class ComposeapelagoLocation(Location):
    game = "Composeapelago"


class ComposeapelagoItem(Item):
    game = "Composeapelago"


class ItemData:
    def __init__(self, ap_code, classification: ItemClassification, count: int = 1):
        self.ap_code = ap_code
        self.classification = classification
        self.count = count


class LocData:
    def __init__(self, ap_code, region):
        self.ap_code = ap_code
        self.region = region
