"""Location type constants for seed scripts and API validation.

Keep SYSTEM_SPECIAL_LOCATION_NAMES in sync with keys in
milventory/src/constants/locationSvgByName.js (LOCATION_SVG_MARKUP_BY_NAME).
"""

# Seeded map locations that use custom SVGs — always type "special", not user-assignable.
SYSTEM_SPECIAL_LOCATION_NAMES = frozenset(
    ("To Be Delivered", "Lost Items", "Unsorted Items")
)

# Types leaders may set when creating or editing a location.
LEADER_ASSIGNABLE_LOCATION_TYPES = frozenset(
    ("drawer", "cabinet", "tall_cabinet", "table", "other")
)
