import datetime as dt

from content._schema import define_package

# Priced to sit under Razorpay test mode's ₹15,000 per-payment cap for two travellers, so a
# visitor can take a demo booking all the way to a confirmed test payment (B5).
PACKAGE = define_package(
    slug="old-goa-weekend",
    destination="goa",
    name="Old Goa & Dudhsagar Weekend",
    summary=(
        "Two nights in Panjim: the churches of Old Goa, the Latin Quarter's lanes, a jeep "
        "ride to Dudhsagar falls and a last afternoon on the sand at Sinquerim."
    ),
    themes=["heritage", "adventure"],
    nights=2,
    departure_city="Ex-Goa",
    highlights=[
        "Basilica of Bom Jesus and Se Cathedral in Old Goa",
        "Fontainhas, Panjim's Latin Quarter, on foot",
        "Jeep safari to the Dudhsagar waterfall",
        "A swim and sunset at Sinquerim below Fort Aguada",
    ],
    inclusions=[
        "2 nights at a 3-star hotel in Panjim, breakfast included",
        "Madgaon / Thivim station or Dabolim airport pick-up and drop",
        "Old Goa and Fontainhas half-day with a local guide",
        "Shared jeep safari to Dudhsagar with forest entry",
        "Tripsmith WhatsApp support from booking to return",
    ],
    exclusions=[
        "Train or flights to Goa",
        "Lunches, dinners and drinks",
        "Camera fees and personal expenses",
        "5% GST on the package price",
    ],
    hotels=[{"name": "Hotel Mandovi Heritage", "city": "Panjim", "stars": 3, "nights": 2}],
    faq=[
        {
            "q": "Is Dudhsagar open all year?",
            "a": "The jeep route through Bhagwan Mahavir sanctuary runs from October to May. "
            "In the monsoon it closes and we swap in a spice-plantation lunch instead.",
        },
        {
            "q": "Why is this trip so short?",
            "a": "It is a weekend: arrive Friday, leave Sunday evening. Add nights at the same "
            "hotel when you enquire.",
        },
    ],
    itinerary=[
        {
            "title": "Arrive Panjim — evening in Fontainhas",
            "description": (
                "Pick-up from the station or airport and check in by the Mandovi. At dusk, "
                "walk the painted lanes of Fontainhas with our guide and end at the river "
                "promenade."
            ),
            "meals": "",
            "stay": "Hotel Mandovi Heritage, Panjim",
            "location_name": "Panjim",
        },
        {
            "title": "Old Goa churches and the Dudhsagar jeep ride",
            "description": (
                "Morning at the Basilica of Bom Jesus and Se Cathedral, then east to Mollem "
                "for the forest jeep to Dudhsagar — a swim in the pool below the falls when "
                "the water allows. Back in Panjim by 7 pm."
            ),
            "meals": "B",
            "stay": "Hotel Mandovi Heritage, Panjim",
            "location_name": "Old Goa",
        },
        {
            "title": "Sinquerim beach and departure",
            "description": (
                "Breakfast and check-out, then a slow afternoon at Sinquerim beach below Fort "
                "Aguada before your drop to the station or airport."
            ),
            "meals": "B",
            "location_name": "Sinquerim",
        },
    ],
    departures=[
        {
            "date": dt.date(2026, 11, 6),
            "seats_total": 12,
            "guaranteed": True,
            "price_double_inr": 6_499,
            "price_triple_inr": 5_799,
            "price_child_inr": 3_999,
            "single_supplement_inr": 2_500,
        },
        {
            "date": dt.date(2026, 11, 27),
            "seats_total": 12,
            "price_double_inr": 6_499,
            "price_triple_inr": 5_799,
            "price_child_inr": 3_999,
            "single_supplement_inr": 2_500,
        },
        {
            "date": dt.date(2026, 12, 11),
            "seats_total": 12,
            "price_double_inr": 6_999,
            "price_triple_inr": 6_299,
            "price_child_inr": 4_299,
            "single_supplement_inr": 2_500,
        },
    ],
    photos=[
        {"file": "goa/bom-jesus-basilica.jpg", "alt": "Front of the Basilica of Bom Jesus"},
        {"file": "goa/dudhsagar-falls.jpg", "alt": "Dudhsagar waterfall pouring down the hill"},
        {"file": "goa/aguada-fort.jpg", "alt": "Fort Aguada from above with the lighthouse"},
        {"file": "goa/vagator-palms-2.jpg", "alt": "Palm trees and red cliffs on the Goa coast"},
    ],
    status="live",
)
