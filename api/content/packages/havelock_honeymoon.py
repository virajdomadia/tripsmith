import datetime as dt

from content._schema import define_package

PACKAGE = define_package(
    slug="havelock-honeymoon",
    destination="andaman",
    name="Havelock Honeymoon",
    summary=(
        "Four nights in a forest cottage behind Radhanagar beach: a private snorkelling boat, "
        "an intro dive for two, a candlelit dinner on the sand. No group, no schedule."
    ),
    themes=["beach", "honeymoon"],
    nights=4,
    departure_city="Ex-Port Blair",
    highlights=[
        "Barefoot at Havelock — cottages in the forest, Radhanagar a two-minute walk",
        "A private boat to Elephant beach with your own snorkelling guide",
        "Intro scuba dive for two at Nemo reef, instructor beside you",
        "Candlelit dinner on the beach on your last night",
    ],
    inclusions=[
        "4 nights in a Nicobari cottage at Barefoot at Havelock — breakfast and dinner daily",
        "Fast catamaran Port Blair → Havelock → Port Blair in premium seats, private "
        "transfers at both ends",
        "Private snorkelling boat to Elephant beach with guide and gear",
        "One intro scuba dive each at Nemo reef; candlelit beach dinner",
        "Tripsmith WhatsApp support from booking to return",
    ],
    exclusions=[
        "Flights to Port Blair — we can book them at cost",
        "Lunches and drinks",
        "Spa treatments at the resort (couples' massage about ₹6,000)",
        "Scooter hire (about ₹500 a day)",
        "5% GST on the package price",
    ],
    hotels=[
        {"name": "Barefoot at Havelock", "city": "Havelock", "stars": 4, "nights": 4},
    ],
    faq=[
        {
            "q": "Is it just the two of us?",
            "a": "Yes. This is not a group departure — the dates are when we can guarantee "
            "the cottage and the private boat; the trip itself is only you two and a "
            "driver on the island.",
        },
        {
            "q": "Can we add Neil island?",
            "a": "Yes, a night at Neil adds about ₹7,000 per person including the ferries. "
            "We would put it after Havelock so the flight home is unhurried.",
        },
        {
            "q": "Do we need to arrive by a particular time?",
            "a": "Land in Port Blair before 12 noon on day 1 to make the afternoon "
            "catamaran; leave after 4 pm on day 5. Book flights only after we confirm the "
            "cottage.",
        },
    ],
    itinerary=[
        {
            "title": "Port Blair to Havelock, sunset on Radhanagar",
            "description": (
                "Met at the airport and driven to the jetty for the 2 pm catamaran. On "
                "Havelock, the resort's jeep through the forest to your cottage. "
                "Radhanagar is at the end of the path — go for the sunset. Dinner at the "
                "resort."
            ),
            "meals": "D",
            "stay": "Barefoot at Havelock",
            "location_name": "Havelock",
        },
        {
            "title": "Private boat to Elephant beach",
            "description": (
                "A late breakfast, then your own boat to Elephant beach — an hour over the "
                "reef with a guide, and the beach to yourselves before the day boats. Back "
                "for lunch; the afternoon at the resort or on the beach."
            ),
            "meals": "BD",
            "stay": "Barefoot at Havelock",
            "location_name": "Elephant beach",
        },
        {
            "title": "Intro dive at Nemo reef",
            "description": (
                "The dive school picks you up at 8: a briefing, a shallow practice, then "
                "a 40-minute dive to twelve metres with an instructor beside each of you. "
                "Photos are included. The rest of the day is free."
            ),
            "meals": "BD",
            "stay": "Barefoot at Havelock",
            "location_name": "Nemo reef",
        },
        {
            "title": "Kalapathar at dawn, dinner on the sand",
            "description": (
                "A scooter to Kalapathar beach for sunrise if you are up, the village "
                "market for coconuts, a long lunch. At 7 pm a table on the beach with "
                "candles and a set dinner — the resort's, not ours, and it is very good."
            ),
            "meals": "BD",
            "stay": "Barefoot at Havelock",
            "location_name": "Kalapathar",
        },
        {
            "title": "Ferry back, fly home",
            "description": (
                "The 10:30 catamaran to Port Blair, lunch in town, and the airport for "
                "flights after 4 pm."
            ),
            "meals": "B",
            "location_name": "Port Blair",
        },
    ],
    departures=[
        {
            "date": dt.date(2026, 12, 19),
            "seats_total": 6,
            "guaranteed": True,
            "price_double_inr": 37_999,
            "price_triple_inr": 35_999,
            "price_child_inr": 22_999,
            "single_supplement_inr": 15_000,
        },
        {
            "date": dt.date(2027, 2, 10),
            "seats_total": 6,
            "price_double_inr": 34_999,
            "price_triple_inr": 32_999,
            "price_child_inr": 20_999,
            "single_supplement_inr": 14_000,
        },
        {
            "date": dt.date(2027, 3, 13),
            "seats_total": 6,
            "guaranteed": True,
            "price_double_inr": 34_999,
            "price_triple_inr": 32_999,
            "price_child_inr": 20_999,
            "single_supplement_inr": 14_000,
        },
    ],
    photos=[
        {"file": "andaman/radhanagar-trees.jpg", "alt": "Radhanagar beach under the forest edge"},
        {"file": "andaman/andaman-sunset.jpg", "alt": "Sunset over the sea, Andaman islands"},
        {"file": "andaman/kalapathar-beach-2.jpg", "alt": "Kalapathar beach, Havelock"},
        {"file": "andaman/havelock-shore.jpg", "alt": "Clear water on the Havelock shore"},
        {
            "file": "andaman/elephants-on-the-beach.jpg",
            "alt": "Elephants walking on a Havelock beach",
        },
        {
            "file": "andaman/snorkelling-coral.jpg",
            "alt": "Snorkelling over coral at Elephant beach",
        },
    ],
    status="live",
    featured=False,
)
