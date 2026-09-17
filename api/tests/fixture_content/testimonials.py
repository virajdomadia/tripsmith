from content._schema import TestimonialContent

TESTIMONIALS = [
    TestimonialContent(
        name="Priya and Rohan Mehta",
        city="Pune",
        text=(
            "We gave Tripsmith our dates and budget on a Tuesday and were on the beach at "
            "Palolem the next Friday. The cottage was exactly as photographed and the "
            "Dudhsagar day was the highlight of the year."
        ),
        rating=5,
        package="goa-quiet-escape",
        position=1,
    ),
    TestimonialContent(
        name="Anand Kulkarni",
        city="Mumbai",
        text=(
            "Took my parents and two kids. The driver knew every shortcut, the resort pool "
            "kept the children busy, and the Chapora sunset had all three generations "
            "quiet for once. Zero stress."
        ),
        rating=5,
        package="north-goa-beaches",
        position=2,
    ),
    TestimonialContent(
        name="Sneha Iyer",
        city="Bengaluru",
        text=(
            "Honest pricing — what the site said is what we paid. Replies on WhatsApp came "
            "within minutes, even on a Sunday night when our train was delayed."
        ),
        rating=4,
        package=None,
        position=3,
    ),
]
