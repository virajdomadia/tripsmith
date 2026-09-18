import datetime as dt

from content._schema import define_package

PACKAGE = define_package(
    slug="jaipur-jodhpur-udaipur",
    destination="rajasthan",
    name="Jaipur · Jodhpur · Udaipur",
    summary=(
        "Three royal cities in six days — Amber by jeep, Mehrangarh at dusk, a boat on "
        "Pichola — sleeping in havelis with courtyards, not chain hotels. Starts Jaipur, "
        "ends Udaipur."
    ),
    themes=["heritage", "family"],
    nights=5,
    departure_city="Ex-Jaipur",
    highlights=[
        "Amber fort by jeep and the mirror-work Sheesh Mahal before the crowds",
        "Mehrangarh at golden hour, then the blue city from its ramparts",
        "Ranakpur's 1,444-pillar Jain temple on the road to Udaipur",
        "Sunset boat on Lake Pichola past the Lake Palace",
        "Heritage havelis in all three cities, every one we have slept in",
    ],
    inclusions=[
        "2 nights at Umaid Bhawan heritage hotel, Jaipur; 1 night at Ratan Vilas, Jodhpur; "
        "2 nights at Jagat Niwas Palace, Udaipur — breakfast and dinner daily",
        "Private air-conditioned car with driver from Jaipur station or airport to Udaipur "
        "airport, all road tolls and parking",
        "Jeep ride up to Amber fort; shared boat on Lake Pichola",
        "Monument entry: Amber, City Palace Jaipur, Jantar Mantar, Mehrangarh, Ranakpur, "
        "City Palace Udaipur",
        "Tripsmith WhatsApp support from booking to return",
    ],
    exclusions=[
        "Trains or flights to Jaipur and from Udaipur — we can book them at cost",
        "Lunches",
        "Guides inside monuments (about ₹500–800 per site, arranged on the spot if you want one)",
        "Camera fees where charged",
        "5% GST on the package price",
    ],
    hotels=[
        {"name": "Umaid Bhawan Heritage Hotel", "city": "Jaipur", "stars": 3, "nights": 2},
        {"name": "Ratan Vilas", "city": "Jodhpur", "stars": 3, "nights": 1},
        {"name": "Jagat Niwas Palace", "city": "Udaipur", "stars": 3, "nights": 2},
    ],
    faq=[
        {
            "q": "How long are the drives?",
            "a": "Jaipur to Jodhpur is about six hours with a stop at Pushkar; Jodhpur to "
            "Udaipur about five with an hour at Ranakpur. Both are good roads and the car "
            "is yours, so we stop when you want.",
        },
        {
            "q": "Is this all right for older parents?",
            "a": "Yes — it is the trip most of our families do with three generations. The "
            "jeep does the Amber climb, Mehrangarh has a lift, and there is one drive a "
            "day at most. Tell us about knees and we will plan the walks around them.",
        },
        {
            "q": "Can we start in Delhi instead?",
            "a": "Yes. Delhi to Jaipur is a four-hour train (or five by road, about ₹4,000 "
            "extra for the car). Tell us at booking and we will time the pick-up.",
        },
    ],
    itinerary=[
        {
            "title": "Arrive Jaipur, Hawa Mahal at dusk",
            "description": (
                "Pick-up from Jaipur station or airport any time before 3 pm. Check in to "
                "the haveli, then the pink-city walk: Hawa Mahal from the street as the "
                "light goes orange, the Johari bazaar's silver lanes, and dinner on the "
                "haveli's rooftop."
            ),
            "meals": "D",
            "stay": "Umaid Bhawan, Jaipur",
            "location_name": "Jaipur",
        },
        {
            "title": "Amber by jeep, City Palace, Jantar Mantar",
            "description": (
                "Out to Amber at 8 am to beat the coaches: a jeep up the ramp, the Sheesh "
                "Mahal's mirror ceiling, the view over Maota lake. Back past Jal Mahal for "
                "the City Palace and the giant stone instruments of Jantar Mantar. Late "
                "afternoon free for the bazaars; dinner at the haveli."
            ),
            "meals": "BD",
            "stay": "Umaid Bhawan, Jaipur",
            "location_name": "Amber",
        },
        {
            "title": "Via Pushkar to Jodhpur, Mehrangarh at golden hour",
            "description": (
                "Leave at 8 am; an hour at Pushkar's ghats and Brahma temple, lunch on the "
                "way, Jodhpur by 3 pm. Straight up to Mehrangarh for the last two hours of "
                "light — the palace rooms, the ramparts, the blue city below — and Jaswant "
                "Thada on the way down. Dinner at Ratan Vilas."
            ),
            "meals": "BD",
            "stay": "Ratan Vilas, Jodhpur",
            "location_name": "Jodhpur",
        },
        {
            "title": "Blue-city walk, Ranakpur, on to Udaipur",
            "description": (
                "A morning walk through the blue lanes below the fort and the clock-tower "
                "spice market. Leave by 11; an hour inside the marble Jain temple at "
                "Ranakpur, then the Aravalli road to Udaipur by 5 pm. Check in at Jagat "
                "Niwas, whose terrace looks straight across Pichola."
            ),
            "meals": "BD",
            "stay": "Jagat Niwas Palace, Udaipur",
            "location_name": "Ranakpur",
        },
        {
            "title": "City Palace and a sunset boat on Pichola",
            "description": (
                "City Palace's courtyards and peacock mosaics in the morning, Jagdish "
                "temple next door, Saheliyon ki Bari after lunch. At 5 pm the boat: past "
                "the Lake Palace to Jag Mandir as the palaces turn gold. Dinner at the "
                "haveli's lake-side restaurant."
            ),
            "meals": "BD",
            "stay": "Jagat Niwas Palace, Udaipur",
            "location_name": "Udaipur",
        },
        {
            "title": "Free morning, depart Udaipur",
            "description": (
                "Bagore ki Haveli or the old-city shops before checkout. Drop at Udaipur "
                "airport or station any time up to 6 pm."
            ),
            "meals": "B",
            "location_name": "Udaipur",
        },
    ],
    departures=[
        {
            "date": dt.date(2026, 11, 28),
            "seats_total": 16,
            "guaranteed": True,
            "price_double_inr": 27_999,
            "price_triple_inr": 25_999,
            "price_child_inr": 15_999,
            "single_supplement_inr": 9_500,
        },
        {
            "date": dt.date(2026, 12, 26),
            "seats_total": 16,
            "price_double_inr": 29_999,
            "price_triple_inr": 27_499,
            "price_child_inr": 16_999,
            "single_supplement_inr": 10_500,
        },
        {
            "date": dt.date(2027, 1, 23),
            "seats_total": 16,
            "guaranteed": True,
            "price_double_inr": 26_499,
            "price_triple_inr": 24_499,
            "price_child_inr": 14_999,
            "single_supplement_inr": 9_000,
        },
        {
            "date": dt.date(2027, 2, 20),
            "seats_total": 16,
            "price_double_inr": 26_499,
            "price_triple_inr": 24_499,
            "price_child_inr": 14_999,
            "single_supplement_inr": 9_000,
        },
    ],
    photos=[
        {"file": "rajasthan/amber-fort-lake.jpg", "alt": "Amber fort above Maota lake"},
        {"file": "rajasthan/mehrangarh-fort.jpg", "alt": "Mehrangarh fort on its cliff, Jodhpur"},
        {"file": "rajasthan/udaipur-lake-palace.jpg", "alt": "The Lake Palace on Pichola, Udaipur"},
        {"file": "rajasthan/hawa-mahal.jpg", "alt": "The east facade of Hawa Mahal, Jaipur"},
        {"file": "rajasthan/amber-sheesh-mahal.jpg", "alt": "Mirror work in Amber's Sheesh Mahal"},
        {"file": "rajasthan/jodhpur-blue-city.jpg", "alt": "Jodhpur's blue houses from the fort"},
        {"file": "rajasthan/pichola-sunset.jpg", "alt": "Lake Pichola at sunset"},
        {"file": "rajasthan/jaipur-city-palace.jpg", "alt": "Chandra Mahal, City Palace, Jaipur"},
    ],
    status="live",
    featured=True,
)
