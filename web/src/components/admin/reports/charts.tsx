'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { cn } from '@/lib/utils';

/**
 * The reports' charts (R55): shadcn chart over Recharts, in the report's two series colours
 * (`--c1` ocean, `--c2` marigold — validated for CVD separation on both surfaces). One value
 * scale per chart, a faint grid, 4px rounded bar ends, a tooltip on every mark, numbers in ink
 * (never the series colour). Bars grow in once; nothing moves under reduced motion.
 */

const REDUCED = '(prefers-reduced-motion: reduce)';
function subscribe(onChange: () => void) {
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
export const useReducedMotion = () =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(REDUCED).matches,
    () => true, // the server draws still bars; the client animates once hydrated
  );

type TipRow = { label: string; value: string; key?: 'c1' | 'c2' };

/** The tooltip card: a title and one line per series, a swatch beside each. */
function Tip({ title, rows }: { title: string; rows: TipRow[] }) {
  return (
    <div className="grid min-w-36 gap-1.5 rounded-lg border border-line bg-bg px-2.5 py-2 text-xs text-ink shadow-xl">
      <b className="font-bold">{title}</b>
      {rows.map((r) => (
        <span key={r.label} className="flex items-center gap-2">
          {r.key && (
            <i
              aria-hidden
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ background: `var(--${r.key})` }}
            />
          )}
          <span className="text-mute">{r.label}</span>
          <b className="ml-auto pl-3 font-bold tabular-nums">{r.value}</b>
        </span>
      ))}
    </div>
  );
}

type TipProps<T> = { active?: boolean; payload?: { payload?: T }[] };
function tipFor<T>(render: (row: T) => { title: string; rows: TipRow[] }) {
  function TipContent({ active, payload }: TipProps<T>) {
    const row = active ? payload?.[0]?.payload : undefined;
    return row ? <Tip {...render(row)} /> : null;
  }
  return TipContent;
}

const AXIS = { fontSize: 11.5, fill: 'var(--color-mute)' };

export function Legend({ items }: { items: { key: 'c1' | 'c2'; label: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-ink2">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <i
            aria-hidden
            className="size-2.5 rounded-[3px]"
            style={{ background: `var(--${i.key})` }}
          />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

// --- two series by month ------------------------------------------------------------------------

export type PairPoint = { label: string; title: string; a: number; b: number };

/** Two series side by side per month (booked vs net, payments in vs refunds out). */
export function PairBars({
  data,
  names,
  format,
  tick,
  height = 240,
  label,
}: {
  data: PairPoint[];
  names: [string, string];
  format: (n: number) => string;
  tick: (n: number) => string;
  height?: number;
  label: string;
}) {
  const reduced = useReducedMotion();
  const config = {
    a: { label: names[0], color: 'var(--c1)' },
    b: { label: names[1], color: 'var(--c2)' },
  } satisfies ChartConfig;
  const Content = tipFor<PairPoint>((p) => ({
    title: p.title,
    rows: [
      { label: names[0], value: format(p.a), key: 'c1' },
      { label: names[1], value: format(p.b), key: 'c2' },
    ],
  }));
  return (
    <figure className="grid gap-2" aria-label={label}>
      <Legend
        items={[
          { key: 'c1', label: names[0] },
          { key: 'c2', label: names[1] },
        ]}
      />
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
        <BarChart
          data={data}
          barGap={2}
          barCategoryGap="22%"
          margin={{ top: 8, right: 4, left: 0 }}
        >
          <CartesianGrid vertical={false} stroke="var(--rg)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: 'var(--rbase)' }}
            tick={AXIS}
            interval="preserveStartEnd"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={AXIS}
            width={58}
            tickFormatter={tick}
            tickCount={4}
          />
          <ChartTooltip cursor={{ fill: 'var(--rhov)' }} content={<Content />} />
          <Bar
            dataKey="a"
            fill="var(--color-a)"
            radius={[4, 4, 0, 0]}
            isAnimationActive={!reduced}
          />
          <Bar
            dataKey="b"
            fill="var(--color-b)"
            radius={[4, 4, 0, 0]}
            isAnimationActive={!reduced}
          />
        </BarChart>
      </ChartContainer>
    </figure>
  );
}

// --- one series, horizontal ---------------------------------------------------------------------

export type HBar = { label: string; value: number; text: string; note?: string; flag?: boolean };

/** Ranked horizontal bars with the value written at the end — packages, reasons, add-ons. */
export function HBars({
  data,
  name,
  label,
  color = 'c1',
}: {
  data: HBar[];
  name: string;
  label: string;
  color?: 'c1' | 'c2';
}) {
  const reduced = useReducedMotion();
  if (!data.length) return <Empty />;
  const config = { value: { label: name, color: `var(--${color})` } } satisfies ChartConfig;
  const Content = tipFor<HBar>((b) => ({
    title: b.label,
    rows: [
      { label: name, value: b.text, key: color },
      ...(b.note ? [{ label: '', value: b.note }] : []),
    ],
  }));
  return (
    <figure aria-label={label}>
      <ChartContainer
        config={config}
        className="aspect-auto w-full"
        style={{ height: data.length * 34 + 12 }}
      >
        <BarChart
          data={data}
          layout="vertical"
          barCategoryGap={8}
          margin={{ top: 4, right: 92, left: 0, bottom: 4 }}
        >
          <XAxis type="number" hide domain={[0, 'dataMax']} />
          <YAxis
            type="category"
            dataKey="label"
            tickLine={false}
            axisLine={false}
            width={150}
            tick={{ ...AXIS, fill: 'var(--color-ink2)' }}
          />
          <ChartTooltip cursor={{ fill: 'var(--rhov)' }} content={<Content />} />
          <Bar
            dataKey="value"
            fill="var(--color-value)"
            radius={[0, 4, 4, 0]}
            isAnimationActive={!reduced}
          >
            <LabelList
              dataKey="text"
              position="right"
              className="fill-ink"
              style={{ fontSize: 12, fontWeight: 700 }}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
    </figure>
  );
}

// --- one series, columns ------------------------------------------------------------------------

export type Column = { label: string; value: number; text: string };

/** Small vertical columns for a distribution — party size, booked ahead. */
export function Columns({ data, name, label }: { data: Column[]; name: string; label: string }) {
  const reduced = useReducedMotion();
  const config = { value: { label: name, color: 'var(--c1)' } } satisfies ChartConfig;
  const Content = tipFor<Column>((c) => ({
    title: c.label,
    rows: [{ label: name, value: c.text, key: 'c1' }],
  }));
  return (
    <figure aria-label={label}>
      <ChartContainer config={config} className="aspect-auto h-44 w-full">
        <BarChart
          data={data}
          barCategoryGap="18%"
          margin={{ top: 18, right: 4, left: 4, bottom: 0 }}
        >
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: 'var(--rbase)' }}
            tick={AXIS}
            interval={0}
          />
          <YAxis hide />
          <ChartTooltip cursor={{ fill: 'var(--rhov)' }} content={<Content />} />
          <Bar
            dataKey="value"
            fill="var(--color-value)"
            radius={[4, 4, 0, 0]}
            isAnimationActive={!reduced}
          >
            <LabelList
              dataKey="text"
              position="top"
              className="fill-ink"
              style={{ fontSize: 11.5, fontWeight: 700 }}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
    </figure>
  );
}

// --- the tiles' minis ---------------------------------------------------------------------------

/** A tile's sparkline of columns; the last one in the series colour, the rest muted. */
export function MiniBars({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <span aria-hidden className="flex h-7 items-end gap-[2px]">
      {values.map((v, i) => (
        <i
          key={i}
          className="rpt-grow min-w-[3px] flex-1 rounded-t-[2px]"
          style={{
            height: `${Math.max((v / max) * 100, v ? 6 : 2)}%`,
            background: i === values.length - 1 ? 'var(--c1)' : 'var(--rbase)',
            animationDelay: `${i * 18}ms`,
          }}
        />
      ))}
    </span>
  );
}

/** A tile's split bar: share of a whole in the two series colours. */
export function MiniSplit({ a, b }: { a: number; b: number }) {
  return (
    <span aria-hidden className="flex h-2.5 gap-[2px] overflow-hidden rounded-full">
      {a > 0 && (
        <i className="rpt-grow-x rounded-l-full" style={{ flex: a, background: 'var(--c1)' }} />
      )}
      {b > 0 && (
        <i className="rpt-grow-x rounded-r-full" style={{ flex: b, background: 'var(--c2)' }} />
      )}
      {!a && !b && <i className="flex-1" style={{ background: 'var(--rtrack)' }} />}
    </span>
  );
}

export function Empty({ children = 'Nothing in this range yet.' }: { children?: ReactNode }) {
  return <p className="py-6 text-center text-sm text-mute">{children}</p>;
}

// --- tables -------------------------------------------------------------------------------------

export type Cell = string | number;

/** The Table view: the same numbers as the chart and the CSV, a total row in bold. */
export function DataTable({
  head,
  rows,
  total,
  numeric,
  caption,
}: {
  head: string[];
  rows: Cell[][];
  total?: Cell[];
  numeric: number[]; // column indexes aligned right
  caption: string;
}) {
  const align = (i: number) => (numeric.includes(i) ? 'text-right tabular-nums' : 'text-left');
  if (!rows.length) return <Empty />;
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[480px] border-collapse text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={h}
                scope="col"
                className={cn(
                  'border-b border-line px-2 py-2 text-[11px] font-extrabold tracking-wider text-mute uppercase',
                  align(i),
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, j) => (
            <tr key={j} className="border-b border-line/70">
              {r.map((c, i) => (
                <td
                  key={i}
                  className={cn(
                    'px-2 py-1.5 text-ink2',
                    align(i),
                    i === 0 && 'font-semibold text-ink',
                  )}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {total && (
          <tfoot>
            <tr>
              {total.map((c, i) => (
                <td
                  key={i}
                  className={cn(
                    'border-t-[1.5px] border-ink px-2 py-2 font-extrabold text-ink',
                    align(i),
                  )}
                >
                  {c}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
