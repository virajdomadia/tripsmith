from content._schema import define_destination

DESTINATION = define_destination(
    slug="andaman",
    name="Andaman",
    tagline="Radhanagar sands and reefs",
    intro=(
        "Two hours' flight east of Chennai, the Andamans are the beaches India's mainland "
        "does not have: white sand, water you can see your feet in, and reefs a short boat "
        "ride out. Havelock (Swaraj Dweep) has Radhanagar, the beach on every poster; Neil "
        "(Shaheed Dweep) is smaller and slower; Port Blair has the Cellular Jail and the "
        "airport.\n\n"
        "It is an island trip, so everything moves by ferry — 90 minutes Port Blair to "
        "Havelock, an hour on to Neil — and by boat to the reefs. We book the fast "
        "catamarans, not the government ferry, and we build in a spare hour everywhere "
        "because the sea sets the timetable.\n\n"
        "**Best time:** November to April — calm seas, clear water, snorkelling and diving "
        "at their best. May is hot; June to September is monsoon, when ferries get "
        "cancelled and the reefs are murky."
    ),
    cover={
        "file": "andaman/radhanagar-beach.jpg",
        "alt": "Radhanagar beach on Havelock island",
    },
    region="Bay of Bengal",
    best_months=[11, 12, 1, 2, 3, 4],
    position=5,
)
