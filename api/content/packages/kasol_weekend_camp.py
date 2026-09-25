import datetime as dt

from content._schema import define_package

# Priced to sit under Razorpay test mode's ₹15,000 per-payment cap for two travellers, so a
# visitor can take a demo booking all the way to a confirmed test payment (B5).
PACKAGE = define_package(
    slug="kasol-weekend-camp",
    destination="himachal",
    name="Kasol Riverside Weekend",
    summary=(
        "Two nights in tents on the Parvati river at Kasol: the Manikaran hot springs, a "
        "walk up to Tosh village and bonfire evenings, with the overnight Volvo from Delhi."
    ),
    themes=["hills", "adventure"],
    nights=2,
    departure_city="Ex-Delhi",
    highlights=[
        "Riverside Swiss tents on the Parvati at Kasol",
        "Manikaran Sahib and its hot springs",
        "Day walk to Tosh village above the valley",
        "Bonfire and dinner by the river both nights",
    ],
    inclusions=[
        "Delhi – Bhuntar – Delhi overnight Volvo seats",
        "2 nights in riverside Swiss tents, breakfast and dinner",
        "Kasol – Manikaran – Tosh transfers by shared cab",
        "Camp leader for the Tosh walk",
        "Tripsmith WhatsApp support from booking to return",
    ],
    exclusions=[
        "Lunches and snacks",
        "Kheerganga trek (ask us — it adds a night)",
        "Personal expenses",
        "5% GST on the package price",
    ],
    hotels=[{"name": "Parvati Riverside Camp", "city": "Kasol", "stars": 3, "nights": 2}],
    faq=[
        {
            "q": "How cold is it at night?",
            "a": "In November and December the nights drop to 0–5 °C. Tents have thick "
            "bedding; bring a warm jacket for the bonfire.",
        },
        {
            "q": "Is the Tosh walk hard?",
            "a": "About 3 km with 400 m of climb on a village path — easy for anyone who "
            "walks regularly. The cab can take you most of the way if you prefer.",
        },
    ],
    itinerary=[
        {
            "title": "Overnight Volvo to Bhuntar, camp by the Parvati",
            "description": (
                "The Volvo leaves Delhi the night before and reaches Bhuntar by morning; a cab "
                "takes you up the valley to camp. Afternoon by the river and Kasol's cafés; "
                "bonfire dinner at night."
            ),
            "meals": "D",
            "stay": "Parvati Riverside Camp, Kasol",
            "location_name": "Kasol",
        },
        {
            "title": "Manikaran hot springs and the walk to Tosh",
            "description": (
                "Morning at Manikaran Sahib, where the springs boil rice in the langar. Then "
                "the cab to Barshaini and the walk up to Tosh for the view down the valley. "
                "Back to camp for dinner."
            ),
            "meals": "BD",
            "stay": "Parvati Riverside Camp, Kasol",
            "location_name": "Tosh",
        },
        {
            "title": "Slow morning and the Volvo home",
            "description": (
                "Breakfast by the river, a last walk through Kasol, and the evening Volvo back "
                "to Delhi from Bhuntar, arriving early next morning."
            ),
            "meals": "B",
            "location_name": "Bhuntar",
        },
    ],
    departures=[
        {
            "date": dt.date(2026, 11, 6),
            "seats_total": 16,
            "guaranteed": True,
            "price_double_inr": 5_999,
            "price_triple_inr": 5_299,
            "price_child_inr": 3_499,
            "single_supplement_inr": 2_000,
        },
        {
            "date": dt.date(2026, 11, 20),
            "seats_total": 16,
            "price_double_inr": 5_999,
            "price_triple_inr": 5_299,
            "price_child_inr": 3_499,
            "single_supplement_inr": 2_000,
        },
        {
            "date": dt.date(2026, 12, 4),
            "seats_total": 16,
            "price_double_inr": 5_499,
            "price_triple_inr": 4_999,
            "price_child_inr": 3_299,
            "single_supplement_inr": 2_000,
        },
    ],
    photos=[
        {"file": "himachal/kasol-parvati-river.jpg", "alt": "The Parvati river running past Kasol"},
        {"file": "himachal/manikaran.jpg", "alt": "Gurdwara Manikaran Sahib by the river"},
        {"file": "himachal/tosh-village.jpg", "alt": "Tosh village high in the Parvati valley"},
        {"file": "himachal/kheerganga.jpg", "alt": "Pine slopes of the upper Parvati valley"},
    ],
    status="live",
)
