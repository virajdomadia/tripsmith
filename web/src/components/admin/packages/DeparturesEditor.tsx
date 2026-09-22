'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { blankDeparture, type PackageFieldValues } from '@/lib/admin/package-schema';

/**
 * The owner thinks in rupees; the wire and the database are paise, always (06 §A3). One
 * conversion point, right here, so a stray `* 100` can never drift into a panel that only
 * renders. `toRupees` keeps an emptied box empty rather than showing 0.
 */
const toRupees = (paise: number | string | undefined) =>
  paise === '' || paise === undefined ? '' : String(Math.round(Number(paise) / 100));
const toPaise = (rupees: string) => (rupees === '' ? 0 : Math.round(Number(rupees) * 100));

const PRICES = [
  { key: 'priceDoublePaise', label: 'Double' },
  { key: 'priceTriplePaise', label: 'Triple' },
  { key: 'priceChildPaise', label: 'Child' },
  { key: 'singleSupplementPaise', label: 'Single suppl.' },
] as const;

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Mockup A4's departures table: date, seats, the occupancy pricing grid, guaranteed. */
export function DeparturesEditor() {
  const form = useFormContext<PackageFieldValues>();
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'departures' });
  const rows = form.watch('departures') ?? [];

  return (
    <div className="grid gap-3">
      <h3 className="text-base font-extrabold">
        Departures{' '}
        <span className="text-sm font-normal text-mute">
          · {fields.length} {fields.length === 1 ? 'date' : 'dates'}
        </span>
      </h3>

      {fields.length === 0 ? (
        <p className="text-sm text-mute">No departures yet — add the first date.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-line">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[150px]">Date</TableHead>
                <TableHead className="min-w-[90px]">Seats total</TableHead>
                {PRICES.map((p) => (
                  <TableHead key={p.key} className="min-w-[110px]">
                    {p.label}
                  </TableHead>
                ))}
                <TableHead className="min-w-[90px]">Guaranteed</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((row, i) => {
                const date = rows[i]?.date;
                const past = Boolean(date) && String(date) < todayIso();
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FormField
                          control={form.control}
                          name={`departures.${i}.date`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="sr-only">Date, departure {i + 1}</FormLabel>
                              <FormControl>
                                <Input {...field} type="date" className="w-[140px]" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        {past && (
                          <Badge variant="secondary" className="shrink-0">
                            Past
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <FormField
                        control={form.control}
                        name={`departures.${i}.seatsTotal`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="sr-only">
                              Seats total, departure {i + 1}
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="number"
                                min={1}
                                max={200}
                                inputMode="numeric"
                                aria-label={`Seats total, departure ${i + 1}`}
                                className="w-[80px]"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TableCell>
                    {PRICES.map((price) => (
                      <TableCell key={price.key}>
                        <FormField
                          control={form.control}
                          name={`departures.${i}.${price.key}`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="sr-only">
                                {price.label}, departure {i + 1}
                              </FormLabel>
                              <FormControl>
                                <div className="flex items-center gap-1">
                                  <span aria-hidden className="text-mute">
                                    ₹
                                  </span>
                                  <Input
                                    type="number"
                                    min={0}
                                    inputMode="numeric"
                                    aria-label={`${price.label}, departure ${i + 1}`}
                                    className="w-[92px]"
                                    name={field.name}
                                    ref={field.ref}
                                    onBlur={field.onBlur}
                                    value={toRupees(field.value as number | string | undefined)}
                                    onChange={(e) => field.onChange(toPaise(e.target.value))}
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </TableCell>
                    ))}
                    <TableCell>
                      <FormField
                        control={form.control}
                        name={`departures.${i}.guaranteed`}
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                aria-label={`Guaranteed, departure ${i + 1}`}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove departure ${i + 1}`}
                        onClick={() => remove(i)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append(blankDeparture())}
          disabled={fields.length >= 60}
        >
          <Plus className="size-4" aria-hidden />
          Add departure
        </Button>
        <span className="text-[13px] text-mute">
          Seats left is computed from bookings — never edited by hand.
        </span>
      </div>
    </div>
  );
}
