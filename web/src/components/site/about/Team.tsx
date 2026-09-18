const TEAM = [
  ['Rohan Kulkarni', 'Founder · Goa & Kerala'],
  ['Anita Menon', 'Operations · Himachal & Ladakh'],
  ['Vikram Desai', 'Rajasthan & Andaman'],
  ['Sneha Nair', 'Bookings & your callback'],
] as const;

const initials = (name: string) =>
  name
    .split(' ')
    .map((w) => w[0])
    .join('');

/** S8 team row: initials in a primary-soft circle, name, what they run. */
export function Team() {
  return (
    <ul className="grid grid-cols-2 gap-4 text-center lg:grid-cols-4">
      {TEAM.map(([name, role]) => (
        <li key={name}>
          <span
            aria-hidden
            className="mx-auto mb-2.5 grid size-24 place-items-center rounded-full bg-primary-soft text-[26px] font-extrabold text-primary"
          >
            {initials(name)}
          </span>
          <b className="block">{name}</b>
          <small className="text-sm text-mute">{role}</small>
        </li>
      ))}
    </ul>
  );
}
