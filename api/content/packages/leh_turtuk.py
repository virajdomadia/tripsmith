import datetime as dt

from content._schema import define_package

PACKAGE = define_package(
    slug="leh-turtuk",
    destination="ladakh",
    name="Leh & Turtuk",
    summary=(
        "Past Nubra to the last village before the line of control: Turtuk's Balti stone "
        "houses, apricot orchards and buckwheat fields. A homestay night, Hunder's camels, "
        "Thiksey at dawn."
    ),
    themes=["adventure", "hills"],
    nights=5,
    departure_city="Ex-Leh",
    highlights=[
        "Turtuk — a Balti village that was Pakistan until 1971, open to visitors since 2010",
        "A night in a family-run guesthouse among the apricot trees",
        "Khardung La both ways, Hunder's dunes and camels at sunset",
        "Thiksey's 6 am prayers, horns and all, before your flight",
    ],
    inclusions=[
        "3 nights at Hotel Omasila, Leh; 1 night at Turtuk Holiday Resort; 1 night at "
        "Hunder Sarai, Nubra — breakfast and dinner daily, lunch on arrival day",
        "Private Innova or similar with a Ladakhi driver, oxygen cylinder in the car",
        "Inner-line permits for Nubra and Turtuk",
        "Monastery entries: Thiksey, Diskit; Hall of Fame",
        "Tripsmith WhatsApp support from booking to return",
    ],
    exclusions=[
        "Flights to Leh — we can book them at cost",
        "Lunches after day 1",
        "Camel ride at Hunder (about ₹400), rafting at Sangam (about ₹1,500)",
        "Personal medicines — talk to your doctor about Diamox before you come",
        "5% GST on the package price",
    ],
    hotels=[
        {"name": "Hotel Omasila", "city": "Leh", "stars": 3, "nights": 3},
        {"name": "Turtuk Holiday Resort", "city": "Turtuk", "stars": 2, "nights": 1},
        {"name": "Hunder Sarai", "city": "Nubra", "stars": 3, "nights": 1},
    ],
    faq=[
        {
            "q": "What is the Turtuk stay like?",
            "a": "A family-run guesthouse with simple rooms, attached bathrooms and hot "
            "water in buckets — the village has electricity most evenings. Dinner is "
            "Balti food cooked by the family: buckwheat pancakes, apricot chutney, kisir. "
            "It is the night people talk about afterwards.",
        },
        {
            "q": "Is Turtuk safe? It is near the border.",
            "a": "Yes. It is a normal village with an army post, a school and a lot of "
            "children who want to practise English. Foreign nationals need a slightly "
            "different permit, which we arrange.",
        },
        {
            "q": "How long is the drive to Turtuk?",
            "a": "About seven hours from Leh including Khardung La and a lunch stop at "
            "Diskit — the last 80 km follow the Shyok through a gorge. We break it with "
            "the Hunder night on the way back so you only do the long day once.",
        },
    ],
    itinerary=[
        {
            "title": "Fly into Leh, rest",
            "description": (
                "At the hotel by 9 am; the day is empty on purpose. Water, sleep, the "
                "garden. A slow evening walk to the market if you feel well."
            ),
            "meals": "LD",
            "stay": "Hotel Omasila, Leh",
            "location_name": "Leh",
        },
        {
            "title": "Shanti stupa, Leh palace, Sangam",
            "description": (
                "An easy loop: Shanti stupa early, Leh palace and the old town, then west "
                "along the Indus to Magnetic hill and the Sangam confluence. Rafting is "
                "on offer here for anyone feeling strong. Back by 4."
            ),
            "meals": "BD",
            "stay": "Hotel Omasila, Leh",
            "location_name": "Sangam",
        },
        {
            "title": "Khardung La, Diskit, the Shyok gorge to Turtuk",
            "description": (
                "Leave at 7. Khardung La by 9 (5,359 m, twenty minutes at the top), "
                "Diskit's Maitreya and lunch at noon, then 80 km down the Shyok gorge to "
                "Turtuk by 4 pm. A walk through the village's stone lanes and the "
                "orchards before the family's dinner."
            ),
            "meals": "BD",
            "stay": "Turtuk Holiday Resort, Turtuk",
            "location_name": "Turtuk",
        },
        {
            "title": "Turtuk morning, camels at Hunder",
            "description": (
                "Turtuk's three hamlets on foot: the 16th-century mosque, the Yabgo "
                "royal house museum, the buckwheat fields and the viewpoint over the "
                "Shyok. Leave after lunch for Hunder (two hours), camels on the dunes at "
                "sunset."
            ),
            "meals": "BD",
            "stay": "Hunder Sarai, Nubra",
            "location_name": "Hunder",
        },
        {
            "title": "Back over Khardung La",
            "description": (
                "A late start, the Nubra valley in the morning light, Khardung La again "
                "and Leh by 2 pm. The afternoon for the market or a café; dinner at the "
                "hotel."
            ),
            "meals": "BD",
            "stay": "Hotel Omasila, Leh",
            "location_name": "Khardung La",
        },
        {
            "title": "Thiksey prayers, fly home",
            "description": (
                "Up at 5 for Thiksey's morning prayers — the long horns from the roof, "
                "the young monks with the butter tea — then straight to the airport for "
                "the morning flight."
            ),
            "meals": "B",
            "location_name": "Thiksey",
        },
    ],
    departures=[
        {
            "date": dt.date(2027, 6, 26),
            "seats_total": 10,
            "guaranteed": True,
            "price_double_inr": 29_499,
            "price_triple_inr": 27_499,
            "price_child_inr": 18_499,
            "single_supplement_inr": 8_500,
        },
        {
            "date": dt.date(2027, 7, 24),
            "seats_total": 10,
            "price_double_inr": 27_499,
            "price_triple_inr": 25_499,
            "price_child_inr": 16_999,
            "single_supplement_inr": 8_000,
        },
        {
            "date": dt.date(2027, 8, 28),
            "seats_total": 10,
            "guaranteed": True,
            "price_double_inr": 27_499,
            "price_triple_inr": 25_499,
            "price_child_inr": 16_999,
            "single_supplement_inr": 8_000,
        },
        {
            "date": dt.date(2027, 9, 18),
            "seats_total": 10,
            "price_double_inr": 28_499,
            "price_triple_inr": 26_499,
            "price_child_inr": 17_499,
            "single_supplement_inr": 8_000,
        },
    ],
    photos=[
        {"file": "ladakh/turtuk-valley.jpg", "alt": "Turtuk village and its green terraces"},
        {"file": "ladakh/turtuk-fields.jpg", "alt": "Buckwheat fields around Turtuk"},
        {"file": "ladakh/shyok-turtuk.jpg", "alt": "The Shyok river at Turtuk"},
        {"file": "ladakh/khardung-la-road.jpg", "alt": "The road over Khardung La"},
        {"file": "ladakh/hunder-camels.jpg", "alt": "Bactrian camels on the Hunder dunes"},
        {"file": "ladakh/diskit-gompa.jpg", "alt": "Diskit monastery above the Nubra valley"},
        {"file": "ladakh/leh-palace.jpg", "alt": "Leh palace above the old town"},
        {"file": "ladakh/sangam-2.jpg", "alt": "The Zanskar–Indus confluence"},
    ],
    status="live",
    featured=False,
)
