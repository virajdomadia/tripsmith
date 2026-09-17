from content._schema import define_destination

DESTINATION = define_destination(
    slug="himachal",
    name="Himachal",
    tagline="Snow, pines and the Parvati valley",
    intro=(
        "Himachal is the Himalaya you can reach by coach from Delhi overnight. Shimla is the "
        "old summer capital — the Ridge, Mall Road, a toy train and Kufri's hills an hour "
        "up. Manali, seven hours further, is the base for Solang valley's snow, the Atal "
        "tunnel to Lahaul and the deodar forest around the Hadimba temple.\n\n"
        "East of Manali the Parvati valley is a different mood: Kasol's riverside cafés, "
        "the hot springs at Manikaran and hillside villages like Tosh that you walk into.\n\n"
        "**Best time:** March to June for clear skies and open passes; December to February "
        "for snow at Solang (carry proper layers). July to September is monsoon — landslides "
        "close roads and we do not run departures."
    ),
    cover={
        "file": "himachal/solang-valley.jpg",
        "alt": "Snow peaks above Solang valley near Manali",
    },
    region="North India",
    best_months=[3, 4, 5, 6, 12],
    position=3,
)
