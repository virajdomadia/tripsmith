'use client';

import { useFormContext } from 'react-hook-form';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  KNOW_BEFORE_MAX,
  MEET_TEXT_MAX,
  type PackageFieldValues,
} from '@/lib/admin/package-schema';

const NOTES = [
  { name: 'kbWeather', label: 'Weather', hint: '14–24 °C in Munnar; cool evenings up the hill' },
  { name: 'kbNetwork', label: 'Network', hint: 'Which SIMs work, and where they don’t' },
  { name: 'kbCash', label: 'Cash', hint: 'How much to carry, and where cards fail' },
  { name: 'kbRules', label: 'Local rules', hint: 'Plastic-free parks, permits, quiet hours' },
  { name: 'kbPacking', label: 'Packing', hint: 'Plain text — shoes, a jacket, printed IDs' },
] as const;

/**
 * R48 (P10b): what the trip pack says about day one and the trip — mockup "Package editor B".
 * The meeting point is the package's; a date that starts somewhere else sets its own under
 * "Dates and prices". Customers see all of it 7 days before departure, once paid in full.
 */
export function TripPackSettingsPanel() {
  const form = useFormContext<PackageFieldValues>();
  return (
    <div className="grid gap-5">
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-bold">Meeting point</legend>
        <p className="text-[13px] text-mute">
          In the trip pack and as the calendar event’s location. A date can override it.
        </p>
        <div className="grid grid-cols-[1fr_110px] gap-2">
          <FormField
            control={form.control}
            name="meetPlace"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Place</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    maxLength={MEET_TEXT_MAX}
                    placeholder="Cochin International Airport, Arrivals Gate 3"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="meetTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Time</FormLabel>
                <FormControl>
                  <Input {...field} type="time" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="meetMapsUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Google Maps link</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="url"
                  inputMode="url"
                  placeholder="https://maps.app.goo.gl/…"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="meetNote"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Note</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  maxLength={MEET_TEXT_MAX}
                  placeholder="Look for the blue Tripsmith board"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-bold">Know before you go</legend>
        <p className="text-[13px] text-mute">Plain text. Blank notes stay out of the pack.</p>
        {NOTES.map((n) => (
          <FormField
            key={n.name}
            control={form.control}
            name={n.name}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{n.label}</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={2} maxLength={KNOW_BEFORE_MAX} placeholder={n.hint} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}
      </fieldset>
    </div>
  );
}
