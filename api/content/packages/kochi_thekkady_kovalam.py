import datetime as dt

from content._schema import define_package

PACKAGE = define_package(
    slug="kochi-thekkady-kovalam",
    destination="kerala",
    name="Kochi · Thekkady · Kovalam",
    summary=(
        "Six days from the old harbour to the Periyar forest to the beach at Kovalam — one "
        "coach, one guide, and hotels chosen for families. Kerala's greatest hits, unhurried."
    ),
    themes=["family", "heritage"],
    nights=5,
    departure_city="Ex-Bengaluru",
    highlights=[
        "Periyar lake boat safari at dawn — elephants and bison at the water",
        "Fort Kochi on foot: the fishing nets, St Francis church, the Dutch palace",
        "A spice-plantation walk and a Kalaripayattu show at Thekkady",
        "Two nights beside Lighthouse beach at Kovalam",
    ],
    inclusions=[
        "1 night at Fort House, Fort Kochi; 2 nights at Elephant Court, Thekkady; "
        "2 nights at Uday Samudra, Kovalam — breakfast daily",
        "Air-conditioned coach with a Tripsmith guide, Kochi airport to Thiruvananthapuram airport",
        "Periyar boat safari, spice-plantation walk and the Kalaripayattu show",
        "Fort Kochi walking tour with the Kathakali performance",
        "Tripsmith WhatsApp support from booking to return",
    ],
    exclusions=[
        "Flights to Kochi and back from Thiruvananthapuram (we can book them for you at cost)",
        "Lunches and dinners",
        "Padmanabhaswamy temple and Napier museum entries, ayurvedic treatments",
        "5% GST on the package price",
    ],
    hotels=[
        {"name": "Fort House", "city": "Fort Kochi", "stars": 3, "nights": 1},
        {"name": "Elephant Court", "city": "Thekkady", "stars": 4, "nights": 2},
        {"name": "Uday Samudra Leisure Beach Hotel", "city": "Kovalam", "stars": 4, "nights": 2},
    ],
    faq=[
        {
            "q": "Is this trip suitable for young children?",
            "a": "Yes — the longest drive is the Thekkady to Kovalam day (about six hours with "
            "stops), both resorts have pools, and the Periyar boat is a calm one-and-a-half "
            "hour ride. Children under five travel free without a seat or bed.",
        },
        {
            "q": "Will we see elephants at Periyar?",
            "a": "Usually, at the water's edge on the early boat — but it is a wild reserve and "
            "nothing is guaranteed. Bison, sambar and otters are near-certain; the elephant "
            "camp visit later that day is.",
        },
        {
            "q": "Can we fly in and out of the same airport?",
            "a": "The route is linear, so flying into Kochi and out of Thiruvananthapuram "
            "saves a six-hour drive. If you must use one airport, tell us and we quote the "
            "extra transfer.",
        },
    ],
    itinerary=[
        {
            "title": "Arrive Kochi, the fort on foot, Kathakali at dusk",
            "description": (
                "The coach collects the group at Kochi airport and drops you at Fort Kochi by "
                "lunch. The afternoon is on foot: the Chinese fishing nets on the seafront, "
                "St Francis church where Vasco da Gama was first buried, and the Dutch "
                "palace at Mattancherry. The Kathakali performance starts at six."
            ),
            "meals": "",
            "stay": "Fort House, Fort Kochi",
            "location_name": "Fort Kochi",
        },
        {
            "title": "Into the hills to Thekkady, spice plantation walk",
            "description": (
                "Four and a half hours east through rubber and pineapple country, climbing "
                "into the cardamom hills after lunch. Check in at Thekkady and walk a "
                "plantation before dusk — pepper on the vines, cardamom underfoot, cinnamon "
                "bark peeled in front of you."
            ),
            "meals": "B",
            "stay": "Elephant Court, Thekkady",
            "location_name": "Thekkady",
        },
        {
            "title": "Periyar boat safari, elephant camp, Kalaripayattu",
            "description": (
                "The 7.30 am boat on Periyar lake is the one to be on: the forest comes down "
                "to the water and elephants, bison and sambar drink at the edge. The "
                "elephant camp fills the late morning; the evening is a Kalaripayattu show, "
                "Kerala's martial art performed in a sunken arena."
            ),
            "meals": "B",
            "stay": "Elephant Court, Thekkady",
            "location_name": "Periyar",
        },
        {
            "title": "Down through the Ghats to Kovalam",
            "description": (
                "The long day: six hours south-west with a lunch stop, the hills giving way "
                "to coconut country and then the coast. Check in beside Lighthouse beach in "
                "time for the sunset from the rocks below the lighthouse."
            ),
            "meals": "B",
            "stay": "Uday Samudra, Kovalam",
            "location_name": "Kovalam",
        },
        {
            "title": "Kovalam beach day or Thiruvananthapuram",
            "description": (
                "A free day. Stay on the beach and by the pool, or take the coach forty "
                "minutes into the city for the Padmanabhaswamy temple (dress code applies) "
                "and the Napier museum. An ayurvedic massage at the hotel is the other "
                "popular choice."
            ),
            "meals": "B",
            "stay": "Uday Samudra, Kovalam",
            "location_name": "Thiruvananthapuram",
        },
        {
            "title": "Departure from Thiruvananthapuram",
            "description": (
                "A last swim before the half-hour drive to Thiruvananthapuram airport. "
                "Late check-out until 2 pm on request for evening flights."
            ),
            "meals": "B",
            "location_name": "Thiruvananthapuram",
        },
    ],
    departures=[
        {
            "date": dt.date(2026, 11, 27),
            "seats_total": 16,
            "guaranteed": True,
            "price_double_inr": 27_999,
            "price_triple_inr": 25_499,
            "price_child_inr": 16_999,
            "single_supplement_inr": 12_000,
        },
        {
            "date": dt.date(2026, 12, 23),
            "seats_total": 14,
            "price_double_inr": 31_999,
            "price_triple_inr": 29_499,
            "price_child_inr": 18_999,
            "single_supplement_inr": 14_000,
        },
        {
            "date": dt.date(2027, 1, 22),
            "seats_total": 16,
            "price_double_inr": 28_499,
            "price_triple_inr": 25_999,
            "price_child_inr": 16_999,
            "single_supplement_inr": 12_000,
        },
    ],
    photos=[
        {"file": "kerala/periyar-lake.jpg", "alt": "Boats on Periyar lake at Thekkady"},
        {
            "file": "kerala/fort-kochi-fishing-nets.jpg",
            "alt": "A Chinese fishing net at Fort Kochi at sunset",
        },
        {
            "file": "kerala/kovalam-lighthouse-beach.jpg",
            "alt": "Lighthouse beach at Kovalam at sunset",
        },
        {
            "file": "kerala/thekkady-spice-plantation.jpg",
            "alt": "Cardamom on the plant at a Thekkady spice plantation",
        },
        {"file": "kerala/jew-town-mattancherry.jpg", "alt": "Jew Street in Mattancherry, Kochi"},
    ],
    status="live",
)
