import datetime as dt

from content._schema import define_package

PACKAGE = define_package(
    slug="manali-kasol-tosh",
    destination="himachal",
    name="Manali · Kasol · Tosh",
    summary=(
        "Two nights in Old Manali, two on the Parvati river at Kasol and one up in the "
        "village of Tosh, with the walk in. Cafés, hot springs and a proper hill trail."
    ),
    themes=["hills", "adventure"],
    nights=5,
    departure_city="Ex-Delhi",
    highlights=[
        "Two nights on the Parvati river at Kasol",
        "The hike up to Tosh and a night in the village",
        "Manikaran's hot springs and the drive towards Malana",
        "Solang valley and the Atal tunnel to Sissu",
    ],
    inclusions=[
        "2 nights at Johnson Lodge, Old Manali; 2 nights at Parvati Kuteer, Kasol; 1 night at a "
        "guesthouse in Tosh — breakfast daily",
        "Overnight Volvo coach Delhi → Manali (leaves the evening before day 1) and Kullu → Delhi",
        "Tempo traveller for Manali–Kasol–Barshaini–Kullu with a Tripsmith trip lead",
        "Solang valley and Manikaran excursions; the Tosh walk with the trip lead",
        "Tripsmith WhatsApp support from booking to return",
    ],
    exclusions=[
        "Lunches and dinners (Kasol's cafés are the point)",
        "Atal tunnel / Sissu excursion when roads permit (about ₹1,200 per person, paid locally)",
        "Porter for the Tosh walk if wanted (about ₹500)",
        "5% GST on the package price",
    ],
    hotels=[
        {"name": "Johnson Lodge", "city": "Old Manali", "stars": 3, "nights": 2},
        {"name": "Parvati Kuteer", "city": "Kasol", "stars": 3, "nights": 2},
        {"name": "Hill Top guesthouse", "city": "Tosh", "stars": 2, "nights": 1},
    ],
    faq=[
        {
            "q": "How hard is the walk to Tosh?",
            "a": "About an hour uphill from the road head at Barshaini on a paved path — "
            "trainers are fine. Bags go up by porter if you want. Kheerganga (a further 4–5 "
            "hours) is optional on the morning of day 6 for those who want it.",
        },
        {
            "q": "Is this a party trip?",
            "a": "No. Kasol is relaxed and the cafés close by 11 pm; Tosh is a village with "
            "a few guesthouses. Groups are sixteen at most and mixed — solo travellers, "
            "couples, friends.",
        },
        {
            "q": "What is the guesthouse in Tosh like?",
            "a": "Simple and clean: a double room with an attached bathroom, hot water in the "
            "evening, a café terrace facing the valley. It is the best available in the "
            "village; do not expect a hotel.",
        },
    ],
    itinerary=[
        {
            "title": "Arrive Manali, Old Manali and the Manu temple",
            "description": (
                "The overnight Volvo from Delhi pulls into Manali around nine. Drop your bags "
                "at the lodge and walk Old Manali while the rooms are readied: the Manu "
                "temple at the top of the village, the Manalsu stream, and a long lunch in "
                "one of the cafés. The evening is yours."
            ),
            "meals": "",
            "stay": "Johnson Lodge, Old Manali",
            "location_name": "Manali",
        },
        {
            "title": "Solang valley, Vashisht hot springs",
            "description": (
                "A morning at Solang — snow in winter, the ropeway and paragliding the rest "
                "of the year — and, when the road is open, through the Atal tunnel to Sissu "
                "for the afternoon. The Vashisht hot springs on the way back are the right "
                "end to the day."
            ),
            "meals": "B",
            "stay": "Johnson Lodge, Old Manali",
            "location_name": "Solang",
        },
        {
            "title": "Down the Beas and up the Parvati to Kasol",
            "description": (
                "Three hours: down the Beas to Bhuntar, then up the Parvati valley as it "
                "narrows. Check in on the river, walk across the footbridge to Chalal "
                "village before dark, and spend the evening in Kasol's cafés."
            ),
            "meals": "B",
            "stay": "Parvati Kuteer, Kasol",
            "location_name": "Kasol",
        },
        {
            "title": "Manikaran and the road towards Malana",
            "description": (
                "Fifteen minutes up the valley to Manikaran, where the gurudwara sits over "
                "hot springs strong enough to cook the langar rice — lunch is there, free "
                "to all. In the afternoon the tempo climbs the Malana road to the viewpoint "
                "over the village (entry to Malana itself is restricted); back to Kasol by "
                "evening."
            ),
            "meals": "B",
            "stay": "Parvati Kuteer, Kasol",
            "location_name": "Manikaran",
        },
        {
            "title": "Walk up to Tosh",
            "description": (
                "An hour's drive to the road head at Barshaini, then the hour's walk up to "
                "Tosh with the Parvati far below. The afternoon is the guesthouse terrace and "
                "the village's stone-and-timber lanes; sunset lights the peaks across the "
                "valley."
            ),
            "meals": "B",
            "stay": "Hill Top guesthouse, Tosh",
            "location_name": "Tosh",
        },
        {
            "title": "Tosh morning, overnight coach home",
            "description": (
                "The keen can leave at dawn for the first stretch of the Kheerganga trail and "
                "be back by lunch; everyone else has a slow morning. Walk down, drive to "
                "Kullu, and the 6 pm Volvo reaches Delhi around 8 the next morning."
            ),
            "meals": "B",
            "location_name": "Kullu",
        },
    ],
    departures=[
        {
            "date": dt.date(2026, 12, 5),
            "seats_total": 16,
            "price_double_inr": 21_499,
            "price_triple_inr": 19_499,
            "price_child_inr": 12_999,
            "single_supplement_inr": 7_500,
        },
        {
            "date": dt.date(2027, 4, 3),
            "seats_total": 16,
            "guaranteed": True,
            "price_double_inr": 19_999,
            "price_triple_inr": 18_499,
            "price_child_inr": 12_499,
            "single_supplement_inr": 7_000,
        },
        {
            "date": dt.date(2027, 5, 8),
            "seats_total": 16,
            "price_double_inr": 19_999,
            "price_triple_inr": 18_499,
            "price_child_inr": 12_499,
            "single_supplement_inr": 7_000,
        },
        {
            "date": dt.date(2027, 6, 5),
            "seats_total": 16,
            "guaranteed": True,
            "price_double_inr": 20_999,
            "price_triple_inr": 19_499,
            "price_child_inr": 12_999,
            "single_supplement_inr": 7_500,
        },
    ],
    photos=[
        {"file": "himachal/kasol-parvati-river.jpg", "alt": "Kasol below the snow peaks"},
        {"file": "himachal/tosh-village.jpg", "alt": "Tosh village above the Parvati valley"},
        {"file": "himachal/manikaran.jpg", "alt": "The gurudwara at Manikaran"},
        {"file": "himachal/kheerganga.jpg", "alt": "The Parvati valley on the Kheerganga trail"},
        {"file": "himachal/old-manali.jpg", "alt": "The Manalsu stream at Old Manali at dusk"},
        {"file": "himachal/solang-valley.jpg", "alt": "Snow peaks above Solang valley"},
    ],
    status="live",
)
