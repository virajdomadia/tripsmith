export function Hero() {
  return (
    <section className="wrap hero">
      <div>
        <h1>Tell it where you want to go.<br /><em>It books the rest.</em></h1>
        <p className="lede">Chat with a concierge that knows every package we run — dates, prices, what's included — and books the one that fits your budget.</p>
        <div className="cta">
          <a className="btn btn-sea" href="#">Plan a trip in chat</a>
          <a className="btn btn-ghost" href="#trips">Browse packages</a>
        </div>
        <p className="note">Domestic holidays across India. Pay with UPI, cards or netbanking.</p>
      </div>

      <div className="chat" aria-label="Example conversation with the concierge">
        <div className="chat-top"><span className="dot"></span> Tripsmith concierge</div>
        <div className="chat-body">
          <div className="msg user">3 days in Goa under ₹15k for two, next weekend</div>
          <div className="msg bot">Got it. Beach side or old-town side? And do you want breakfast included?</div>
          <div className="msg user">North Goa, breakfast yes</div>
          <div className="msg bot">Two packages fit. This one leaves the most room in your budget:
            <div className="itin">
              <div className="t">Goa Coast &amp; Cafés · 3 days</div>
              <ol>
                <li>Arrive, check in at Anjuna guesthouse, sunset at Vagator</li>
                <li>Breakfast, Chapora fort, kayak at Baga, night market</li>
                <li>Breakfast, Panjim Latin quarter walk, drop to airport</li>
              </ol>
              <div className="price">2 travellers · 19–21 Sep <span>₹13,400</span></div>
              <a className="book" href="#">Book this trip</a>
            </div>
          </div>
          <div className="msg user">Book it</div>
        </div>
        <div className="chat-input">Ask anything about your trip <span className="send" aria-hidden="true">↑</span></div>
      </div>
    </section>
  );
}
