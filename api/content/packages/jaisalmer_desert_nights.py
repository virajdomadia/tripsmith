import datetime as dt

from content._schema import define_package

PACKAGE = define_package(
    slug="jaisalmer-desert-nights",
    destination="rajasthan",
    name="Jaisalmer Desert Nights",
    summary=(
        "The golden fort, the carved havelis and a night in a Swiss tent at the Sam dunes — "
        "camel ride at sunset, folk music by the fire. Five days from Jodhpur station."
    ),
    themes=["heritage", "adventure"],
    nights=4,
    departure_city="Ex-Jodhpur",
    highlights=[
        "A night in a Swiss tent at the Sam dunes with dinner by the fire",
        "Camel ride to the dune crest for sunset; back for sunrise",
        "Jaisalmer fort — a living fort with 3,000 people still inside",
        "Patwon ki Haveli's five carved sandstone mansions",
        "Kuldhara, the village abandoned overnight in the 1800s",
    ],
    inclusions=[
        "3 nights at Hotel Pleasant Haveli, Jaisalmer, and 1 night in a Swiss tent at Prince "
        "Desert Camp, Sam — breakfast and dinner daily",
        "Private air-conditioned car with driver from Jodhpur station and back, including "
        "the Osian stop",
        "Camel ride at Sam, folk music and dance at the camp",
        "Entry to the fort palace, Patwon ki Haveli, Kuldhara and Bada Bagh",
        "Tripsmith WhatsApp support from booking to return",
    ],
    exclusions=[
        "Trains or flights to Jodhpur — Mumbai, Delhi and Bengaluru have overnight trains; "
        "we can book them at cost",
        "Lunches",
        "Jeep dune-bashing at Sam (about ₹1,500 per jeep, paid at the camp)",
        "Camera fees inside the fort palace",
        "5% GST on the package price",
    ],
    hotels=[
        {"name": "Hotel Pleasant Haveli", "city": "Jaisalmer", "stars": 3, "nights": 3},
        {"name": "Prince Desert Camp", "city": "Sam", "stars": 3, "nights": 1},
    ],
    faq=[
        {
            "q": "What is the desert camp like?",
            "a": "Swiss tents with a proper bed, an attached bathroom with running water, "
            "and electricity till midnight. Dinner is a buffet by the fire with folk "
            "musicians. It gets cold — 5 °C in December and January — so bring a jacket; "
            "the camp has blankets.",
        },
        {
            "q": "Why not stay inside the fort?",
            "a": "Jaisalmer fort is sinking under the weight of its plumbing, and the "
            "conservation bodies ask visitors not to sleep inside it. Our haveli is five "
            "minutes' walk from the gate with the fort filling its rooftop view.",
        },
        {
            "q": "Is the camel ride long?",
            "a": "About 40 minutes each way to the crest of the dunes at a walk. Anyone "
            "who would rather not ride can go by jeep for the same sunset.",
        },
    ],
    itinerary=[
        {
            "title": "Jodhpur to Jaisalmer via Osian, Gadisar at sunset",
            "description": (
                "Pick-up at Jodhpur station at 8 am (the overnight trains from Mumbai and "
                "Delhi arrive around 7). An hour at Osian's 8th-century temples, lunch on "
                "the way, Jaisalmer by 2 pm. Check in, then Gadisar lake's chhatris at "
                "sunset and dinner on the haveli's rooftop with the fort lit up."
            ),
            "meals": "D",
            "stay": "Hotel Pleasant Haveli, Jaisalmer",
            "location_name": "Jaisalmer",
        },
        {
            "title": "Inside the fort, the havelis, sunset at Vyas chhatri",
            "description": (
                "A morning inside the fort: the Raj Mahal, the Jain temples' carved "
                "ceilings, the lanes where people still live. After lunch the merchants' "
                "havelis — Patwon ki Haveli's five mansions, Nathmal ki Haveli's two "
                "unmatched halves. Sunset from the Vyas chhatri cenotaphs looking back at "
                "the fort; dinner at the haveli."
            ),
            "meals": "BD",
            "stay": "Hotel Pleasant Haveli, Jaisalmer",
            "location_name": "Jaisalmer fort",
        },
        {
            "title": "Kuldhara, Bada Bagh, camels to the Sam dunes",
            "description": (
                "Kuldhara's abandoned village and the royal cenotaphs of Bada Bagh in the "
                "morning, then 45 km west to Sam. Camels at 4 pm to the top of the dunes "
                "for sunset; back at the camp, folk music, a fire and dinner under more "
                "stars than you have seen in a while. Night in a Swiss tent."
            ),
            "meals": "BD",
            "stay": "Prince Desert Camp, Sam",
            "location_name": "Sam dunes",
        },
        {
            "title": "Dune sunrise, free afternoon in Jaisalmer",
            "description": (
                "Sunrise from the dunes, breakfast at the camp, back to Jaisalmer by "
                "11. The afternoon is yours — the Desert Culture Centre, the puppet show, "
                "or a nap. Dinner at a rooftop restaurant facing the fort."
            ),
            "meals": "BD",
            "stay": "Hotel Pleasant Haveli, Jaisalmer",
            "location_name": "Jaisalmer",
        },
        {
            "title": "Back to Jodhpur",
            "description": (
                "Leave at 9 am, Jodhpur station or airport by 2 pm — in time for the "
                "afternoon flights and evening trains. Ask us to add a Jodhpur night if you "
                "want Mehrangarh too."
            ),
            "meals": "B",
            "location_name": "Jodhpur",
        },
    ],
    departures=[
        {
            "date": dt.date(2026, 12, 12),
            "seats_total": 12,
            "guaranteed": True,
            "price_double_inr": 21_999,
            "price_triple_inr": 19_999,
            "price_child_inr": 12_499,
            "single_supplement_inr": 7_000,
        },
        {
            "date": dt.date(2027, 1, 9),
            "seats_total": 12,
            "price_double_inr": 19_499,
            "price_triple_inr": 17_999,
            "price_child_inr": 10_999,
            "single_supplement_inr": 6_500,
        },
        {
            "date": dt.date(2027, 2, 6),
            "seats_total": 12,
            "guaranteed": True,
            "price_double_inr": 19_499,
            "price_triple_inr": 17_999,
            "price_child_inr": 10_999,
            "single_supplement_inr": 6_500,
        },
        {
            "date": dt.date(2027, 3, 6),
            "seats_total": 12,
            "price_double_inr": 19_999,
            "price_triple_inr": 18_499,
            "price_child_inr": 11_499,
            "single_supplement_inr": 6_500,
        },
    ],
    photos=[
        {"file": "rajasthan/sam-dunes-camel.jpg", "alt": "A camel on the Sam sand dunes"},
        {"file": "rajasthan/jaisalmer-fort.jpg", "alt": "The battlements of Jaisalmer fort"},
        {"file": "rajasthan/camel-safari-sunset.jpg", "alt": "Camel safari at sunset in the Thar"},
        {"file": "rajasthan/patwon-ki-haveli.jpg", "alt": "The carved facade of Patwon ki Haveli"},
        {"file": "rajasthan/gadisar-lake.jpg", "alt": "Chhatris on Gadisar lake, Jaisalmer"},
        {"file": "rajasthan/jaisalmer-fort-night.jpg", "alt": "Jaisalmer fort lit up at night"},
    ],
    status="live",
    featured=False,
)
