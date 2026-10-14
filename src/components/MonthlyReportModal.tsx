import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  Download,
  Search,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Clock,
  Layers,
  Users,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
} from 'lucide-react';
import { api } from '../api';
import { MonthlyReportResponse, EmployeeMonthlyReportItem } from '../types';

interface MonthlyReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMonth?: string;
}

export const MonthlyReportModal: React.FC<MonthlyReportModalProps> = ({
  isOpen,
  onClose,
  initialMonth,
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string>(
    initialMonth || new Date().toISOString().slice(0, 7)
  );
  const [report, setReport] = useState<MonthlyReportResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'carried' | 'changes'>('all');

  const fetchReport = async (monthStr: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.getMonthlyReport(monthStr);
      if (res.report) {
        setReport(res.report);
      }
    } catch (err: any) {
      console.error('Failed to load monthly report', err);
      setError(err.message || 'Failed to load report for this month.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchReport(selectedMonth);
    }
  }, [isOpen, selectedMonth]);

  if (!isOpen) return null;

  // Filter employees by search query
  const filteredEmployees = (report?.employees || []).filter((emp) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      emp.employeeName.toLowerCase().includes(q) ||
      (emp.managerName && emp.managerName.toLowerCase().includes(q))
    );
  });

  // Export to CSV
  const handleExportCSV = () => {
    if (!report || !report.employees.length) return;

    const headers = [
      'Team Member',
      'Manager',
      'Total Tasks Assigned',
      'Carry Forwards',
      'Changes Received',
      'Completed Tasks',
      'Pending Tasks',
      'Completion Rate (%)',
      'Carried Forward Task Titles',
      'Changes Task Titles',
    ];

    const rows = report.employees.map((emp) => {
      const carriedTitles = emp.carriedForwardTasks.map((t) => `"${t.text.replace(/"/g, '""')}"`).join('; ');
      const changesTitles = emp.changesTasks.map((t) => `"${t.text.replace(/"/g, '""')}"`).join('; ');

      return [
        `"${emp.employeeName.replace(/"/g, '""')}"`,
        `"${(emp.managerName || 'Unassigned').replace(/"/g, '""')}"`,
        emp.totalTasksAssigned,
        emp.carryForwardCount,
        emp.changesCount,
        emp.completedTasks,
        emp.pendingTasks,
        `${emp.completionRate}%`,
        `"${carriedTitles}"`,
        `"${changesTitles}"`,
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `artmetech-employee-report-${report.yearMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-xs animate-fadeIn overflow-y-auto">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden my-auto animate-scaleUp">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/70">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-[#2E2BE6] text-white">
                <FileSpreadsheet className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-base sm:text-xl font-black text-[#0A0E2A] uppercase tracking-tight">
                  Monthly Performance & Changes Report
                </h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Monthly summary of employee carry-forwards, changes received, and task completions
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-auto">
            {/* Month Selector */}
            <div className="relative inline-flex items-center">
              <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="pl-8 pr-8 py-2 bg-white border border-slate-300 rounded-full text-xs font-bold text-slate-800 shadow-2xs hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2E2BE6] cursor-pointer"
              >
                {(report?.availableMonths || []).map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Export CSV */}
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={isLoading || !report?.employees.length}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50"
              title="Download spreadsheet report"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-full transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {error && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
              {error}
            </div>
          )}

          {/* Aggregate KPI Summary Cards */}
          {report && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 sm:gap-3.5">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 sm:p-4 text-center">
                <div className="flex items-center justify-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  <span>Team Members</span>
                </div>
                <div className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
                  {report.summary.totalEmployees}
                </div>
              </div>

              <div className="bg-amber-50/70 border border-amber-200/90 rounded-2xl p-3 sm:p-4 text-center">
                <div className="flex items-center justify-center gap-1.5 text-[10px] font-bold text-amber-700 uppercase tracking-wider">
                  <ArrowRight className="w-3.5 h-3.5 text-amber-600" />
                  <span>Carry Forwards</span>
                </div>
                <div className="text-xl sm:text-2xl font-black text-amber-900 mt-1">
                  {report.summary.totalCarryForwards}
                </div>
              </div>

              <div className="bg-purple-50/80 border border-purple-200 rounded-2xl p-3 sm:p-4 text-center">
                <div className="flex items-center justify-center gap-1.5 text-[10px] font-bold text-purple-700 uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                  <span>Changes Received</span>
                </div>
                <div className="text-xl sm:text-2xl font-black text-purple-900 mt-1">
                  {report.summary.totalChanges}
                </div>
              </div>

              <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-3 sm:p-4 text-center">
                <div className="flex items-center justify-center gap-1.5 text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Finished</span>
                </div>
                <div className="text-xl sm:text-2xl font-black text-emerald-900 mt-1">
                  {report.summary.totalCompleted}{' '}
                  <span className="text-xs text-emerald-600 font-semibold">
                    ({report.summary.averageCompletionRate}%)
                  </span>
                </div>
              </div>

              <div className="col-span-2 sm:col-span-1 bg-blue-50/70 border border-blue-200 rounded-2xl p-3 sm:p-4 text-center">
                <div className="flex items-center justify-center gap-1.5 text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                  <Layers className="w-3.5 h-3.5 text-blue-600" />
                  <span>Total Tasks</span>
                </div>
                <div className="text-xl sm:text-2xl font-black text-blue-900 mt-1">
                  {report.summary.totalTasks}
                </div>
              </div>
            </div>
          )}

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search team member by name..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-full text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2E2BE6]"
              />
            </div>

            <div className="text-[11px] text-slate-500 font-medium">
              Report for <strong className="text-slate-800">{report?.monthLabel || selectedMonth}</strong> •{' '}
              <span>{filteredEmployees.length} team members listed</span>
            </div>
          </div>

          {/* Employees Table */}
          {isLoading ? (
            <div className="p-12 text-center flex flex-col items-center justify-center">
              <div className="w-8 h-8 rounded-full border-2 border-[#2E2BE6] border-t-transparent animate-spin mb-3" />
              <p className="text-xs text-slate-500 font-medium">Analyzing tasks & computing monthly metrics...</p>
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50">
              <p className="text-xs font-bold text-slate-600">No team members found matching criteria</p>
              <p className="text-[11px] text-slate-400 mt-1">Try selecting a different month or clearing search</p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/90 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-4">Team Member</th>
                      <th className="py-3 px-3">Manager</th>
                      <th className="py-3 px-3 text-center">
                        <span className="text-amber-700">Carry Forwards</span>
                      </th>
                      <th className="py-3 px-3 text-center">
                        <span className="text-purple-700">Changes Received</span>
                      </th>
                      <th className="py-3 px-3 text-center">Completed</th>
                      <th className="py-3 px-3 text-center">Pending</th>
                      <th className="py-3 px-3 text-center">Total Tasks</th>
                      <th className="py-3 px-4 text-center">Rate</th>
                      <th className="py-3 px-3 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredEmployees.map((emp) => {
                      const isExpanded = expandedEmployee === emp.employeeName;

                      return (
                        <React.Fragment key={emp.employeeName}>
                          <tr
                            className={`hover:bg-slate-50/80 transition-colors ${
                              isExpanded ? 'bg-indigo-50/30' : ''
                            }`}
                          >
                            <td className="py-3 px-4 font-bold text-slate-900">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-[#0A0E2A] text-white flex items-center justify-center text-[10px] font-bold uppercase shrink-0">
                                  {emp.employeeName.slice(0, 2)}
                                </div>
                                <span>{emp.employeeName}</span>
                              </div>
                            </td>

                            <td className="py-3 px-3 text-slate-500 font-medium">
                              {emp.managerName ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-semibold border border-slate-200">
                                  {emp.managerName}
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[11px]">—</span>
                              )}
                            </td>

                            {/* Carry Forwards */}
                            <td className="py-3 px-3 text-center">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                  emp.carryForwardCount > 0
                                    ? 'bg-amber-100/90 text-amber-900 border border-amber-200/80'
                                    : 'bg-slate-100 text-slate-400'
                                }`}
                              >
                                {emp.carryForwardCount}
                              </span>
                            </td>

                            {/* Changes Received */}
                            <td className="py-3 px-3 text-center">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                  emp.changesCount > 0
                                    ? 'bg-purple-100 text-purple-900 border border-purple-200'
                                    : 'bg-slate-100 text-slate-400'
                                }`}
                              >
                                <Sparkles className="w-2.5 h-2.5 text-purple-600" />
                                <span>{emp.changesCount}</span>
                              </span>
                            </td>

                            <td className="py-3 px-3 text-center font-bold text-emerald-700">
                              {emp.completedTasks}
                            </td>

                            <td className="py-3 px-3 text-center font-bold text-slate-600">
                              {emp.pendingTasks}
                            </td>

                            <td className="py-3 px-3 text-center font-bold text-slate-900">
                              {emp.totalTasksAssigned}
                            </td>

                            {/* Completion Rate with Progress Bar */}
                            <td className="py-3 px-4 text-center">
                              <div className="flex flex-col items-center gap-1">
                                <span className="font-extrabold text-[11px] text-slate-800">
                                  {emp.completionRate}%
                                </span>
                                <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      emp.completionRate >= 80
                                        ? 'bg-emerald-500'
                                        : emp.completionRate >= 50
                                        ? 'bg-amber-500'
                                        : 'bg-rose-500'
                                    }`}
                                    style={{ width: `${emp.completionRate}%` }}
                                  />
                                </div>
                              </div>
                            </td>

                            {/* Toggle Details */}
                            <td className="py-3 px-3 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedEmployee(isExpanded ? null : emp.employeeName)
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition-all cursor-pointer"
                              >
                                <span>Tasks</span>
                                {isExpanded ? (
                                  <ChevronUp className="w-3 h-3" />
                                ) : (
                                  <ChevronDown className="w-3 h-3" />
                                )}
                              </button>
                            </td>
                          </tr>

                          {/* Expanded Task Breakdown for Employee */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={9} className="p-0 bg-slate-50/70 border-y border-slate-200">
                                <div className="p-4 sm:p-5 space-y-4">
                                  <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                                    <span className="text-xs font-black text-[#0A0E2A] uppercase tracking-wide">
                                      Task Drilldown for {emp.employeeName}
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Carried Forward Tasks */}
                                    <div className="bg-white border border-amber-200/80 rounded-xl p-3 shadow-2xs">
                                      <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
                                          <ArrowRight className="w-3.5 h-3.5 text-amber-600" />
                                          <span>Carry Forward Tasks ({emp.carriedForwardTasks.length})</span>
                                        </div>
                                      </div>
                                      {emp.carriedForwardTasks.length === 0 ? (
                                        <p className="text-[11px] text-slate-400 italic">No tasks carried forward this month.</p>
                                      ) : (
                                        <ul className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                                          {emp.carriedForwardTasks.map((t) => (
                                            <li
                                              key={t.id}
                                              className="text-[11px] p-2 rounded-lg bg-amber-50/60 border border-amber-100 flex items-start justify-between gap-2"
                                            >
                                              <span className="text-slate-800 font-medium leading-snug">
                                                {t.text}
                                              </span>
                                              <span className="shrink-0 text-[10px] text-amber-700 font-bold px-1.5 py-0.5 rounded bg-amber-100/80">
                                                from {t.assignedDate}
                                              </span>
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                    </div>

                                    {/* Changes Received Tasks */}
                                    <div className="bg-white border border-purple-200 rounded-xl p-3 shadow-2xs">
                                      <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-1.5 text-xs font-bold text-purple-800">
                                          <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                                          <span>Changes Received ({emp.changesTasks.length})</span>
                                        </div>
                                        <span className="text-[10px] text-slate-400 font-medium italic">
                                          Tasks matching &quot;changes&quot;
                                        </span>
                                      </div>
                                      {emp.changesTasks.length === 0 ? (
                                        <p className="text-[11px] text-slate-400 italic">No tasks with &quot;changes&quot; received this month.</p>
                                      ) : (
                                        <ul className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                                          {emp.changesTasks.map((t) => (
                                            <li
                                              key={t.id}
                                              className="text-[11px] p-2 rounded-lg bg-purple-50/60 border border-purple-100 flex items-start justify-between gap-2"
                                            >
                                              <span className="text-slate-800 font-medium leading-snug">
                                                {t.text}
                                              </span>
                                              <span className="shrink-0 text-[10px] text-purple-700 font-bold px-1.5 py-0.5 rounded bg-purple-100">
                                                {t.assignedDate}
                                              </span>
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <div className="text-[11px]">
            Rule: <em>Any task with &quot;changes&quot; written after it is counted as a change.</em>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-full bg-slate-200 hover:bg-slate-300 font-bold text-slate-700 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
