import datetime as dt

from content._schema import define_package

PACKAGE = define_package(
    slug="leh-nubra-pangong",
    destination="ladakh",
    name="Leh · Nubra · Pangong",
    summary=(
        "The full Ladakh loop in seven days: a rest day in Leh, over Khardung La to Nubra's "
        "dunes, the Shyok road to Pangong, back over Chang La. Oxygen in every car."
    ),
    themes=["adventure", "hills"],
    nights=6,
    departure_city="Ex-Leh",
    highlights=[
        "Khardung La, 5,359 m — one of the highest roads you can drive",
        "Bactrian camels on the Hunder dunes at sunset",
        "A night on the shore of Pangong Tso at Spangmik",
        "The Shyok river road between Nubra and Pangong — no going back through Leh",
        "Thiksey, Diskit and Shanti stupa, with a Ladakhi driver who knows the lamas",
    ],
    inclusions=[
        "4 nights at Hotel Omasila, Leh; 1 night at Hunder Sarai, Nubra; 1 night at Pangong "
        "Sarai camp, Spangmik — breakfast and dinner daily, lunch on arrival day",
        "Private Innova or similar with a Ladakhi driver for the whole trip, oxygen cylinder "
        "in the car",
        "Inner-line permits for Nubra, Pangong and the Shyok road",
        "Monastery entries: Thiksey, Diskit, Hemis; Hall of Fame",
        "Tripsmith WhatsApp support from booking to return",
    ],
    exclusions=[
        "Flights to Leh — Delhi has several morning flights; we can book them at cost",
        "Lunches after day 1",
        "Camel ride at Hunder (about ₹400 for 15 minutes), rafting on the Zanskar (about ₹1,500)",
        "Personal medicines — talk to your doctor about Diamox before you come",
        "5% GST on the package price",
    ],
    hotels=[
        {"name": "Hotel Omasila", "city": "Leh", "stars": 3, "nights": 4},
        {"name": "Hunder Sarai", "city": "Nubra", "stars": 3, "nights": 1},
        {"name": "Pangong Sarai", "city": "Spangmik", "stars": 2, "nights": 1},
    ],
    faq=[
        {
            "q": "Will I get altitude sickness?",
            "a": "Most people feel the altitude on day one — a headache, poor sleep, "
            "breathlessness on stairs. That is why day one is a rest day and day two stays "
            "around Leh. Drink water, skip alcohol, and tell your driver the moment you feel "
            "worse; the car has oxygen and Leh has a good hospital. Ask your doctor about "
            "Diamox before you travel.",
        },
        {
            "q": "How cold does it get?",
            "a": "Leh is 20–25 °C by day in summer and 5–10 °C at night. Pangong's camp "
            "is close to freezing at night even in July — the tents have thick quilts, "
            "and you will want a down jacket, a woollen cap and gloves.",
        },
        {
            "q": "Is the Pangong camp comfortable?",
            "a": "Fixed tents with proper beds and an attached bathroom with running "
            "water. Electricity is from a generator, evenings only. It is basic, and the "
            "lake outside the flap makes up for it.",
        },
    ],
    itinerary=[
        {
            "title": "Fly into Leh, rest",
            "description": (
                "Leh's flights land at dawn; you are at the hotel by 9 am and the rest of "
                "the day is deliberately empty. Sleep, drink water, sit in the garden. If "
                "you feel fine by evening, a slow walk to the market and Leh's main "
                "street; if not, that is what the rest day is for."
            ),
            "meals": "LD",
            "stay": "Hotel Omasila, Leh",
            "location_name": "Leh",
        },
        {
            "title": "Leh's stupa and palace, Sangam, Magnetic hill",
            "description": (
                "An easy loop below 3,600 m: Shanti stupa at 8 am, Leh palace above the "
                "old town, then west along the Indus — the Hall of Fame, Gurudwara Pathar "
                "Sahib, Magnetic hill and the Sangam where the green Indus meets the "
                "brown Zanskar (rafting is here if you want it). Back by 4."
            ),
            "meals": "BD",
            "stay": "Hotel Omasila, Leh",
            "location_name": "Sangam",
        },
        {
            "title": "Over Khardung La to Nubra, camels at Hunder",
            "description": (
                "Two hours' climb to Khardung La, 5,359 m — twenty minutes at the top for "
                "the photo, no more — and down into the Nubra valley. Diskit monastery "
                "and its 32-metre Maitreya after lunch, then the Hunder dunes at 5 pm: "
                "Bactrian camels, the Shyok river, and mountains on every side."
            ),
            "meals": "BD",
            "stay": "Hunder Sarai, Nubra",
            "location_name": "Hunder",
        },
        {
            "title": "The Shyok road to Pangong",
            "description": (
                "Five to six hours along the Shyok — the river road that means you do not "
                "go back through Leh — with the first blue of Pangong appearing after "
                "Tangtse. Camp on the lake's shore at Spangmik; the evening light on the "
                "far mountains is the trip's best hour."
            ),
            "meals": "BD",
            "stay": "Pangong Sarai, Spangmik",
            "location_name": "Pangong Tso",
        },
        {
            "title": "Lake sunrise, Chang La, Thiksey",
            "description": (
                "Sunrise on the lake, then the road back over Chang La (5,360 m) with a "
                "stop for tea at the pass. Thiksey monastery on the way into Leh — the "
                "twelve-storey gompa and the two-storey Maitreya. Leh by 4 pm."
            ),
            "meals": "BD",
            "stay": "Hotel Omasila, Leh",
            "location_name": "Thiksey",
        },
        {
            "title": "Hemis and a free afternoon",
            "description": (
                "Hemis, Ladakh's richest monastery, in the morning, and Stok palace "
                "museum on the way back. The afternoon is yours — the market for "
                "pashmina and apricots, a café on Changspa road, or nothing at all."
            ),
            "meals": "BD",
            "stay": "Hotel Omasila, Leh",
            "location_name": "Hemis",
        },
        {
            "title": "Fly home",
            "description": (
                "An early transfer for the morning flights out of Leh — nothing departs "
                "after midday."
            ),
            "meals": "B",
            "location_name": "Leh",
        },
    ],
    departures=[
        {
            "date": dt.date(2027, 6, 12),
            "seats_total": 12,
            "guaranteed": True,
            "price_double_inr": 31_999,
            "price_triple_inr": 29_999,
            "price_child_inr": 19_999,
            "single_supplement_inr": 9_500,
        },
        {
            "date": dt.date(2027, 7, 3),
            "seats_total": 12,
            "price_double_inr": 29_999,
            "price_triple_inr": 27_999,
            "price_child_inr": 18_999,
            "single_supplement_inr": 9_000,
        },
        {
            "date": dt.date(2027, 8, 14),
            "seats_total": 12,
            "guaranteed": True,
            "price_double_inr": 29_999,
            "price_triple_inr": 27_999,
            "price_child_inr": 18_999,
            "single_supplement_inr": 9_000,
        },
        {
            "date": dt.date(2027, 9, 11),
            "seats_total": 12,
            "price_double_inr": 30_999,
            "price_triple_inr": 28_999,
            "price_child_inr": 19_499,
            "single_supplement_inr": 9_000,
        },
    ],
    photos=[
        {"file": "ladakh/pangong-tso.jpg", "alt": "Pangong Tso"},
        {"file": "ladakh/khardung-la.jpg", "alt": "Prayer flags at Khardung La"},
        {"file": "ladakh/hunder-camels.jpg", "alt": "Bactrian camels on the Hunder dunes"},
        {"file": "ladakh/diskit-maitreya.jpg", "alt": "The Maitreya Buddha at Diskit"},
        {"file": "ladakh/pangong-afternoon.jpg", "alt": "Late afternoon on Pangong Tso"},
        {"file": "ladakh/thiksey-monastery.jpg", "alt": "Thiksey monastery"},
        {"file": "ladakh/shanti-stupa.jpg", "alt": "Shanti stupa, Leh"},
        {"file": "ladakh/sangam.jpg", "alt": "The Indus meeting the Zanskar at Sangam"},
    ],
    status="live",
    featured=True,
)
