"""The trip pack's seed content (R48, P10), by package slug: where day one starts, the owner's
"Know before you go" notes, and an area-level address per hotel (by hotel name).

The hotels are real places, so their addresses stay at the level of the area and their phone is
the site's demo number (`HOTEL_PHONE`) — never a real hotel's line. Meeting points are public
places (airports, stations, a bus stand) with a Google Maps search link.
"""

import datetime as dt

from content._schema import KnowBeforeContent, MeetingContent, TripPackContent

HOTEL_PHONE = "+91 98450 12345"


def _t(hh: int, mm: int = 0) -> dt.time:
    return dt.time(hh, mm)


TRIP_PACKS: dict[str, TripPackContent] = {
    "munnar-alleppey-houseboat": TripPackContent(
        meeting=MeetingContent(
            place="Cochin International Airport, Arrivals Gate 3 (T1)",
            time=_t(11),
            note="Look for the blue Tripsmith board",
        ),
        know_before=KnowBeforeContent(
            weather="14–24 °C in Munnar, 30 °C and humid in Alleppey. Evenings are cool up the "
            "hill.",
            network="Jio and Airtel work in Munnar town; patchy on the backwaters.",
            cash="Carry ₹3,000 in small notes. Tea stalls and the boat crew take cash only.",
            rules="Eravikulam is plastic-free. Quiet hours on the houseboat after 22:00.",
            packing="Walking shoes, a light jacket, sunscreen, a small torch, printed IDs.",
        ),
        hotels={
            "Tea Valley Resort": "Pothamedu, Munnar, Kerala 685612",
            "Spice Routes houseboat": "Finishing Point jetty, Punnamada, Alappuzha, Kerala 688013",
            "Fort House": "Calvathy Road, Fort Kochi, Kerala 682001",
        },
    ),
    "kochi-thekkady-kovalam": TripPackContent(
        meeting=MeetingContent(
            place="Cochin International Airport, Arrivals Gate 3 (T1)",
            time=_t(10, 30),
            note="The coach waits in the tourist-vehicle bay",
        ),
        know_before=KnowBeforeContent(
            weather="Warm and humid on the coast (28–33 °C); Thekkady is cooler, around 20 °C at "
            "night.",
            network="Good in Fort Kochi and Kovalam; weak inside the Periyar reserve.",
            cash="₹2,000 in small notes for spice-garden tips and auto-rickshaws.",
            rules="Periyar's boat ride asks for ID — carry the one on your booking. No plastic in "
            "the reserve.",
            packing="Cotton clothes, a light rain layer, closed shoes for the forest walk, "
            "swimwear.",
        ),
        hotels={
            "Fort House": "Calvathy Road, Fort Kochi, Kerala 682001",
            "Elephant Court": "Thekkady–Kumily Road, Kumily, Kerala 685536",
            "Uday Samudra Leisure Beach Hotel": "Samudra Beach, Kovalam, Kerala 695527",
        },
    ),
    "goa-quiet-escape": TripPackContent(
        meeting=MeetingContent(
            place="Dabolim Airport (GOI), Arrivals exit",
            time=_t(12),
            note="Or Madgaon station by 13:00 — tell us which in WhatsApp",
        ),
        know_before=KnowBeforeContent(
            weather="30–33 °C by day, a breeze in the evening. Strong sun from 11 to 3.",
            network="Jio and Airtel are fine in Palolem; the cottage has Wi-Fi.",
            cash="Shacks take UPI, but carry ₹2,000 for scooters and the boat to Butterfly beach.",
            rules="Swim between the flags. No glass bottles on the beach.",
            packing="Swimwear, sandals, a hat, reef-safe sunscreen, a light shirt for the "
            "evenings.",
        ),
        hotels={"Art Resort Goa": "Ourem Road, Palolem, Canacona, Goa 403702"},
    ),
    "north-goa-beaches": TripPackContent(
        meeting=MeetingContent(
            place="Dabolim Airport (GOI), Arrivals exit",
            time=_t(12),
            note="Madgaon or Thivim station also work — tell us which in WhatsApp",
        ),
        know_before=KnowBeforeContent(
            weather="30–33 °C and humid; evenings by the sea are pleasant.",
            network="Strong across Candolim and Calangute.",
            cash="UPI almost everywhere; ₹1,500 in cash for shacks and taxis.",
            rules="Swim between the lifeguard flags. Drinking on the beach is fined.",
            packing="Swimwear, sandals, sunscreen, a hat, a dry bag for the boat trip.",
        ),
        hotels={
            "Lemon Tree Amarante Beach Resort": "Fort Aguada Road, Candolim, Goa 403515",
        },
    ),
    "old-goa-weekend": TripPackContent(
        meeting=MeetingContent(
            place="Panjim Kadamba Bus Stand, main gate",
            time=_t(14),
            note="Station and airport pick-ups by arrangement",
        ),
        know_before=KnowBeforeContent(
            weather="28–32 °C; the churches are cool inside.",
            network="Good across Panjim and Old Goa.",
            cash="₹1,000 in small notes for feni tasting and the ferry.",
            rules="Cover shoulders and knees in the churches. Quiet in the Basilica.",
            packing="Comfortable walking shoes, a scarf for the churches, a water bottle.",
        ),
        hotels={"Hotel Mandovi Heritage": "D. B. Marg, Panjim, Goa 403001"},
    ),
    "havelock-honeymoon": TripPackContent(
        meeting=MeetingContent(
            place="Veer Savarkar International Airport, Port Blair — Arrivals",
            time=_t(11),
            note="The 2 pm catamaran leaves from Haddo jetty",
        ),
        know_before=KnowBeforeContent(
            weather="27–31 °C and humid; short showers any time of year.",
            network="Airtel and BSNL only on Havelock, and slow. Download the pack before you fly.",
            cash="ATMs on Havelock run dry — carry ₹5,000 in cash.",
            rules="Don't touch or stand on coral. No shells or sand off the islands.",
            packing="Swimwear, reef-safe sunscreen, a dry bag, mosquito repellent, printed IDs "
            "for the ferry.",
        ),
        hotels={"Barefoot at Havelock": "Beach No. 7, Radhanagar, Swaraj Dweep 744211"},
    ),
    "port-blair-havelock-neil": TripPackContent(
        meeting=MeetingContent(
            place="Veer Savarkar International Airport, Port Blair — Arrivals",
            time=_t(11),
            note="Look for the blue Tripsmith board",
        ),
        know_before=KnowBeforeContent(
            weather="27–31 °C and humid; the sea is calmest from December to April.",
            network="Usable in Port Blair; slow on Havelock and Neil.",
            cash="Carry ₹5,000 — island ATMs often run out.",
            rules="Ferries need the ID on your booking. Don't touch the coral.",
            packing="Swimwear, reef-safe sunscreen, a dry bag, sandals, a light rain layer.",
        ),
        hotels={
            "Sea Shell": "Marine Hill, Port Blair 744101",
            "Symphony Palms Beach Resort": "Beach No. 5, Swaraj Dweep (Havelock) 744211",
            "Summer Sands Beach Resort": "Beach No. 1, Shaheed Dweep (Neil) 744104",
        },
    ),
    "jaipur-jodhpur-udaipur": TripPackContent(
        meeting=MeetingContent(
            place="Jaipur Junction railway station, main entrance",
            time=_t(14),
            note="Airport pick-ups before 15:00 by arrangement",
        ),
        know_before=KnowBeforeContent(
            weather="Days 25–32 °C, nights down to 10 °C in winter. Dry air.",
            network="Strong in all three cities.",
            cash="₹3,000 for bazaars, tips and auto-rickshaws; most shops take UPI.",
            rules="Shoes off in temples. Ask before photographing people.",
            packing="A warm layer for the evenings, sunglasses, a scarf, comfortable shoes.",
        ),
        hotels={
            "Umaid Bhawan Heritage Hotel": "Bani Park, Jaipur, Rajasthan 302016",
            "Ratan Vilas": "Loco Shed Road, Ratanada, Jodhpur, Rajasthan 342001",
            "Jagat Niwas Palace": "Lal Ghat, Udaipur, Rajasthan 313001",
        },
    ),
    "jaisalmer-desert-nights": TripPackContent(
        meeting=MeetingContent(
            place="Jodhpur Junction railway station, platform 1 exit",
            time=_t(8),
            note="The overnight trains from Mumbai and Delhi arrive around 7",
        ),
        know_before=KnowBeforeContent(
            weather="Hot days (28–34 °C), cold desert nights down to 8 °C.",
            network="Fine in Jaisalmer; little or none at the Sam dunes camp.",
            cash="₹3,000 in small notes — the camp and camel men take cash.",
            rules="Leave nothing on the dunes. Camel rides are short and on our operator only.",
            packing="A warm jacket for the night, a scarf against sand, sunglasses, a torch.",
        ),
        hotels={
            "Hotel Pleasant Haveli": "Near Gandhi Chowk, Jaisalmer, Rajasthan 345001",
            "Prince Desert Camp": "Sam Sand Dunes, Jaisalmer, Rajasthan 345001",
        },
    ),
    "kasol-weekend-camp": TripPackContent(
        meeting=MeetingContent(
            place="Majnu Ka Tilla Volvo stand, New Delhi",
            time=_t(19, 30),
            note="The overnight Volvo leaves at 20:00 — be there by 19:30",
        ),
        know_before=KnowBeforeContent(
            weather="Days 15–22 °C, nights near 5 °C by the river.",
            network="Jio works in Kasol; none at the camp after dark.",
            cash="Carry ₹2,000 — the one Kasol ATM is often empty.",
            rules="No swimming in the Parvati — the current is fast and cold. Keep the camp "
            "quiet after 22:00.",
            packing="A warm jacket, a beanie, trekking shoes, a headlamp, a power bank.",
        ),
        hotels={"Parvati Riverside Camp": "Riverside, Kasol, Kullu, Himachal Pradesh 175105"},
    ),
    "manali-kasol-tosh": TripPackContent(
        meeting=MeetingContent(
            place="Majnu Ka Tilla Volvo stand, New Delhi",
            time=_t(17, 30),
            note="The overnight Volvo leaves at 18:00",
        ),
        know_before=KnowBeforeContent(
            weather="Manali 10–20 °C; Tosh can drop below 0 °C at night.",
            network="Good in Manali, patchy in Kasol, almost none in Tosh.",
            cash="Carry ₹4,000 — no ATM in Tosh, and Kasol's runs dry.",
            rules="Stay on marked trails above Tosh. Carry your litter back down.",
            packing="Layers, a down jacket, trekking shoes, a headlamp, a reusable bottle.",
        ),
        hotels={
            "Johnson Lodge": "Circuit House Road, Manali, Himachal Pradesh 175131",
            "Parvati Kuteer": "Kasol, Kullu, Himachal Pradesh 175105",
            "Hill Top guesthouse": "Upper Tosh, Kullu, Himachal Pradesh 175105",
        },
    ),
    "shimla-manali-classic": TripPackContent(
        meeting=MeetingContent(
            place="Kashmere Gate ISBT, New Delhi — gate 1",
            time=_t(5, 30),
            note="The coach leaves at 6:00 sharp",
        ),
        know_before=KnowBeforeContent(
            weather="Shimla 8–18 °C, Manali 5–15 °C; snow likely from December to February.",
            network="Strong in Shimla and Manali towns.",
            cash="₹3,000 for Solang activities and Mall Road; UPI works in most shops.",
            rules="Vehicles are not allowed on the Ridge. Rohtang needs a permit — we arrange it.",
            packing="A warm jacket, gloves, waterproof shoes in winter, sunglasses for the snow.",
        ),
        hotels={
            "Hotel Willow Banks": "The Mall, Shimla, Himachal Pradesh 171001",
            "Snow Valley Resorts": "Log Huts Area, Manali, Himachal Pradesh 175131",
        },
    ),
    "leh-nubra-pangong": TripPackContent(
        meeting=MeetingContent(
            place="Kushok Bakula Rimpochee Airport, Leh — Arrivals",
            time=_t(8),
            note="Morning flights only — rest is the whole of day one",
        ),
        know_before=KnowBeforeContent(
            weather="15–25 °C by day, near 0 °C at night at Pangong. The sun is strong.",
            network="Only postpaid SIMs from other states work in Ladakh. None at Pangong.",
            cash="Carry ₹6,000 — ATMs only in Leh.",
            rules="Rest on day one: altitude sickness is real. Permits for Nubra and Pangong are "
            "ours to arrange; carry the ID on your booking.",
            packing="A down jacket, sunscreen SPF 50, lip balm, sunglasses, a water bottle.",
        ),
        hotels={
            "Hotel Omasila": "Changspa, Leh, Ladakh 194101",
            "Hunder Sarai": "Hunder, Nubra Valley, Ladakh 194401",
            "Pangong Sarai": "Spangmik, Pangong, Ladakh 194101",
        },
    ),
    "leh-turtuk": TripPackContent(
        meeting=MeetingContent(
            place="Kushok Bakula Rimpochee Airport, Leh — Arrivals",
            time=_t(8),
            note="Morning flights only — day one is for rest",
        ),
        know_before=KnowBeforeContent(
            weather="15–25 °C by day, cold nights. Turtuk is warmer and lower than Leh.",
            network="Only postpaid SIMs from other states work. Weak in Turtuk.",
            cash="Carry ₹6,000 — ATMs only in Leh.",
            rules="Rest on day one. Turtuk is a village — dress modestly, ask before photographs.",
            packing="Warm layers, sunscreen SPF 50, sunglasses, lip balm, a reusable bottle.",
        ),
        hotels={
            "Hotel Omasila": "Changspa, Leh, Ladakh 194101",
            "Turtuk Holiday Resort": "Turtuk, Nubra Valley, Ladakh 194401",
            "Hunder Sarai": "Hunder, Nubra Valley, Ladakh 194401",
        },
    ),
}
