import datetime as dt

from content._schema import define_package

PACKAGE = define_package(
    slug="goa-quiet-escape",
    destination="goa",
    name="Goa Quiet Escape",
    summary=(
        "Four nights in the south — a beach cottage at Palolem, a boat to Butterfly beach, "
        "the Dudhsagar falls and Old Goa's churches. No crowds, no nightlife."
    ),
    themes=["beach", "honeymoon"],
    nights=4,
    departure_city="Ex-Mumbai",
    highlights=[
        "Beachfront cottage at Palolem, ten steps from the water",
        "Boat trip to Butterfly beach with a dolphin-spotting stop",
        "Dudhsagar falls by jeep through the Bhagwan Mahavir sanctuary",
        "Old Goa's Basilica of Bom Jesus and a spice-farm lunch",
        "Sunset at Agonda and Cola's lagoon beach",
    ],
    inclusions=[
        "4 nights in a sea-facing cottage at Palolem, breakfast included",
        "Airport / railway station transfers by private car (Madgaon is 40 min away)",
        "Full-day Dudhsagar + spice farm excursion with jeep safari and lunch",
        "Half-day Old Goa churches and Panjim's Fontainhas quarter by private car",
        "Butterfly beach boat trip (shared boat)",
        "Tripsmith WhatsApp support from booking to return",
    ],
    exclusions=[
        "Flights or train to Goa (we can book them for you at cost)",
        "Meals other than breakfast and the spice-farm lunch",
        "Sanctuary entry and camera fees at Dudhsagar (about ₹500 per person)",
        "5% GST on the package price",
    ],
    hotels=[{"name": "Art Resort Goa", "city": "Palolem", "stars": 3, "nights": 4}],
    faq=[
        {
            "q": "How quiet is quiet?",
            "a": "Palolem has beach shacks and a small main road but no clubs; music stops by "
            "10 pm. Agonda and Cola are quieter still. If you want nightlife, look at "
            "North Goa Beaches instead.",
        },
        {
            "q": "Is Dudhsagar open all year?",
            "a": "The jeep safari runs from October to May. During the monsoon the falls are at "
            "their fullest but the sanctuary is closed to vehicles; we swap in a spice-farm "
            "day and a backwater boat instead.",
        },
        {
            "q": "Can this be a honeymoon package?",
            "a": "It is our most-booked honeymoon itinerary. Tell us when you enquire and the "
            "cottage gets a sea-view upgrade where available plus a candlelit dinner on the "
            "beach.",
        },
    ],
    itinerary=[
        {
            "title": "Arrive — Palolem cottage, first sunset on the crescent",
            "description": (
                "Pick-up from Dabolim airport (90 min) or Madgaon station (40 min). Check in "
                "to your cottage and walk the length of Palolem's crescent before sunset. "
                "Dinner at a beach table — try the grilled kingfish."
            ),
            "meals": "",
            "stay": "Art Resort, Palolem",
            "location_name": "Palolem",
        },
        {
            "title": "Butterfly beach by boat, afternoon at Agonda",
            "description": (
                "A morning boat from Palolem to Butterfly beach — a cove reachable only by "
                "water — with a stop to watch dolphins on the way. Back by lunch. In the "
                "afternoon your driver takes you to Agonda for a long, empty beach and sunset "
                "at H2O or Kopi Desa."
            ),
            "meals": "B",
            "stay": "Art Resort, Palolem",
            "location_name": "Agonda",
        },
        {
            "title": "Dudhsagar falls and a spice-farm lunch",
            "description": (
                "An early start north-east to Mollem. Jeep safari through the Bhagwan Mahavir "
                "sanctuary to the base of the Dudhsagar falls (a 300 m four-tier cascade); "
                "swim in the plunge pool. Lunch at a plantation in Ponda with a walk through "
                "pepper, cardamom and vanilla. Back to Palolem by evening."
            ),
            "meals": "BL",
            "stay": "Art Resort, Palolem",
            "location_name": "Dudhsagar",
        },
        {
            "title": "Old Goa churches, Fontainhas, Cola beach",
            "description": (
                "Morning at Old Goa: the Basilica of Bom Jesus and the Sé Cathedral, then a "
                "walk through Panjim's Latin quarter, Fontainhas, with its painted houses. "
                "On the way back, Cola beach and its freshwater lagoon for a late swim."
            ),
            "meals": "B",
            "stay": "Art Resort, Palolem",
            "location_name": "Old Goa",
        },
        {
            "title": "Lazy morning and departure",
            "description": (
                "Breakfast, a final swim, and a private drop to Madgaon station or Dabolim "
                "airport. Late check-out until 2 pm on request."
            ),
            "meals": "B",
            "location_name": "Dabolim",
        },
    ],
    departures=[
        {
            "date": dt.date(2026, 11, 27),
            "seats_total": 12,
            "guaranteed": True,
            "price_double_inr": 21_499,
            "price_triple_inr": 19_999,
            "price_child_inr": 12_499,
            "single_supplement_inr": 9_000,
        },
        {
            "date": dt.date(2026, 12, 24),
            "seats_total": 10,
            "price_double_inr": 25_999,
            "price_triple_inr": 23_999,
            "price_child_inr": 14_499,
            "single_supplement_inr": 11_000,
        },
        {
            "date": dt.date(2027, 1, 22),
            "seats_total": 12,
            "guaranteed": True,
            "price_double_inr": 21_999,
            "price_triple_inr": 20_499,
            "price_child_inr": 12_499,
            "single_supplement_inr": 9_000,
        },
    ],
    photos=[
        {"file": "goa/palolem-beach.jpg", "alt": "Palolem beach and its line of coconut palms"},
        {"file": "goa/palolem-shack-sunset.jpg", "alt": "Beach shack at Palolem at sunset"},
        {"file": "goa/agonda-sunset.jpg", "alt": "Sunset over the empty sand at Agonda"},
        {"file": "goa/dudhsagar-falls.jpg", "alt": "Dudhsagar falls cascading down the ghats"},
        {
            "file": "goa/bom-jesus-basilica.jpg",
            "alt": "Front of the Basilica of Bom Jesus, Old Goa",
        },
        {"file": "goa/cola-bay-sunrise.jpg", "alt": "Outrigger boat at sunrise off Cola bay"},
    ],
    status="live",
    featured=True,
)
