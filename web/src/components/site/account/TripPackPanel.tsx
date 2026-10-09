import {
  BedDouble,
  CalendarDays,
  Download,
  Info,
  Lock,
  LockOpen,
  MapPin,
  Phone,
  ShieldAlert,
  UserRound,
} from 'lucide-react';
import { LeaderAvatar } from '@/components/site/LeaderAvatar';
import { tripPackHref, type PackContent, type TripPack } from '@/lib/account';
import { formatDate, inr, shortDate } from '@/lib/format';

const INSIDE = [
  { icon: MapPin, label: 'Meeting point and time, with a Maps link' },
  { icon: UserRound, label: 'Your trip leader’s phone number' },
  { icon: BedDouble, label: 'Hotel addresses and phones' },
  { icon: CalendarDays, label: 'Day-by-day plan with dates' },
  { icon: Info, label: 'Know before you go: weather, network, cash' },
  { icon: ShieldAlert, label: '24×7 emergency number' },
  { icon: Download, label: 'PDF to keep offline' },
];

const tel = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;
const hhmm = (time: string | null | undefined) => (time ? time.slice(0, 5) : null);

/**
 * P10 (R48): the trip pack inside its coupon — mockup "My trip D". Locked, it says when it
 * opens (7 days before departure, once paid in full) and lists what will be inside; open, it is
 * everything for the road: the meeting point with a Maps link, the trip leader with their phone
 * (shown only here), the hotels, the day-by-day plan, the owner's "Know before you go" notes, the
 * 24×7 number and the PDF.
 */
export function TripPackPanel({
  bookingRef,
  pack,
  owedPaise,
  departs,
}: {
  bookingRef: string;
  pack: TripPack;
  owedPaise: number;
  departs: string;
}) {
  if (pack.state !== 'open' || !pack.content) {
    return (
      <section className="tp-pack locked grid gap-3.5" aria-labelledby="pack-h">
        <div className="flex items-center gap-3.5">
          <span className="tp-lock" aria-hidden>
            <Lock className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="label-caps">Trip pack</span>
            <h3 id="pack-h" className="text-[18px]">
              {pack.state === 'closed'
                ? 'Closed after the trip'
                : `Unlocks ${formatDate(pack.opensOn)}`}
            </h3>
            <p className="text-[14px] text-ink2">
              7 days before departure, once the booking is fully paid.{' '}
              {pack.needsPayment && owedPaise > 0 ? (
                <>
                  <b className="num">{inr(owedPaise)}</b> still to pay.
                </>
              ) : (
                'You’re fully paid, so it opens on the day.'
              )}
            </p>
          </div>
        </div>
        <ul className="tp-inside" aria-label="What will be inside">
          {INSIDE.map(({ icon: Icon, label }) => (
            <li key={label}>
              <Icon className="size-4 shrink-0 text-mute" aria-hidden />
              <span>{label}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  return (
    <section className="tp-pack open grid gap-4" aria-labelledby="pack-h">
      <div className="flex flex-wrap items-center gap-3.5">
        <span className="tp-lock open" aria-hidden>
          <LockOpen className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <span className="label-caps">Trip pack · unlocked {shortDate(pack.opensOn)}</span>
          <h3 id="pack-h" className="text-[18px]">
            Everything for the road
          </h3>
          <p className="text-[14px] text-ink2">Download the PDF — it works offline on the day.</p>
        </div>
        <a
          href={tripPackHref(bookingRef)}
          download
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-btn bg-primary px-4 text-[14px] font-bold text-white no-underline hover:bg-primary-ink"
        >
          <Download className="size-4" aria-hidden /> PDF
        </a>
      </div>
      <PackBody content={pack.content} departs={departs} />
    </section>
  );
}

function PackBody({ content: c, departs }: { content: PackContent; departs: string }) {
  const m = c.meeting;
  return (
    <div className="tp-body grid gap-4">
      <div className="grid gap-2.5 md:grid-cols-[1.2fr_1fr]">
        <div className="tp-box meet">
          <span className="label-caps">Meeting point</span>
          {m ? (
            <>
              <b className="text-[16px]">{m.place}</b>
              <p>
                <span className="num">
                  {formatDate(departs)}
                  {hhmm(m.time) && ` · ${hhmm(m.time)}`}
                </span>
                {m.note && ` · ${m.note}`}
              </p>
              {m.mapsUrl && (
                <a href={m.mapsUrl} target="_blank" rel="noopener noreferrer">
                  <MapPin className="size-4" aria-hidden /> Open in Google Maps
                </a>
              )}
            </>
          ) : (
            <p>We’ll share the meeting point here before you travel.</p>
          )}
        </div>
        <div className="tp-box lead">
          {c.leader && <LeaderAvatar leader={c.leader} size={44} />}
          <div className="grid min-w-0 gap-1">
            <span className="label-caps">Your trip leader</span>
            {c.leader ? (
              <>
                <b className="text-[16px]">{c.leader.name}</b>
                {c.leader.languages.length > 0 && (
                  <p className="text-[12.5px] text-mute">{c.leader.languages.join(', ')}</p>
                )}
                {c.leader.phone && (
                  <a href={tel(c.leader.phone)}>
                    <Phone className="size-4" aria-hidden />
                    <span className="num">{c.leader.phone}</span>
                  </a>
                )}
              </>
            ) : (
              <p className="text-[13.5px] text-ink2">
                Your leader will be confirmed soon — call the 24×7 line meanwhile.
              </p>
            )}
          </div>
        </div>
      </div>

      {c.hotels.length > 0 && (
        <div className="grid gap-2.5 md:grid-cols-2">
          {c.hotels.map((h) => (
            <div key={h.name} className="tp-hotel">
              <BedDouble className="mt-0.5 size-5 shrink-0 text-mute" aria-hidden />
              <div className="grid min-w-0 gap-0.5">
                <b className="text-[14.5px]">
                  {h.name}
                  {h.city && <span className="font-semibold text-mute">, {h.city}</span>}
                </b>
                <small className="text-[12px] font-semibold text-mute">
                  {h.nights} night{h.nights === 1 ? '' : 's'}
                </small>
                {h.address && <p className="text-[13px] text-ink2">{h.address}</p>}
                {h.phone && (
                  <a href={tel(h.phone)}>
                    <Phone className="size-4" aria-hidden />
                    <span className="num">{h.phone}</span>
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {c.days.length > 0 && (
        <ol className="tp-days" aria-label="Day by day">
          {c.days.map((d) => (
            <li key={d.dayNo}>
              <span className="num text-[13px] font-extrabold text-primary">Day {d.dayNo}</span>
              <div className="min-w-0">
                <b className="text-[14.5px]">{d.title}</b>{' '}
                <small className="text-[12.5px] font-semibold text-mute">
                  {formatDate(d.date)}
                </small>
                <p className="text-[13.5px] text-ink2">{d.description}</p>
                <p className="text-[12.5px] text-mute">
                  {d.meals}
                  {d.stay && ` · Stay: ${d.stay}`}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {c.knowBefore.length > 0 && (
        <div>
          <h4 className="text-[16px]">Know before you go</h4>
          <dl className="tp-kbg">
            {c.knowBefore.map((n) => (
              <div key={n.key}>
                <dt>{n.label}</dt>
                <dd>{n.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="tp-sos">
        <ShieldAlert className="size-5 shrink-0" aria-hidden />
        <div>
          <b>
            24×7 emergency ·{' '}
            <a href={`tel:${c.emergencyE164}`} className="num">
              {c.emergencyPhone}
            </a>
          </b>
          <small>
            Answers day and night while you’re on the trip. For police, fire or ambulance dial 112.
          </small>
        </div>
      </div>
    </div>
  );
}
