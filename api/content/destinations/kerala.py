from content._schema import define_destination

DESTINATION = define_destination(
    slug="kerala",
    name="Kerala",
    tagline="Backwaters, tea hills and a slow coast",
    intro=(
        "Kerala is three trips stacked on top of each other. Up in the Western Ghats, Munnar's "
        "tea estates roll away in every direction and the mornings are cold enough for a "
        "jacket. Down on the plain, Alleppey's backwaters are a maze of canals and paddies "
        "best seen from the deck of a houseboat. And along the coast, Fort Kochi's Chinese "
        "fishing nets, Kovalam's lighthouse bay and Varkala's cliff are as different from "
        "each other as they are from the hills.\n\n"
        "Distances are short but the roads are slow — budget four to five hours between "
        "regions, which is why our trips pick two or three places and stay put.\n\n"
        "**Best time:** September to March — the monsoon has cleared, the hills are green and "
        "the coast is dry. April and May are humid; June to August is monsoon (ayurveda "
        "season, half the price, the backwaters at their fullest)."
    ),
    cover={
        "file": "kerala/alleppey-backwaters-2.jpg",
        "alt": "A houseboat on the Alleppey backwaters",
    },
    region="South India",
    best_months=[9, 10, 11, 12, 1, 2, 3],
    position=2,
)
