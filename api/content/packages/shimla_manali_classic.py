import datetime as dt

from content._schema import define_package

PACKAGE = define_package(
    slug="shimla-manali-classic",
    destination="himachal",
    name="Shimla–Manali Classic",
    summary=(
        "The hill trip everyone should do once: two nights on Shimla's Mall Road, two in "
        "Manali, snow at Solang in season, all by coach from Delhi. Easy on families."
    ),
    themes=["hills", "family"],
    nights=4,
    departure_city="Ex-Delhi",
    highlights=[
        "Snow at Solang valley from December to March; ropeway and paragliding after",
        "Kufri's Himalayan nature park and the Ridge at Shimla",
        "The Hadimba temple in its deodar forest and Old Manali's cafés",
        "Coach throughout — no flights to book, no luggage limits",
    ],
    inclusions=[
        "2 nights at Willow Banks, Mall Road, Shimla; 2 nights at Snow Valley Resorts, Manali — "
        "breakfast and dinner daily",
        "Air-conditioned coach Delhi → Shimla → Manali with a Tripsmith guide",
        "Return overnight Volvo coach Manali → Delhi on the last evening",
        "Kufri, Jakhu, Solang valley and Hadimba temple excursions",
        "Tripsmith WhatsApp support from booking to return",
    ],
    exclusions=[
        "Lunches",
        "Solang activities (ropeway about ₹700, paragliding about ₹2,500), snow gear hire",
        "Atal tunnel / Sissu excursion when roads permit (about ₹1,200 per person, paid locally)",
        "Toy train tickets for the optional Shimla–Shoghi ride (about ₹150)",
        "5% GST on the package price",
    ],
    hotels=[
        {"name": "Hotel Willow Banks", "city": "Shimla", "stars": 3, "nights": 2},
        {"name": "Snow Valley Resorts", "city": "Manali", "stars": 3, "nights": 2},
    ],
    faq=[
        {
            "q": "Will there be snow?",
            "a": "At Solang, reliably from mid-December to early March; Kufri gets it in January. "
            "On the spring departures Solang is green and the ropeway and paragliding are "
            "the draw instead.",
        },
        {
            "q": "How long are the coach days?",
            "a": "Delhi to Shimla is about eight hours with two stops; Shimla to Manali about "
            "seven along the Beas. The return is an overnight Volvo — sleeper-style seats, "
            "reaching Delhi around 7 am.",
        },
        {
            "q": "Is Rohtang pass included?",
            "a": "No. Rohtang needs a permit lottery and closes without notice; the Atal tunnel "
            "to Sissu gives the same views in forty minutes and is offered on the day when "
            "the road is open.",
        },
    ],
    itinerary=[
        {
            "title": "Delhi to Shimla, evening on the Ridge",
            "description": (
                "The coach leaves Delhi at 6 am and reaches Shimla by mid-afternoon — eight "
                "hours with a breakfast stop past Chandigarh and lunch at Solan. Check in on "
                "Mall Road, then the Ridge and Christ Church as the lights come on; dinner is "
                "at the hotel."
            ),
            "meals": "D",
            "stay": "Willow Banks, Shimla",
            "location_name": "Shimla",
        },
        {
            "title": "Kufri, Jakhu temple, Lakkar bazaar",
            "description": (
                "An hour up to Kufri for the Himalayan nature park — bears, leopards and yak "
                "rides for the children — and a view of the snow line on a clear day. Back "
                "via the Jakhu hill temple and its monkeys, then the wooden toys of Lakkar "
                "bazaar. Anyone keen can ride the toy train one stop to Shoghi and back "
                "before dinner."
            ),
            "meals": "BD",
            "stay": "Willow Banks, Shimla",
            "location_name": "Kufri",
        },
        {
            "title": "Along the Beas to Manali, Hadimba at dusk",
            "description": (
                "Seven hours north through Mandi and Kullu, the last two along the Beas. "
                "Check in, then the Hadimba temple in its deodar forest and a walk through "
                "Old Manali's cafés and bakeries; dinner at the resort."
            ),
            "meals": "BD",
            "stay": "Snow Valley Resorts, Manali",
            "location_name": "Manali",
        },
        {
            "title": "Solang valley (and the Atal tunnel when open)",
            "description": (
                "A full morning at Solang: snow play and sledges in winter, the ropeway and "
                "paragliding the rest of the year. When the road is open the coach continues "
                "through the Atal tunnel to Sissu in Lahaul for the afternoon. The Vashisht "
                "hot springs are on the way back."
            ),
            "meals": "BD",
            "stay": "Snow Valley Resorts, Manali",
            "location_name": "Solang",
        },
        {
            "title": "Manali morning, overnight coach to Delhi",
            "description": (
                "A free morning on Mall Road and at the Tibetan monastery. The Volvo leaves at "
                "5 pm and reaches Delhi around 7 the next morning; the hotel holds your bags "
                "until then."
            ),
            "meals": "B",
            "location_name": "Manali",
        },
    ],
    departures=[
        {
            "date": dt.date(2026, 12, 19),
            "seats_total": 24,
            "guaranteed": True,
            "price_double_inr": 21_999,
            "price_triple_inr": 19_999,
            "price_child_inr": 12_999,
            "single_supplement_inr": 8_000,
        },
        {
            "date": dt.date(2027, 3, 20),
            "seats_total": 24,
            "price_double_inr": 18_499,
            "price_triple_inr": 16_999,
            "price_child_inr": 10_999,
            "single_supplement_inr": 7_000,
        },
        {
            "date": dt.date(2027, 4, 17),
            "seats_total": 24,
            "guaranteed": True,
            "price_double_inr": 18_499,
            "price_triple_inr": 16_999,
            "price_child_inr": 10_999,
            "single_supplement_inr": 7_000,
        },
        {
            "date": dt.date(2027, 5, 15),
            "seats_total": 24,
            "price_double_inr": 19_999,
            "price_triple_inr": 17_999,
            "price_child_inr": 11_999,
            "single_supplement_inr": 7_500,
        },
    ],
    photos=[
        {"file": "himachal/solang-snow-bridge.jpg", "alt": "Snow at Solang valley"},
        {"file": "himachal/shimla-ridge.jpg", "alt": "Christ Church on the Ridge, Shimla"},
        {
            "file": "himachal/shimla-toy-train.jpg",
            "alt": "The Kalka–Shimla toy train curving through the forest",
        },
        {"file": "himachal/hadimba-temple.jpg", "alt": "The Hadimba temple among deodars"},
        {"file": "himachal/manali-mountains.jpg", "alt": "Snow peaks above the Manali valley"},
    ],
    status="live",
    featured=True,
)
