import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

const STATUS_DOT = {
  pending_content: "bg-amber-400",
  pending_review: "bg-amber-500",
  approved: "bg-violet-500",
  posted: "bg-emerald-500",
  failed: "bg-red-500",
  rejected: "bg-neutral-400",
};

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MAX_CHIPS_PER_DAY = 3;

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function buildMonthGrid(visibleMonth) {
  const first = startOfMonth(visibleMonth);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());

  const days = [];
  const cursor = new Date(gridStart);
  for (let i = 0; i < 42; i += 1) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export default function SchedulingCalendar({ posts, onSelectPost }) {
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));

  const postsByDay = new Map();
  for (const post of posts) {
    if (!post.suggested_date) continue;
    const key = new Date(post.suggested_date).toDateString();
    if (!postsByDay.has(key)) postsByDay.set(key, []);
    postsByDay.get(key).push(post);
  }

  const days = buildMonthGrid(visibleMonth);
  const monthLabel = visibleMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const today = new Date().toDateString();

  function shiftMonth(delta) {
    setVisibleMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-neutral-900">{monthLabel}</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
            aria-label="Previous month"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setVisibleMonth(startOfMonth(new Date()))}
            className="rounded-lg px-2 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
            aria-label="Next month"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200 text-xs">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="bg-neutral-50 px-1.5 py-1 text-center font-medium text-neutral-500">
            {label}
          </div>
        ))}

        {days.map((day) => {
          const inMonth = day.getMonth() === visibleMonth.getMonth();
          const dayPosts = postsByDay.get(day.toDateString()) || [];
          const overflow = dayPosts.length - MAX_CHIPS_PER_DAY;

          return (
            <div
              key={day.toISOString()}
              className={`min-h-[72px] bg-white p-1 ${inMonth ? "" : "bg-neutral-50 text-neutral-300"}`}
            >
              <p
                className={`text-right text-[11px] ${
                  day.toDateString() === today ? "font-semibold text-violet-600" : "text-neutral-400"
                }`}
              >
                {day.getDate()}
              </p>
              <div className="mt-0.5 space-y-0.5">
                {dayPosts.slice(0, MAX_CHIPS_PER_DAY).map((post) => (
                  <button
                    key={post.id}
                    type="button"
                    onClick={() => onSelectPost?.(post)}
                    className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] text-neutral-600 hover:bg-neutral-100"
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[post.status] || "bg-neutral-300"}`} />
                    <span className="truncate">
                      {new Date(post.suggested_date).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </button>
                ))}
                {overflow > 0 && <p className="px-1 text-[11px] text-neutral-400">+{overflow} more</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
