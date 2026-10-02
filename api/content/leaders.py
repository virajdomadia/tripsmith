"""The demo trip leaders (R41, P3). Made-up people, so no photos: the site draws each one a
monogram. Their phone is the business number (seed.py), never an invented one that might
belong to someone real."""

import datetime as dt

from content._schema import LeaderContent, LeaderOverride

LEADERS = [
    LeaderContent(
        slug="tenzin-norbu",
        name="Tenzin Norbu",
        languages=["English", "Hindi", "Ladakhi"],
        years_leading=11,
        regions=["Ladakh", "Himachal high passes"],
        bio=(
            "Grew up in Leh and has crossed Khardung La more times than anyone can count. Paces "
            "every group for the altitude, knows which dhaba has the best thukpa at each stop, "
            "and keeps a spare oxygen can in the front seat."
        ),
        fun_fact="Can name every peak you can see from Pangong — and tell you which ones lie.",
        packages=["leh-nubra-pangong", "leh-turtuk", "manali-kasol-tosh"],
        overrides=[LeaderOverride(package="kasol-weekend-camp", date=dt.date(2026, 11, 20))],
    ),
    LeaderContent(
        slug="kavya-rawat",
        name="Kavya Rawat",
        languages=["English", "Hindi", "Garhwali"],
        years_leading=7,
        regions=["Himachal", "Rajasthan"],
        bio=(
            "Splits the year between pine forests and sand dunes: Himachal through the summer, "
            "Rajasthan once the desert cools. A trained mountain guide with a soft spot for "
            "old havelis and the stories behind every carved door."
        ),
        fun_fact="Has a playlist for every road in Himachal, timed to the hairpin bends.",
        packages=[
            "kasol-weekend-camp",
            "shimla-manali-classic",
            "jaipur-jodhpur-udaipur",
            "jaisalmer-desert-nights",
        ],
    ),
    LeaderContent(
        slug="meera-nair",
        name="Meera Nair",
        languages=["English", "Malayalam", "Tamil", "Hindi"],
        years_leading=9,
        regions=["Kerala", "Andaman Islands"],
        bio=(
            "Born in Kochi, schooled on houseboats and spice estates, and a certified "
            "open-water diver. Knows the backwater routes the big boats can't take and the "
            "quietest stretch of Radhanagar at sunset."
        ),
        fun_fact="Once cooked sadya for forty travellers on a houseboat with two burners.",
        packages=[
            "kochi-thekkady-kovalam",
            "munnar-alleppey-houseboat",
            "havelock-honeymoon",
            "port-blair-havelock-neil",
        ],
    ),
    LeaderContent(
        slug="rohan-dsouza",
        name="Rohan D'Souza",
        languages=["English", "Konkani", "Hindi", "Marathi"],
        years_leading=6,
        regions=["Goa", "Andaman coast"],
        bio=(
            "A Goan who left a hotel job to show people the Goa beyond the beach shacks: Latin "
            "Quarter lanes, spice farms, monsoon waterfalls and the bakery that sells out of "
            "poi by eight."
        ),
        fun_fact="Has never lost a game of beach football — according to Rohan D'Souza.",
        packages=["goa-quiet-escape", "north-goa-beaches", "old-goa-weekend"],
        overrides=[
            LeaderOverride(package="port-blair-havelock-neil", date=dt.date(2027, 1, 16)),
        ],
    ),
]
