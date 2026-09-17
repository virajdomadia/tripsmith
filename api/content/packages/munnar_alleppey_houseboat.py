import datetime as dt

from content._schema import define_package

PACKAGE = define_package(
    slug="munnar-alleppey-houseboat",
    destination="kerala",
    name="Munnar & Alleppey Houseboat",
    summary=(
        "Two nights among Munnar's tea estates, a night on a private houseboat on the "
        "Vembanad backwaters and a last evening in Fort Kochi. The Kerala trip we would pick."
    ),
    themes=["hills", "honeymoon"],
    nights=4,
    departure_city="Ex-Bengaluru",
    highlights=[
        "A night on a private houseboat on the Vembanad backwaters",
        "Eravikulam park and the tea estates above Munnar",
        "Fort Kochi's Chinese fishing nets and a Kathakali evening",
        "A tea-estate stay with the plantation on your doorstep",
    ],
    inclusions=[
        "2 nights at Tea Valley Resort, Munnar, breakfast and dinner",
        "1 night on a private one-bedroom houseboat, Alleppey — lunch, dinner, breakfast",
        "1 night at Fort House, Fort Kochi, breakfast included",
        "Private car with driver for all transfers and sightseeing (Kochi airport to airport)",
        "Eravikulam park entry and the Kathakali performance in Fort Kochi",
        "Tripsmith WhatsApp support from booking to return",
    ],
    exclusions=[
        "Flights or train to Kochi (we can book them for you at cost)",
        "Meals not listed above",
        "Tea museum entry, boat rides at Mattupetty and camera fees (about ₹600 per person)",
        "5% GST on the package price",
    ],
    hotels=[
        {"name": "Tea Valley Resort", "city": "Munnar", "stars": 3, "nights": 2},
        {"name": "Spice Routes houseboat", "city": "Alleppey", "stars": 4, "nights": 1},
        {"name": "Fort House", "city": "Fort Kochi", "stars": 3, "nights": 1},
    ],
    faq=[
        {
            "q": "Is Eravikulam open on our dates?",
            "a": "The park closes for the Nilgiri tahr calving season, usually February to early "
            "April. On those departures we swap in Top Station and the Kolukkumalai tea "
            "estate jeep ride instead.",
        },
        {
            "q": "What is the houseboat like?",
            "a": "A one-bedroom kettuvallam with an air-conditioned cabin, attached bathroom and "
            "an open upper deck. A crew of three cooks on board — Kerala meals, fish if you "
            "want it. It moors by 5.30 pm as the backwater rules require.",
        },
        {
            "q": "Can we add Varkala or Kovalam?",
            "a": "Yes — two extra nights on the coast after Kochi is our most common extension. "
            "Ask when you enquire and we quote it with the same driver.",
        },
    ],
    itinerary=[
        {
            "title": "Arrive Kochi, drive up to the tea country",
            "description": (
                "Your driver meets you at Kochi airport for the four-hour climb into the "
                "Ghats, with a stop at the Cheeyappara falls where the road starts to twist. "
                "Check in above the estates at Pothamedu in time for the light on the tea; "
                "dinner is at the resort."
            ),
            "meals": "D",
            "stay": "Tea Valley Resort, Munnar",
            "location_name": "Munnar",
        },
        {
            "title": "Eravikulam, Mattupetty and the tea museum",
            "description": (
                "An early start for Eravikulam, where the Nilgiri tahr graze the grassland "
                "before the crowds arrive. Then the Mattupetty dam and Echo point, and the "
                "KDHP tea museum for how the leaf gets from bush to cup. Back by four for a "
                "walk through the estate behind the resort; dinner there."
            ),
            "meals": "BD",
            "stay": "Tea Valley Resort, Munnar",
            "location_name": "Eravikulam",
        },
        {
            "title": "Down to Alleppey, board the houseboat",
            "description": (
                "Five hours down to the plain, boarding at Punnamada at noon as lunch is "
                "served. The afternoon is canals, paddies below water level and villages you "
                "pass at walking pace; the boat moors by sunset and dinner is on the deck."
            ),
            "meals": "BLD",
            "stay": "Houseboat, Vembanad lake",
            "location_name": "Alleppey",
        },
        {
            "title": "Fort Kochi: fishing nets, Mattancherry, Kathakali",
            "description": (
                "Breakfast on board, off by nine, and ninety minutes to Fort Kochi. The "
                "Chinese fishing nets on the seafront, Mattancherry palace and the "
                "antique shops of Jew Street fill the afternoon; the Kathakali performance "
                "starts at six, with the make-up done in front of you from five."
            ),
            "meals": "B",
            "stay": "Fort House, Fort Kochi",
            "location_name": "Fort Kochi",
        },
        {
            "title": "Kochi morning and departure",
            "description": (
                "A last walk past St Francis church to a coffee on Princess Street, then the "
                "hour's drive to Kochi airport. Late check-out until 1 pm on request."
            ),
            "meals": "B",
            "location_name": "Kochi",
        },
    ],
    departures=[
        {
            "date": dt.date(2026, 11, 13),
            "seats_total": 12,
            "guaranteed": True,
            "price_double_inr": 22_999,
            "price_triple_inr": 20_999,
            "price_child_inr": 13_499,
            "single_supplement_inr": 9_500,
        },
        {
            "date": dt.date(2026, 12, 18),
            "seats_total": 10,
            "price_double_inr": 25_999,
            "price_triple_inr": 23_999,
            "price_child_inr": 15_499,
            "single_supplement_inr": 11_000,
        },
        {
            "date": dt.date(2027, 1, 15),
            "seats_total": 12,
            "guaranteed": True,
            "price_double_inr": 21_999,
            "price_triple_inr": 19_999,
            "price_child_inr": 12_999,
            "single_supplement_inr": 9_000,
        },
        {
            "date": dt.date(2027, 2, 12),
            "seats_total": 12,
            "price_double_inr": 21_999,
            "price_triple_inr": 19_999,
            "price_child_inr": 12_999,
            "single_supplement_inr": 9_000,
        },
    ],
    photos=[
        {"file": "kerala/munnar-tea-aerial.jpg", "alt": "Tea estates of Munnar from above"},
        {"file": "kerala/munnar-tea-gardens.jpg", "alt": "Tea bushes on a Munnar hillside"},
        {
            "file": "kerala/alleppey-houseboat.jpg",
            "alt": "Houseboats on a backwater canal near Alleppey",
        },
        {"file": "kerala/alleppey-backwaters-1.jpg", "alt": "A houseboat under the palms"},
        {
            "file": "kerala/fort-kochi-fishing-nets.jpg",
            "alt": "A Chinese fishing net at Fort Kochi at sunset",
        },
    ],
    status="live",
    featured=True,
)
