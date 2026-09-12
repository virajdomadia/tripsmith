export function Trips() {
  return (
    <section className="wrap dest" id="trips">
      <h2>Twelve packages. All real, all bookable.</h2>
      <p className="sub">The concierge only suggests trips from this list — no invented hotels, no surprise prices at checkout.</p>
      <div className="grid">
        <a className="card" href="#"><span className="bg g1"></span><span className="tag">Most booked</span><h3>Goa</h3><div className="meta"><span>3 days</span><span>from ₹6,700 pp</span></div></a>
        <a className="card" href="#"><span className="bg g2"></span><h3>Kerala backwaters</h3><div className="meta"><span>4 days</span><span>from ₹11,200 pp</span></div></a>
        <a className="card" href="#"><span className="bg g3"></span><h3>Manali</h3><div className="meta"><span>5 days</span><span>from ₹9,800 pp</span></div></a>
        <a className="card" href="#"><span className="bg g4"></span><h3>Jaisalmer</h3><div className="meta"><span>3 days</span><span>from ₹8,400 pp</span></div></a>
      </div>
    </section>
  );
}
