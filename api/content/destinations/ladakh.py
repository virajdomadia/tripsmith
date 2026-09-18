from content._schema import define_destination

DESTINATION = define_destination(
    slug="ladakh",
    name="Ladakh",
    tagline="Passes, lakes and monasteries",
    intro=(
        "Ladakh is a high desert on the far side of the Himalaya: 3,500 metres at Leh, "
        "5,359 at Khardung La, a sky so blue it looks edited. Monasteries sit on rocks above "
        "the Indus, double-humped camels walk the dunes at Hunder, and Pangong changes "
        "colour four times before lunch.\n\n"
        "Altitude runs the show. Every trip of ours starts with a full rest day in Leh, "
        "climbs the passes only on day three, and sleeps low on the way back. Our drivers "
        "are Ladakhi, the cars carry oxygen, and we would rather cancel a day than push "
        "anyone who is unwell.\n\n"
        "**Best time:** June to September only — the passes are open, the roads clear, "
        "the days warm and the nights cold. We do not run Ladakh in the other eight "
        "months."
    ),
    cover={
        "file": "ladakh/pangong-tso.jpg",
        "alt": "Pangong Tso and its bare mountains",
    },
    region="Trans-Himalaya",
    best_months=[6, 7, 8, 9],
    position=6,
)
