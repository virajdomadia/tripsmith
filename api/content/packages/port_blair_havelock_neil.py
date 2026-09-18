import datetime as dt

from content._schema import define_package

PACKAGE = define_package(
    slug="port-blair-havelock-neil",
    destination="andaman",
    name="Port Blair · Havelock · Neil",
    summary=(
        "The three-island classic: Cellular Jail, three nights on Havelock with Radhanagar "
        "and a snorkel at Elephant beach, then Neil's natural bridge. Fast ferries, "
        "beachfront stays."
    ),
    themes=["beach", "adventure"],
    nights=5,
    departure_city="Ex-Port Blair",
    highlights=[
        "Radhanagar beach at sunset — three nights a walk away from it",
        "Guided snorkelling over the reef at Elephant beach",
        "The Cellular Jail and its light-and-sound show",
        "Neil island's natural rock bridge at low tide",
        "Fast catamaran ferries throughout, booked and confirmed by us",
    ],
    inclusions=[
        "1 night at Sea Shell, Port Blair; 3 nights at Symphony Palms Beach Resort, "
        "Havelock; 1 night at Summer Sands Beach Resort, Neil — breakfast and dinner daily",
        "Fast catamaran ferries Port Blair → Havelock → Neil → Port Blair",
        "Private transfers on every island, airport to airport",
        "Cellular Jail entry and the light-and-sound show; Elephant beach boat with "
        "snorkelling gear and a guide; glass-bottom boat at Bharatpur beach",
        "Tripsmith WhatsApp support from booking to return",
    ],
    exclusions=[
        "Flights to Port Blair — direct from Chennai, Kolkata, Bengaluru, Delhi and "
        "Hyderabad; we can book them at cost",
        "Lunches",
        "Scuba intro dive (about ₹3,500), sea walk (about ₹3,000), jet ski at Elephant beach",
        "Scooter hire on Havelock (about ₹500 a day)",
        "5% GST on the package price",
    ],
    hotels=[
        {"name": "Sea Shell", "city": "Port Blair", "stars": 4, "nights": 1},
        {"name": "Symphony Palms Beach Resort", "city": "Havelock", "stars": 4, "nights": 3},
        {"name": "Summer Sands Beach Resort", "city": "Neil", "stars": 3, "nights": 1},
    ],
    faq=[
        {
            "q": "Do I need to know how to swim?",
            "a": "No. Snorkelling at Elephant beach is in waist-to-chest-deep water with a "
            "life jacket and a guide holding a float. The intro scuba dive is with an "
            "instructor and needs no swimming either.",
        },
        {
            "q": "What if a ferry is cancelled?",
            "a": "It happens a few times a season when the sea is rough. We rebook you on "
            "the next sailing and rearrange the hotels; the spare hours in our plan are "
            "there for this. Flights home are on the last day's evening for the same "
            "reason — book departures after 4 pm.",
        },
        {
            "q": "Which flights should we take?",
            "a": "Arrive Port Blair before 1 pm on day 1 and leave after 4 pm on day 6. "
            "Chennai and Kolkata have the shortest flights (about two hours).",
        },
    ],
    itinerary=[
        {
            "title": "Arrive Port Blair, Cellular Jail",
            "description": (
                "Airport pick-up. After lunch the Cellular Jail — the wings, the gallows, "
                "the museum — and at dusk its light-and-sound show, which is better than "
                "it sounds. Dinner at the hotel by the harbour."
            ),
            "meals": "D",
            "stay": "Sea Shell, Port Blair",
            "location_name": "Port Blair",
        },
        {
            "title": "Ferry to Havelock, Radhanagar at sunset",
            "description": (
                "The 8 am catamaran, 90 minutes to Havelock. Check in at the resort, "
                "lunch, and by 4 pm Radhanagar beach — two kilometres of white sand with "
                "the forest right behind it — for the sunset everybody came for."
            ),
            "meals": "BD",
            "stay": "Symphony Palms Beach Resort, Havelock",
            "location_name": "Havelock",
        },
        {
            "title": "Elephant beach snorkelling",
            "description": (
                "A 20-minute boat to Elephant beach, then an hour over the reef with a "
                "guide: staghorn coral, parrotfish, the occasional turtle. Jet ski and "
                "sea walk are available on the spot. Back by 2; the afternoon is free for "
                "the resort's beach."
            ),
            "meals": "BD",
            "stay": "Symphony Palms Beach Resort, Havelock",
            "location_name": "Elephant beach",
        },
        {
            "title": "Free day on Havelock",
            "description": (
                "Our favourite day: hire a scooter and do the island's one road — "
                "Kalapathar beach at dawn, the village market, lunch at a beach café. Or "
                "do the intro scuba dive at Nemo reef (we book it the evening before)."
            ),
            "meals": "BD",
            "stay": "Symphony Palms Beach Resort, Havelock",
            "location_name": "Kalapathar",
        },
        {
            "title": "Ferry to Neil, the natural bridge",
            "description": (
                "An hour's ferry to Neil. The natural rock bridge at Laxmanpur is a "
                "low-tide walk over the reef flat (we time it); Bharatpur beach's "
                "glass-bottom boat after. Sunset at Laxmanpur beach one, dinner at the "
                "resort."
            ),
            "meals": "BD",
            "stay": "Summer Sands Beach Resort, Neil",
            "location_name": "Neil island",
        },
        {
            "title": "Neil to Port Blair, fly home",
            "description": (
                "A slow breakfast, the 10 am ferry to Port Blair (two hours), lunch in "
                "town and the airport for flights after 4 pm."
            ),
            "meals": "B",
            "location_name": "Port Blair",
        },
    ],
    departures=[
        {
            "date": dt.date(2026, 12, 5),
            "seats_total": 16,
            "guaranteed": True,
            "price_double_inr": 34_999,
            "price_triple_inr": 32_999,
            "price_child_inr": 19_999,
            "single_supplement_inr": 12_000,
        },
        {
            "date": dt.date(2027, 1, 16),
            "seats_total": 16,
            "price_double_inr": 32_999,
            "price_triple_inr": 30_999,
            "price_child_inr": 18_999,
            "single_supplement_inr": 11_000,
        },
        {
            "date": dt.date(2027, 2, 13),
            "seats_total": 16,
            "guaranteed": True,
            "price_double_inr": 32_999,
            "price_triple_inr": 30_999,
            "price_child_inr": 18_999,
            "single_supplement_inr": 11_000,
        },
        {
            "date": dt.date(2027, 3, 20),
            "seats_total": 16,
            "price_double_inr": 33_999,
            "price_triple_inr": 31_999,
            "price_child_inr": 19_499,
            "single_supplement_inr": 11_500,
        },
    ],
    photos=[
        {"file": "andaman/radhanagar-beach.jpg", "alt": "Radhanagar beach, Havelock"},
        {
            "file": "andaman/snorkelling-coral.jpg",
            "alt": "Snorkelling over coral at Elephant beach",
        },
        {
            "file": "andaman/neil-natural-bridge.jpg",
            "alt": "The natural rock bridge on Neil island",
        },
        {"file": "andaman/cellular-jail.jpg", "alt": "The Cellular Jail, Port Blair"},
        {"file": "andaman/elephant-beach.jpg", "alt": "Elephant beach, Havelock"},
        {"file": "andaman/kalapathar-beach.jpg", "alt": "Kalapathar beach at dawn"},
        {"file": "andaman/ross-island-jetty.jpg", "alt": "The jetty at Ross island"},
        {"file": "andaman/beach-boat.jpg", "alt": "A boat in the shallows off Havelock"},
    ],
    status="live",
    featured=True,
)
