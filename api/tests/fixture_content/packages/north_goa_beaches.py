import datetime as dt

from content._schema import define_package

PACKAGE = define_package(
    slug="north-goa-beaches",
    destination="goa",
    name="North Goa Beaches",
    summary=(
        "Three nights in Candolim with Baga, Anjuna and Vagator on your doorstep — "
        "sunset at Chapora Fort, the Wednesday flea market and one slow beach day."
    ),
    themes=["beach", "family"],
    nights=3,
    departure_city="Ex-Mumbai",
    highlights=[
        "Sunset from Chapora Fort over Vagator beach",
        "Anjuna Wednesday flea market and beach shacks",
        "Fort Aguada and the Sinquerim lighthouse walk",
        "Free afternoon at Baga — water sports optional",
    ],
    inclusions=[
        "3 nights at a 4-star resort in Candolim, breakfast included",
        "Airport / railway station pick-up and drop by private car",
        "Full-day North Goa sightseeing by private car (Aguada, Chapora, Anjuna, Vagator)",
        "All tolls, parking and driver allowances",
        "Tripsmith WhatsApp support from booking to return",
    ],
    exclusions=[
        "Flights or train to Goa (we can book them for you at cost)",
        "Lunches, dinners and drinks",
        "Entry tickets, water sports and personal expenses",
        "5% GST on the package price",
    ],
    hotels=[
        {"name": "Lemon Tree Amarante Beach Resort", "city": "Candolim", "stars": 4, "nights": 3}
    ],
    faq=[
        {
            "q": "Is this package suitable for children?",
            "a": "Yes. Candolim is the calmest of the northern beaches and the resort has a pool. "
            "Children aged 5–11 sharing their parents' room pay the child price.",
        },
        {
            "q": "Can we add a night?",
            "a": "Yes — extra nights at the same resort are ₹4,200 per room per night with "
            "breakfast, subject to availability. Ask us when you enquire.",
        },
        {
            "q": "What about the flea market if we are not there on a Wednesday?",
            "a": "The Saturday night market at Arpora runs from late November to April and is "
            "the usual swap; your driver will take you there instead.",
        },
    ],
    itinerary=[
        {
            "title": "Arrive Goa — Candolim check-in, evening at Sinquerim",
            "description": (
                "Pick-up from Dabolim airport or Madgaon / Thivim station and a 45-minute drive "
                "to Candolim. Check in, settle by the pool and walk down to Sinquerim beach for "
                "the first sunset. Dinner suggestions: Fisherman's Wharf or a shack on the sand."
            ),
            "meals": "",
            "stay": "Lemon Tree Amarante, Candolim",
            "location_name": "Candolim",
        },
        {
            "title": "Aguada, Chapora and the Anjuna–Vagator coast",
            "description": (
                "After breakfast, Fort Aguada's ramparts and lighthouse, then north along the "
                "coast road to Anjuna for the flea market (Wednesdays) and lunch at a shack. "
                "Late afternoon at Vagator, ending with sunset from Chapora Fort — the best "
                "view in North Goa. Back to Candolim by 8 pm."
            ),
            "meals": "B",
            "stay": "Lemon Tree Amarante, Candolim",
            "location_name": "Vagator",
        },
        {
            "title": "Beach day at Baga — water sports optional",
            "description": (
                "A free day. Baga is ten minutes away: parasailing, a banana boat ride or "
                "simply a sunbed and a plate of prawns. Evening at Tito's Lane if you want the "
                "nightlife, or a quiet dinner at Calamari on the beach."
            ),
            "meals": "B",
            "stay": "Lemon Tree Amarante, Candolim",
            "location_name": "Baga",
        },
        {
            "title": "Check-out and departure",
            "description": (
                "Breakfast, late check-out on request, and a private drop to the airport or "
                "station. Flights after 1 pm let you fit in one last swim."
            ),
            "meals": "B",
            "location_name": "Dabolim",
        },
    ],
    departures=[
        {
            "date": dt.date(2026, 11, 20),
            "seats_total": 16,
            "guaranteed": True,
            "price_double_inr": 14_999,
            "price_triple_inr": 13_499,
            "price_child_inr": 8_999,
            "single_supplement_inr": 6_000,
        },
        {
            "date": dt.date(2026, 12, 18),
            "seats_total": 4,  # demo: "Filling fast"
            "guaranteed": True,
            "price_double_inr": 17_499,
            "price_triple_inr": 15_999,
            "price_child_inr": 9_999,
            "single_supplement_inr": 7_500,
        },
        {
            "date": dt.date(2027, 1, 15),
            "seats_total": 16,
            "price_double_inr": 15_499,
            "price_triple_inr": 13_999,
            "price_child_inr": 8_999,
            "single_supplement_inr": 6_000,
        },
        {
            "date": dt.date(2027, 2, 12),
            "seats_total": 12,
            "price_double_inr": 14_499,
            "price_triple_inr": 12_999,
            "price_child_inr": 8_499,
            "single_supplement_inr": 6_000,
        },
    ],
    photos=[
        {"file": "goa/vagator-palms-1.jpg", "alt": "Coconut palms leaning over Vagator beach"},
        {"file": "goa/chapora-fort.jpg", "alt": "Laterite walls of Chapora Fort above the sea"},
        {"file": "goa/anjuna-curlies.jpg", "alt": "Beach shack and sunbeds at Anjuna"},
        {"file": "goa/aguada-fort.jpg", "alt": "Fort Aguada from above with the lighthouse"},
        {"file": "goa/baga-beach.jpg", "alt": "Baga beach with boats and sunbeds"},
        {"file": "goa/morjim-boats.jpg", "alt": "Fishing boats pulled up on Morjim beach"},
        {"file": "goa/vagator-palms-2.jpg", "alt": "Palm trees and red cliffs at Vagator"},
    ],
    status="live",
    featured=True,
)
