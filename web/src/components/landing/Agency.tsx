export function Agency() {
  return (
    <section className="wrap owner" id="agency">
      <div className="owner-in">
        <div>
          <h2>Run your agency from one screen</h2>
          <p>Add packages, set dates and prices, and watch bookings and payments land. The concierge reads from the same data, so what you publish is what it sells.</p>
          <ul>
            <li>Packages with itineraries, inclusions and date-wise pricing</li>
            <li>Bookings list with payment status straight from Razorpay</li>
            <li>Confirmation emails sent for you</li>
          </ul>
        </div>
        <div className="table" role="table" aria-label="Recent bookings">
          <div className="row head" role="row"><span>Trip</span><span>Traveller</span><span>Dates</span><span>Status</span></div>
          <div className="row" role="row"><span>Goa Coast &amp; Cafés</span><span>Ananya R.</span><span>19–21 Sep</span><span className="pill">Paid</span></div>
          <div className="row" role="row"><span>Kerala backwaters</span><span>Rohit &amp; Meera</span><span>3–6 Oct</span><span className="pill">Paid</span></div>
          <div className="row" role="row"><span>Manali long weekend</span><span>Karan S.</span><span>10–14 Oct</span><span className="pill wait">Awaiting payment</span></div>
          <div className="row" role="row"><span>Jaisalmer desert</span><span>Priya D.</span><span>24–26 Oct</span><span className="pill">Paid</span></div>
        </div>
      </div>
    </section>
  );
}
