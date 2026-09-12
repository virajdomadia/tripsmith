export function Header() {
  return (
    <header className="wrap">
      <nav className="nav" aria-label="Main">
        <a className="logo" href="#"><svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#0F4C5C"/><path d="M14 44 C 22 44, 22 26, 32 26 S 42 40, 50 22" fill="none" stroke="#F2E8D5" strokeWidth="4" strokeLinecap="round" strokeDasharray="6 6"/><circle cx="50" cy="22" r="6" fill="#F2A93B"/><circle cx="14" cy="44" r="4" fill="#F2E8D5"/></svg>Tripsmith</a>
        <ul><li><a href="#trips">Trips</a></li><li><a href="#how">How it works</a></li><li><a href="#agency">For agencies</a></li></ul>
        <a className="btn btn-ghost" href="#">Sign in</a>
      </nav>
    </header>
  );
}
