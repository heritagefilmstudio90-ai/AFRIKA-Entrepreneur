import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { localeForLang, type AppLanguage } from '../lib/i18n';
import type { BusinessEvent } from '../types/domain';

interface BookingSlotOption {
  id: string;
  label: string;
  timeLabel: string;
  detail: string;
}

interface EventCalendarBookingSheetProps {
  event: BusinessEvent;
  allEvents: BusinessEvent[];
  selectedSlot: string;
  slots: BookingSlotOption[];
  lang?: AppLanguage;
  onSelectSlot: (slotId: string) => void;
  onSelectOtherEvent?: (eventId: string) => void;
}

const WEEKDAYS_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const EventCalendarBookingSheet: React.FC<EventCalendarBookingSheetProps> = ({
  event,
  allEvents,
  selectedSlot,
  slots,
  lang = 'fr',
  onSelectSlot,
  onSelectOtherEvent,
}) => {
  const isEn = lang === 'en';
  const eventDate = useMemo(() => new Date(event.dateIso), [event.dateIso]);
  const [viewYear, setViewYear] = useState(eventDate.getUTCFullYear());
  const [viewMonth, setViewMonth] = useState(eventDate.getUTCMonth());

  useEffect(() => {
    const d = new Date(event.dateIso);
    setViewYear(d.getUTCFullYear());
    setViewMonth(d.getUTCMonth());
  }, [event.dateIso]);

  const monthTitle = useMemo(() => {
    const d = new Date(Date.UTC(viewYear, viewMonth, 1));
    return d.toLocaleDateString(localeForLang(lang), { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }, [viewYear, viewMonth, lang]);

  const calendarCells = useMemo(() => {
    const firstDay = new Date(Date.UTC(viewYear, viewMonth, 1));
    const startWeekday = firstDay.getUTCDay();
    const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();
    const daysInPrevMonth = new Date(Date.UTC(viewYear, viewMonth, 0)).getUTCDate();

    const cells: Array<{ day: number; inMonth: boolean; dateKey: string }> = [];

    for (let i = startWeekday - 1; i >= 0; i -= 1) {
      const d = daysInPrevMonth - i;
      const prevDate = new Date(Date.UTC(viewYear, viewMonth - 1, d));
      cells.push({ day: d, inMonth: false, dateKey: prevDate.toISOString().slice(0, 10) });
    }

    for (let d = 1; d <= daysInMonth; d += 1) {
      const curDate = new Date(Date.UTC(viewYear, viewMonth, d));
      cells.push({ day: d, inMonth: true, dateKey: curDate.toISOString().slice(0, 10) });
    }

    while (cells.length % 7 !== 0) {
      const nextDay = cells.length - (startWeekday + daysInMonth) + 1;
      const nextDate = new Date(Date.UTC(viewYear, viewMonth + 1, nextDay));
      cells.push({ day: nextDay, inMonth: false, dateKey: nextDate.toISOString().slice(0, 10) });
    }

    return cells;
  }, [viewYear, viewMonth]);

  const activeDateKey = event.dateIso.slice(0, 10);

  const otherEventByDay = useMemo(() => {
    const map = new Map<string, BusinessEvent>();
    for (const item of allEvents) {
      map.set(item.dateIso.slice(0, 10), item);
    }
    return map;
  }, [allEvents]);

  const shiftMonth = (delta: number) => {
    const next = new Date(Date.UTC(viewYear, viewMonth + delta, 1));
    setViewYear(next.getUTCFullYear());
    setViewMonth(next.getUTCMonth());
  };

  const weekdays = isEn ? WEEKDAYS_EN : WEEKDAYS_FR;

  return (
    <div className="rounded-[24px] bg-[#F3EFEA] dark:bg-[#141417] border border-[var(--ae-border)] p-4 sm:p-5 space-y-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-[#000000] dark:text-[#F9F9F9]">
            {isEn ? 'Select date' : 'Choisir une date'}
          </span>
          <span className="font-mono text-[11px] font-semibold text-[#E85002]">{event.city}</span>
        </div>

        <div className="flex items-center justify-between px-1">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            aria-label={isEn ? 'Previous month' : 'Mois précédent'}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white dark:bg-[#1E1E22] text-[#000000] dark:text-[#F9F9F9] hover:border hover:border-[#E85002] transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs font-bold capitalize text-[#000000] dark:text-[#F9F9F9]">{monthTitle}</span>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            aria-label={isEn ? 'Next month' : 'Mois suivant'}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white dark:bg-[#1E1E22] text-[#000000] dark:text-[#F9F9F9] hover:border hover:border-[#E85002] transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {weekdays.map((w) => (
            <span key={w} className="text-[10px] font-medium text-[#646464] dark:text-[#A7A7A7] py-1">
              {w}
            </span>
          ))}
          {calendarCells.map((cell) => {
            const isActiveEventDay = cell.dateKey === activeDateKey;
            const matchingEvent = otherEventByDay.get(cell.dateKey);
            return (
              <button
                key={cell.dateKey}
                type="button"
                disabled={!matchingEvent}
                onClick={() => matchingEvent && onSelectOtherEvent?.(matchingEvent.id)}
                title={matchingEvent ? matchingEvent.title : undefined}
                className={`relative mx-auto flex h-9 w-9 items-center justify-center rounded-xl font-mono text-xs tabular-nums transition-all ${
                  isActiveEventDay
                    ? 'bg-[#E85002] text-[#F9F9F9] font-bold shadow-[0_6px_16px_-4px_rgba(232,80,2,0.65)]'
                    : matchingEvent
                      ? 'bg-white dark:bg-[#26262B] text-[#000000] dark:text-[#F9F9F9] font-semibold hover:ring-1 hover:ring-[#E85002]'
                      : cell.inMonth
                        ? 'text-[#333333] dark:text-[#A7A7A7] opacity-85 cursor-default'
                        : 'text-[#A7A7A7] dark:text-[#333333] opacity-55 cursor-default'
                }`}
              >
                <span>{cell.day}</span>
                {matchingEvent && !isActiveEventDay && (
                  <span className="absolute bottom-1 h-1 w-1 rounded-full bg-[#E85002]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2 border-t border-[var(--ae-border)] pt-3.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-[#000000] dark:text-[#F9F9F9]">
            {isEn ? 'Time slot & session' : 'Créneau horaire & session'}
          </span>
          <span className="font-mono text-[11px] font-semibold text-[#E85002]">
            {slots.find((s) => s.id === selectedSlot)?.timeLabel}
          </span>
        </div>

        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-2"
          role="radiogroup"
          aria-label={isEn ? 'Time slot' : 'Créneau horaire'}
        >
          {slots.map((slot) => {
            const active = selectedSlot === slot.id;
            return (
              <button
                key={slot.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onSelectSlot(slot.id)}
                className={`relative rounded-2xl px-3 py-2.5 text-center transition-all ${
                  active
                    ? 'bg-white dark:bg-[#1E1E22] text-[#000000] dark:text-[#F9F9F9] shadow-sm ring-2 ring-[#E85002]'
                    : 'bg-white/60 dark:bg-[#1A1A1D] text-[#646464] dark:text-[#A7A7A7] hover:bg-white dark:hover:bg-[#26262B]'
                }`}
              >
                <span className="block font-mono text-xs font-bold tabular-nums">{slot.timeLabel}</span>
                <span className="mt-0.5 block text-[11px] font-semibold truncate">{slot.label}</span>
                <span
                  aria-hidden="true"
                  className={`mx-auto mt-1.5 block rounded-full ${
                    active ? 'h-2.5 w-0.5 bg-[#E85002]' : 'h-1.5 w-px bg-[#A7A7A7]/60'
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
