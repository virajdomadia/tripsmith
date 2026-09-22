'use client';

import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { blankDay, type PackageFieldValues } from '@/lib/admin/package-schema';
import { movedIndices, useSortableSensors } from '@/lib/admin/sortable';

const MEALS = [
  { key: 'breakfast', label: 'B' },
  { key: 'lunch', label: 'L' },
  { key: 'dinner', label: 'D' },
] as const;

function DayRow({ id, index, onRemove }: { id: string; index: number; onRemove: () => void }) {
  const form = useFormContext<PackageFieldValues>();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      role="group"
      aria-label={`Day ${index + 1}`}
      className={`grid gap-2 rounded-md border border-line bg-bg p-3 ${isDragging ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Reorder day ${index + 1}`}
          className="cursor-grab rounded p-1 text-mute hover:text-ink focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
        <span className="text-sm font-bold text-mute">Day {index + 1}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto"
          aria-label={`Remove day ${index + 1}`}
          onClick={onRemove}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>

      <FormField
        control={form.control}
        name={`itinerary.${index}.title`}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="sr-only">Title, day {index + 1}</FormLabel>
            <FormControl>
              <Input {...field} placeholder="Arrive Goa — Candolim check-in" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={`itinerary.${index}.description`}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="sr-only">Description, day {index + 1}</FormLabel>
            <FormControl>
              <Textarea {...field} rows={3} placeholder="What the day actually looks like." />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-semibold text-mute">Meals</span>
          {MEALS.map((meal) => (
            <FormField
              key={meal.key}
              control={form.control}
              name={`itinerary.${index}.meals.${meal.key}`}
              render={({ field }) => (
                <FormItem className="flex items-center gap-1.5">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      aria-label={`${meal.key}, day ${index + 1}`}
                    />
                  </FormControl>
                  <FormLabel className="text-[13px]">{meal.label}</FormLabel>
                </FormItem>
              )}
            />
          ))}
        </div>
        <FormField
          control={form.control}
          name={`itinerary.${index}.stay`}
          render={({ field }) => (
            <FormItem className="min-w-[220px] flex-1">
              <FormLabel className="sr-only">Stay, day {index + 1}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={field.value ?? ''}
                  placeholder="Stay: Lemon Tree, Candolim"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}

/**
 * Mockup A4's itinerary block. Reordering is dnd-kit with a keyboard sensor — space to lift,
 * arrows to move, space to drop — so there is no parallel set of up/down buttons to keep in
 * sync. `move` comes from `useFieldArray` so react-hook-form's registered field names follow
 * the rows; reordering a local copy would leave the form state behind.
 */
export function ItineraryEditor() {
  const form = useFormContext<PackageFieldValues>();
  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: 'itinerary',
  });
  const sensors = useSortableSensors();

  const nights = Number(form.watch('nights'));
  const days = Number.isFinite(nights) ? nights + 1 : 0;
  const full = fields.length >= days;

  function onDragEnd(event: DragEndEvent) {
    const moved = movedIndices(
      event,
      fields.map((f) => f.id),
    );
    if (moved) move(moved.from, moved.to);
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-extrabold">
          Itinerary{' '}
          <span className="text-sm font-normal text-mute">
            · {fields.length} of {days} days
          </span>
        </h3>
      </div>

      {fields.length === 0 && <p className="text-sm text-mute">No days yet — add the first one.</p>}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          <div className="grid gap-2">
            {fields.map((row, i) => (
              <DayRow key={row.id} id={row.id} index={i} onRemove={() => remove(i)} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append(blankDay())}
          disabled={full}
          title={full ? `This trip is ${days} days long — change nights to add more.` : undefined}
        >
          <Plus className="size-4" aria-hidden />
          Add day
        </Button>
        {full && days > 0 && (
          <span className="text-[13px] text-mute">
            Every day of the trip is written. Change nights to add more.
          </span>
        )}
      </div>
    </div>
  );
}
