from content._schema import define_destination

DESTINATION = define_destination(
    slug="goa",
    name="Goa",
    tagline="Beaches, shacks and Portuguese lanes — India's easiest holiday",
    intro=(
        "Goa is two holidays in one. The north — Baga, Anjuna, Vagator, Morjim — is beach "
        "shacks, flea markets, sunset forts and a nightlife that runs past midnight. The "
        "south — Palolem, Agonda, Cola — is quieter: crescent bays, coconut groves and "
        "cottages a few steps from the water.\n\n"
        "In between sit the whitewashed churches of Old Goa, the spice farms of Ponda and, "
        "a monsoon-swollen train ride away, the Dudhsagar falls. Direct flights from every "
        "metro make it the simplest 3–5 night break in the country.\n\n"
        "**Best time:** November to February — dry, breezy, 28 °C days. March–May is hot; "
        "June–September is monsoon (green, empty, half the price, most shacks shut)."
    ),
    cover={"file": "goa/palolem-south-goa.jpg", "alt": "Palolem beach curving between headlands"},
    region="West India",
    best_months=[11, 12, 1, 2],
    position=1,
)
