import React from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  CheckCircle2,
  Clock,
  Flame,
  Layers,
  Info,
} from 'lucide-react';
import { AvailableDateInfo, DailyStats } from '../types';

interface DateSelectorProps {
  selectedDate: string;
  availableDates?: AvailableDateInfo[];
  dailyStats?: DailyStats;
  userRole?: string;
  onSelectDate: (date: string) => void;
}

export const DateSelector: React.FC<DateSelectorProps> = ({
  selectedDate,
  availableDates = [],
  dailyStats,
  userRole,
  onSelectDate,
}) => {
  const todayDate = availableDates[0]?.date || new Date().toISOString().slice(0, 10);
  const isTodaySelected = selectedDate === todayDate;
  const isPastDate = Boolean(selectedDate && selectedDate < todayDate);

  const canGoNewer = selectedDate < todayDate;
  const canGoOlder = true;

  const handlePrevDay = () => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - 1);
    onSelectDate(dt.toISOString().slice(0, 10));
  };

  const handleNextDay = () => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + 1);
    const nextStr = dt.toISOString().slice(0, 10);
    if (nextStr <= todayDate) {
      onSelectDate(nextStr);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-xs text-slate-900 p-3 sm:p-5 mb-3 sm:mb-6 transition-all w-full max-w-full min-w-0">
      {/* Top Header & Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 sm:pb-3.5 border-b border-slate-100 min-w-0">
        <div className="flex items-center justify-between sm:justify-start gap-2 flex-wrap min-w-0">
          <div className="flex items-center gap-0.5 sm:gap-1 bg-slate-50 p-0.5 sm:p-1 rounded-full border border-slate-200 shrink-0">
            <button
              id="btn-prev-day"
              type="button"
              onClick={handlePrevDay}
              disabled={!canGoOlder}
              title="Previous Day"
              className={`p-1 sm:p-1.5 rounded-full transition-colors ${
                canGoOlder
                  ? 'text-slate-700 hover:bg-white hover:shadow-xs cursor-pointer'
                  : 'text-slate-300 cursor-not-allowed'
              }`}
            >
              <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>

            <div className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 text-xs font-bold text-slate-900 whitespace-nowrap">
              <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#2E2BE6]" />
              <span>
                {availableDates.find((d) => d.date === selectedDate)?.label || selectedDate}
              </span>
            </div>

            <button
              id="btn-next-day"
              type="button"
              onClick={handleNextDay}
              disabled={!canGoNewer}
              title="Next Day"
              className={`p-1 sm:p-1.5 rounded-full transition-colors ${
                canGoNewer
                  ? 'text-slate-700 hover:bg-white hover:shadow-xs cursor-pointer'
                  : 'text-slate-300 cursor-not-allowed'
              }`}
            >
              <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Quick Native Date Picker */}
            <input
              id="input-date-picker"
              type="date"
              max={todayDate}
              value={selectedDate}
              onChange={(e) => {
                if (e.target.value) onSelectDate(e.target.value);
              }}
              className="text-xs px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-full focus:outline-none focus:ring-1 focus:ring-[#2E2BE6] text-slate-800 font-semibold cursor-pointer"
            />
          </div>
        </div>

        {/* Daily Progress Status */}
        <div className="flex items-center justify-between sm:justify-end text-[11px] text-slate-500 font-medium">
          {isTodaySelected && (
            <span className="inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Active Today
            </span>
          )}
        </div>
      </div>

      {/* 15-Day Horizontal Timeline / Date Strip */}
      <div className="py-2 sm:py-3 overflow-x-auto scrollbar-thin flex items-center gap-1.5 sm:gap-2 min-w-0 w-full">
        {availableDates.map((item) => {
          const isSelected = item.date === selectedDate;
          const isToday = item.date === todayDate;
          const rawLabel = item.label || item.date || '';
          const shortLabel = isToday ? 'Today' : rawLabel.includes(' (') ? rawLabel.split(' (')[0] : rawLabel;

          return (
            <button
              key={item.date}
              id={`date-pill-${item.date}`}
              type="button"
              onClick={() => onSelectDate(item.date)}
              className={`flex-shrink-0 flex flex-col items-center px-2 sm:px-3.5 py-1 sm:py-2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs transition-all border cursor-pointer ${
                isSelected
                  ? 'bg-[#2E2BE6] text-white border-[#2E2BE6] shadow-sm font-bold ring-2 ring-[#2E2BE6]/20'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
              }`}
            >
              <span className="text-[10px] sm:text-[11px] font-bold">
                {shortLabel}
              </span>
              <span className={`text-[8px] sm:text-[9px] ${isSelected ? 'text-indigo-100' : 'text-slate-400'}`}>
                {item.dayOfWeek || item.date.slice(5)}
              </span>

              {/* Mini task counters */}
              <div className="flex items-center gap-1 mt-1 text-[8px] sm:text-[9px]">
                <span
                  title="Finished tasks"
                  className={`font-semibold ${isSelected ? 'text-emerald-200' : 'text-emerald-600'}`}
                >
                  ✓{item.finishedCount || 0}
                </span>
                <span className={isSelected ? 'text-white/40' : 'text-slate-300'}>/</span>
                <span
                  title="Total tasks"
                  className={isSelected ? 'text-white' : 'text-slate-500'}
                >
                  {item.totalTasks || 0}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Daily Task Breakdown & Carry-Forward Statistics (Hidden for managers) */}
      {dailyStats && userRole !== 'manager' && (
        <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 text-center">
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2 sm:p-2.5">
            <div className="flex items-center justify-center gap-1 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              <Layers className="w-3 h-3 text-slate-400" />
              <span>Total Tasks</span>
            </div>
            <div className="text-base sm:text-lg font-black text-slate-900 mt-0.5">
              {dailyStats.totalTasks}
            </div>
          </div>

          <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-2 sm:p-2.5">
            <div className="flex items-center justify-center gap-1 text-[10px] text-blue-700 font-bold uppercase tracking-wider">
              <Calendar className="w-3 h-3 text-blue-600" />
              <span>{isTodaySelected ? 'Given Today' : 'Assigned This Day'}</span>
            </div>
            <div className="text-base sm:text-lg font-black text-blue-900 mt-0.5">
              {dailyStats.totalGiven}
            </div>
          </div>

          <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-2 sm:p-2.5">
            <div className="flex items-center justify-center gap-1 text-[10px] text-amber-700 font-bold uppercase tracking-wider">
              <ArrowRight className="w-3 h-3 text-amber-600" />
              <span>Carried Forward</span>
            </div>
            <div className="text-base sm:text-lg font-black text-amber-900 mt-0.5">
              {dailyStats.totalCarriedForward}
            </div>
          </div>

          <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-2 sm:p-2.5">
            <div className="flex items-center justify-center gap-1 text-[10px] text-emerald-700 font-bold uppercase tracking-wider">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span>Finished</span>
            </div>
            <div className="text-base sm:text-lg font-black text-emerald-900 mt-0.5">
              {dailyStats.totalFinished}
            </div>
          </div>

          <div className="col-span-2 sm:col-span-1 bg-indigo-50/60 border border-indigo-200/80 rounded-xl p-2 sm:p-2.5">
            <div className="flex items-center justify-center gap-1 text-[10px] text-indigo-700 font-bold uppercase tracking-wider">
              <Clock className="w-3 h-3 text-indigo-600" />
              <span>Pending</span>
            </div>
            <div className="text-base sm:text-lg font-black text-indigo-900 mt-0.5">
              {dailyStats.totalPending}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
