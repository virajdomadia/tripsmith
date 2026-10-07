'use client';

import { Check, Info, Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { control } from '@/components/site/enquiry/Field';
import {
  fieldsLeft,
  FOODS,
  foodLabel,
  ID_TYPES,
  idTypeLabel,
  saveTravellerDetails,
  type DetailField,
  type TravellerDetailsBlock,
  type TravellerDetailsInput,
  type TravellerDetailsOut,
} from '@/lib/account';
import { OCCUPANCY_LABEL } from '@/lib/booking';
import { formatDate } from '@/lib/format';

/**
 * P9 (R49): a card per traveller on the booking page — mockup "My trip D". A complete card
 * shows its details (the ID only ever masked); an incomplete one opens as a form. The lead
 * booker fills everyone in until the lock, 3 days before departure. A partial save is fine:
 * the badge says what's left.
 */
export function TravellerDetails({
  bookingRef,
  block,
}: {
  bookingRef: string;
  block: TravellerDetailsBlock;
}) {
  const open = block.state === 'open';
  return (
    <div className="grid gap-3">
      <p className="text-[14px] text-ink2">
        {open ? (
          <>
            As lead booker you can fill everyone in. Details lock on{' '}
            <b className="text-ink">{formatDate(block.locksOn)}</b>, 3 days before departure.
          </>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <Lock className="size-4" aria-hidden /> Locked since {formatDate(block.locksOn)} —
            WhatsApp us to change anything.
          </span>
        )}
      </p>
      <div className="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
        {block.travellers.map((t, i) => (
          <TravellerCard
            key={t.travellerId}
            bookingRef={bookingRef}
            traveller={t}
            lead={i === 0}
            required={block.required}
            editable={open}
          />
        ))}
      </div>
      <p className="flex items-start gap-2.5 rounded-btn bg-bg2 p-3 text-[13px] text-ink2">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span>
          <b className="text-ink">Demo site: use made-up ID numbers only.</b> IDs show masked
          everywhere — only the trip leader’s printed manifest has them in full — and we delete
          every detail 30 days after you’re back.
        </span>
      </p>
    </div>
  );
}

function Monogram({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  return (
    <span
      aria-hidden
      className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-[14px] font-extrabold text-primary-ink"
    >
      {initials}
    </span>
  );
}

function role(t: TravellerDetailsOut, lead: boolean) {
  const parts = [lead ? 'Lead booker' : null, OCCUPANCY_LABEL[t.occupancy], t.age ?? null];
  return parts.filter((p) => p !== null).join(' · ');
}

function TravellerCard({
  bookingRef,
  traveller: t,
  lead,
  required,
  editable,
}: {
  bookingRef: string;
  traveller: TravellerDetailsOut;
  lead: boolean;
  required: DetailField[];
  editable: boolean;
}) {
  const [editing, setEditing] = useState(editable && !t.complete);
  const first = t.name.split(' ')[0];
  return (
    <article
      className={`grid content-start gap-3 rounded-[16px] border bg-bg p-3.5 ${
        editing
          ? 'border-[1.5px] border-action shadow-[0_16px_30px_-24px_rgb(217_143_31/0.8)]'
          : 'border-line'
      }`}
      aria-label={`${t.name}’s details`}
    >
      <header className="flex items-center gap-2.5">
        <Monogram name={t.name} />
        <div className="min-w-0 flex-1">
          <b className="block truncate text-[15.5px]">{t.name}</b>
          <small className="text-[12.5px] font-semibold text-mute">{role(t, lead)}</small>
        </div>
        {t.complete ? (
          <span className="inline-flex items-center gap-1 rounded-chip bg-ok-soft px-2.5 py-0.5 text-[12px] font-bold text-ok">
            <Check className="size-3.5" aria-hidden /> Complete
          </span>
        ) : (
          <span className="rounded-chip bg-warn-soft px-2.5 py-0.5 text-[12px] font-bold text-warn">
            {fieldsLeft(t.missing.length)}
          </span>
        )}
      </header>
      {editing ? (
        <DetailsForm
          bookingRef={bookingRef}
          traveller={t}
          required={required}
          onDone={() => setEditing(false)}
          onCancel={
            t.complete || t.missing.length < required.length ? () => setEditing(false) : null
          }
        />
      ) : (
        <>
          <Summary t={t} required={required} />
          {editable && (
            <footer>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-btn border-[1.5px] border-line px-3.5 py-2 text-[13px] font-bold transition-colors hover:border-ink"
              >
                {lead ? 'Edit my details' : `Edit ${first}’s details`}
              </button>
            </footer>
          )}
        </>
      )}
    </article>
  );
}

function Summary({ t, required }: { t: TravellerDetailsOut; required: DetailField[] }) {
  const none = <span className="font-medium text-mute">Not given</span>;
  const need = (f: DetailField) =>
    required.includes(f) ? <span className="font-bold text-warn">Needed</span> : none;
  const emergency = t.emergencyName
    ? `${t.emergencyName}${t.emergencyRelation ? ` (${t.emergencyRelation})` : ''} · +91 ${t.emergencyPhone}`
    : null;
  const food = t.food
    ? `${foodLabel(t.food)}${t.allergies ? ` · allergies: ${t.allergies}` : ''}`
    : null;
  return (
    <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-2">
      <Row k="ID">
        {t.idType ? (
          <>
            {idTypeLabel(t.idType)} · <span className="num tracking-wide">{t.idMasked}</span>
          </>
        ) : (
          need('id')
        )}
      </Row>
      <Row k="Date of birth">{t.dob ? formatDate(t.dob) : need('dob')}</Row>
      <Row k="Emergency contact" wide>
        {emergency ?? need('emergency')}
      </Row>
      <Row k="Food">{food ?? need('food')}</Row>
      <Row k="Medical notes">{t.medical ?? need('medical')}</Row>
    </dl>
  );
}

function Row({ k, wide, children }: { k: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={wide ? 'col-span-2' : 'min-w-0'}>
      <dt className="label-caps text-[10.5px]">{k}</dt>
      <dd className="m-0 text-[13.5px] font-semibold [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

type Draft = {
  name: string;
  idType: string;
  idNumber: string;
  dob: string;
  emergencyName: string;
  emergencyRelation: string;
  emergencyPhone: string;
  food: string;
  allergies: string;
  medical: string;
};

const draftOf = (t: TravellerDetailsOut): Draft => ({
  name: t.name,
  idType: t.idType ?? 'aadhaar',
  idNumber: '',
  dob: t.dob ?? '',
  emergencyName: t.emergencyName ?? '',
  emergencyRelation: t.emergencyRelation ?? '',
  emergencyPhone: t.emergencyPhone ?? '',
  food: t.food ?? '',
  allergies: t.allergies ?? '',
  medical: t.medical ?? '',
});

const orNull = (v: string) => (v.trim() ? v.trim() : null);

function DetailsForm({
  bookingRef,
  traveller: t,
  required,
  onDone,
  onCancel,
}: {
  bookingRef: string;
  traveller: TravellerDetailsOut;
  required: DetailField[];
  onDone: () => void;
  onCancel: (() => void) | null;
}) {
  const router = useRouter();
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [d, setD] = useState<Draft>(() => draftOf(t));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Draft) => (v: string) => setD((x) => ({ ...x, [k]: v }));
  const kind = ID_TYPES.find((x) => x.id === d.idType) ?? ID_TYPES[0];
  const keepsNumber = t.idType === d.idType && t.idMasked;
  const req = (f: DetailField) =>
    required.includes(f) ? <em className="font-semibold text-warn not-italic"> required</em> : null;
  const first = t.name.split(' ')[0];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    // A saved ID is never dropped by the form: a new type without a number is refused by the api.
    const wantsId = Boolean(d.idNumber.trim()) || Boolean(t.idType);
    const body: TravellerDetailsInput = {
      name: d.name.trim(),
      idType: wantsId ? (d.idType as TravellerDetailsInput['idType']) : null,
      idNumber: orNull(d.idNumber),
      dob: orNull(d.dob),
      emergencyName: orNull(d.emergencyName),
      emergencyRelation: orNull(d.emergencyRelation),
      emergencyPhone: orNull(d.emergencyPhone),
      food: (orNull(d.food) as TravellerDetailsInput['food']) ?? null,
      allergies: orNull(d.allergies),
      medical: orNull(d.medical),
    };
    setBusy(true);
    setError(null);
    setErrors({});
    const res = await saveTravellerDetails(bookingRef, t.travellerId, body);
    setBusy(false);
    if (!res.ok) {
      const fields = res.error.fieldErrors ?? {};
      setErrors(fields);
      setError(res.error.message);
      const firstBad = Object.keys(fields)[0];
      if (firstBad)
        formRef.current?.querySelector<HTMLElement>(`[data-field="${firstBad}"]`)?.focus();
      return;
    }
    onDone();
    router.refresh();
  }

  const err = (k: string) => errors[k];
  const describe = (k: string, hint?: boolean) =>
    err(k) ? `${id}-${k}-e` : hint ? `${id}-${k}-h` : undefined;

  return (
    <form ref={formRef} onSubmit={submit} className="grid gap-3" noValidate>
      <Fld
        label="Full name, as on the ID"
        htmlFor={`${id}-name`}
        error={err('name')}
        errId={`${id}-name-e`}
      >
        <input
          id={`${id}-name`}
          data-field="name"
          value={d.name}
          onChange={(e) => set('name')(e.target.value)}
          autoComplete="off"
          maxLength={80}
          aria-invalid={err('name') ? true : undefined}
          aria-describedby={describe('name')}
          className={control}
        />
      </Fld>

      <div className="grid grid-cols-[minmax(0,118px)_minmax(0,1fr)] gap-2">
        <Fld label="ID type" htmlFor={`${id}-it`}>
          <select
            id={`${id}-it`}
            value={d.idType}
            onChange={(e) => setD((x) => ({ ...x, idType: e.target.value, idNumber: '' }))}
            className={`${control} px-2.5`}
          >
            {ID_TYPES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </Fld>
        <Fld
          label={<>ID number{req('id')}</>}
          htmlFor={`${id}-in`}
          error={err('idNumber')}
          errId={`${id}-idNumber-e`}
          hint={
            keepsNumber
              ? `Saved as ${t.idMasked} — leave blank to keep it`
              : `${kind.hint}. Only the last 4 show on screen.`
          }
          hintId={`${id}-idNumber-h`}
        >
          <input
            id={`${id}-in`}
            data-field="idNumber"
            value={d.idNumber}
            onChange={(e) => set('idNumber')(e.target.value)}
            inputMode={kind.mode}
            autoComplete="off"
            spellCheck={false}
            maxLength={24}
            placeholder={keepsNumber ? (t.idMasked ?? '') : kind.label}
            aria-invalid={err('idNumber') ? true : undefined}
            aria-describedby={describe('idNumber', true)}
            className={`${control} num tracking-wide`}
          />
        </Fld>
      </div>

      <Fld
        label={<>Date of birth{req('dob')}</>}
        htmlFor={`${id}-dob`}
        error={err('dob')}
        errId={`${id}-dob-e`}
      >
        <input
          id={`${id}-dob`}
          data-field="dob"
          type="date"
          value={d.dob}
          onChange={(e) => set('dob')(e.target.value)}
          aria-invalid={err('dob') ? true : undefined}
          aria-describedby={describe('dob')}
          className={control}
        />
      </Fld>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-[13px] font-bold">Emergency contact{req('emergency')}</legend>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,110px)] gap-2">
          <input
            aria-label="Emergency contact’s name"
            data-field="emergencyName"
            value={d.emergencyName}
            onChange={(e) => set('emergencyName')(e.target.value)}
            placeholder="Name"
            maxLength={80}
            autoComplete="off"
            aria-invalid={err('emergencyName') ? true : undefined}
            aria-describedby={describe('emergencyName')}
            className={control}
          />
          <input
            aria-label="Relation"
            value={d.emergencyRelation}
            onChange={(e) => set('emergencyRelation')(e.target.value)}
            placeholder="Relation"
            maxLength={40}
            autoComplete="off"
            className={control}
          />
        </div>
        <input
          aria-label="Emergency contact’s mobile number"
          data-field="emergencyPhone"
          value={d.emergencyPhone}
          onChange={(e) => set('emergencyPhone')(e.target.value)}
          placeholder="10-digit mobile"
          inputMode="tel"
          autoComplete="off"
          aria-invalid={err('emergencyPhone') ? true : undefined}
          aria-describedby={describe('emergencyPhone')}
          className={`${control} num`}
        />
        {(err('emergencyName') || err('emergencyPhone')) && (
          <p
            id={`${id}-${err('emergencyName') ? 'emergencyName' : 'emergencyPhone'}-e`}
            className="text-xs font-semibold text-warn"
          >
            {err('emergencyName') ?? err('emergencyPhone')}
          </p>
        )}
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-[13px] font-bold">Food{req('food')}</legend>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Food for ${first}`}>
          {FOODS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={d.food === f.id}
              onClick={() => set('food')(d.food === f.id ? '' : f.id)}
              className="rounded-chip border-[1.5px] border-line bg-bg px-3 py-1.5 text-[13px] font-bold transition-colors hover:border-ink aria-checked:border-primary aria-checked:bg-primary-soft aria-checked:text-primary-ink"
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          aria-label="Allergies"
          value={d.allergies}
          onChange={(e) => set('allergies')(e.target.value)}
          placeholder="Allergies, if any"
          maxLength={200}
          className={control}
        />
      </fieldset>

      <Fld
        label={<>Medical notes{req('medical')}</>}
        htmlFor={`${id}-med`}
        error={err('medical')}
        errId={`${id}-medical-e`}
      >
        <textarea
          id={`${id}-med`}
          data-field="medical"
          value={d.medical}
          onChange={(e) => set('medical')(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Anything the trip leader should know — or “None”"
          className={`${control} resize-y`}
        />
      </Fld>

      {error && Object.keys(errors).length === 0 && (
        <p role="alert" className="text-[13px] font-semibold text-warn">
          {error}
        </p>
      )}
      <footer className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-btn bg-primary px-4 py-2.5 text-[14px] font-bold text-white transition-colors hover:bg-primary-ink disabled:opacity-60"
        >
          {busy ? 'Saving…' : `Save ${first}’s details`}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-btn px-3 py-2.5 text-[14px] font-bold text-mute hover:text-ink"
          >
            Cancel
          </button>
        )}
      </footer>
      <p className="sr-only" aria-live="polite">
        {busy ? 'Saving' : ''}
      </p>
    </form>
  );
}

function Fld({
  label,
  htmlFor,
  error,
  errId,
  hint,
  hintId,
  children,
}: {
  label: React.ReactNode;
  htmlFor: string;
  error?: string;
  errId?: string;
  hint?: string;
  hintId?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-1">
      <label htmlFor={htmlFor} className="text-[13px] font-bold">
        {label}
      </label>
      {children}
      {error ? (
        <small id={errId} className="text-xs font-semibold text-warn">
          {error}
        </small>
      ) : hint ? (
        <small id={hintId} className="text-xs text-mute">
          {hint}
        </small>
      ) : null}
    </div>
  );
}
