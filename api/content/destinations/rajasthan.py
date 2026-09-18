from content._schema import define_destination

DESTINATION = define_destination(
    slug="rajasthan",
    name="Rajasthan",
    tagline="Forts, lakes and the Thar",
    intro=(
        "Rajasthan is the trip people picture when they picture India: Amber's ramparts above "
        "a lake, Jodhpur's blue lanes under Mehrangarh, Udaipur's palaces standing in the "
        "water. Then, four hours west of anywhere, the sand starts and Jaisalmer's fort glows "
        "like a sandcastle somebody forgot to knock down.\n\n"
        "The cities are far apart — five to six hours by road between each — so our trips "
        "either do the golden triangle of forts (Jaipur, Jodhpur, Udaipur) or go deep into "
        "the desert from Jodhpur, never both in one go. We stay in havelis, not chain "
        "hotels: courtyards, painted ceilings and a rooftop for dinner.\n\n"
        "**Best time:** October to March — cool mornings, warm afternoons, cold desert "
        "nights. April to June is 40 °C and above; the monsoon (July–September) is short "
        "and green but humid."
    ),
    cover={
        "file": "rajasthan/amber-fort-lake.jpg",
        "alt": "Amber fort reflected in Maota lake, Jaipur",
    },
    region="North-west India",
    best_months=[10, 11, 12, 1, 2, 3],
    position=4,
)
