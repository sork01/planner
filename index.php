<?php
require_once __DIR__ . '/../sso/auth.php';
require 'config.php';

$demoMode = isset($_GET['demo']);

if ($demoMode) {
    $user = ['username' => 'demo', 'display_name' => 'Demo', 'email' => ''];
} else {
    $user = requireAuth();
}

$username = $user['username'];
$csrfToken = ssoGenerateCsrfToken();
$displayName = htmlspecialchars($user['display_name']);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <link rel="icon" type="image/svg+xml" href="favicon.svg">
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="csrf-token" content="<?= htmlspecialchars($csrfToken) ?>">
    <title>Planner</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body { font-family: 'Inter', system-ui, sans-serif; }
        .cal-event { transition: opacity 0.15s, transform 0.15s; }
        .cal-event:hover { opacity: 0.85; transform: scale(1.02); }
        .cal-event.completed-event { opacity: 0.4; }
        .cal-event.completed-event .evt-title { text-decoration: line-through; }
        .time-slot:hover { background-color: rgba(39, 39, 42, 0.5); }
        .month-day:hover { background-color: rgba(39, 39, 42, 0.5); }
        .month-day.is-today { box-shadow: inset 0 0 0 2px rgba(16, 185, 129, 0.6); }
        .week-day-header.is-today { color: #10b981; }
        .scrollbar-thin::-webkit-scrollbar { width: 4px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 2px; }
        .modal-backdrop { animation: fadeIn 0.15s ease; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .modal-content { animation: slideUp 0.2s ease; }
        .toast-enter { animation: toastIn 0.3s ease; }
        .toast-exit { animation: toastOut 0.3s ease forwards; }
        @keyframes toastIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes toastOut { from { transform: translateY(0); opacity: 1; } to { transform: translateY(20px); opacity: 0; } }
        .drag-over { outline: 2px dashed #8b5cf6 !important; outline-offset: -2px; }
        .dragging { opacity: 0.5 !important; }
        .kbd { display: inline-block; padding: 1px 5px; font-size: 10px; font-family: monospace; background: #27272a; border: 1px solid #3f3f46; border-radius: 4px; color: #a1a1aa; }
        .drag-handle { cursor: grab; }
        .resize-handle { cursor: row-resize; position: absolute; bottom: 0; left: 0; right: 0; height: 6px; }
        .sidebar-resizer { width: 4px; cursor: col-resize; background: transparent; transition: background 0.15s; }
        .sidebar-resizer:hover, .sidebar-resizer.active { background: #8b5cf6; }
        .quick-add:focus { outline: none; }
        @media (max-width: 768px) {
            .desktop-sidebar { display: none !important; }
            .mobile-bottom-bar { display: flex !important; }
            .desktop-nav { display: none !important; }
            .mobile-nav { display: flex !important; }
            .sidebar-resizer { display: none !important; }
            .mobile-compact { display: none !important; }
            body { padding-bottom: 56px; }
        }
        @media (min-width: 769px) {
            .mobile-bottom-bar { display: none !important; }
            .mobile-nav { display: none !important; }
        }
        @media print {
            .no-print { display: none !important; }
            body { background: white !important; color: black !important; }
            .bg-zinc-950, .bg-zinc-900, .bg-zinc-800 { background: white !important; }
            .border-zinc-800, .border-zinc-700, .border-zinc-900 { border-color: #ccc !important; }
            .text-zinc-100, .text-zinc-200, .text-zinc-300, .text-zinc-400, .text-white { color: black !important; }
            .cal-event { break-inside: avoid; }
        }
    </style>
</head>
<body class="bg-zinc-950 text-zinc-100 min-h-screen flex flex-col">

    <?php if ($demoMode): ?>
    <div class="bg-amber-600 text-center py-2 text-sm font-medium no-print">
        Demo mode &mdash; changes are not saved. <a href="/sso/?redirect=/planner/" class="underline">Log in</a> to save your own events.
    </div>
    <?php endif; ?>

    <div class="flex flex-col h-screen">
        <div class="bg-zinc-900 border-b border-zinc-800 px-3 md:px-6 py-2 md:py-3 flex items-center shrink-0 no-print gap-2">
            <div class="flex items-center gap-2 shrink-0">
                <div class="w-8 h-8 md:w-9 md:h-9 bg-violet-500 rounded-2xl flex items-center justify-center text-lg md:text-xl">📅</div>
                <h1 class="text-lg md:text-2xl font-semibold">Planner</h1>
            </div>
            <div class="flex-1 min-w-0 text-center">
                <h2 id="navTitle" class="text-sm md:text-lg font-medium truncate"></h2>
            </div>
            <div class="flex items-center gap-1">
                <div class="flex items-center bg-zinc-800 rounded-full overflow-hidden desktop-nav">
                    <button id="btnWeek" onclick="setView('week')" class="px-3 py-1.5 text-sm font-medium transition">Week</button>
                    <button id="btnMonth" onclick="setView('month')" class="px-3 py-1.5 text-sm font-medium transition">Month</button>
                </div>
                <button onclick="goToday()" class="text-sm bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-full transition">Today</button>
                <button onclick="navPrev()" class="p-1.5 hover:bg-zinc-800 rounded-lg transition">
                    <svg class="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                </button>
                <button onclick="navNext()" class="p-1.5 hover:bg-zinc-800 rounded-lg transition">
                    <svg class="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </button>
                <button onclick="openKeyboardHelp()" class="p-1.5 hover:bg-zinc-800 rounded-lg transition text-zinc-500 hover:text-zinc-300 hidden md:inline-flex" title="Keyboard shortcuts">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-2a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/></svg>
                </button>
                <?php if ($demoMode): ?>
                <a href="/sso/?redirect=<?= urlencode('/planner/') ?>" class="text-blue-400 hover:text-blue-300 text-sm ml-2">Log in</a>
                <?php else: ?>
                <form method="POST" action="/sso/" class="inline ml-2"><input type="hidden" name="logout" value="1"><input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrfToken) ?>"><input type="hidden" name="redirect" value="/planner/"><button type="submit" class="text-red-400 hover:text-red-300 text-sm">Logout</button></form>
                <?php endif; ?>
            </div>
        </div>

        <div class="flex flex-1 overflow-hidden">
            <div id="calendarArea" class="flex-1 overflow-hidden flex flex-col">
                <div id="weekView" class="flex-1 overflow-hidden flex flex-col">
                    <div class="grid grid-cols-8 border-b border-zinc-800 bg-zinc-900 shrink-0 week-header-row">
                        <div class="py-2 px-1 text-xs text-zinc-500 text-center" id="weekNumLabel"></div>
                        <div id="dayHead0" class="py-2 px-1 text-center text-sm"></div>
                        <div id="dayHead1" class="py-2 px-1 text-center text-sm"></div>
                        <div id="dayHead2" class="py-2 px-1 text-center text-sm"></div>
                        <div id="dayHead3" class="py-2 px-1 text-center text-sm"></div>
                        <div id="dayHead4" class="py-2 px-1 text-center text-sm"></div>
                        <div id="dayHead5" class="py-2 px-1 text-center text-sm"></div>
                        <div id="dayHead6" class="py-2 px-1 text-center text-sm"></div>
                    </div>
                    <div id="weekGrid" class="flex-1 overflow-y-auto scrollbar-thin">
                    </div>
                </div>
                <div id="monthView" class="flex-1 overflow-y-auto scrollbar-thin hidden">
                </div>
            </div>

            <div id="sidebarResizer" class="sidebar-resizer no-print"></div>

            <div id="sidebar" class="w-72 bg-zinc-900 border-l border-zinc-800 flex flex-col shrink-0 desktop-sidebar">
                <div class="p-4 border-b border-zinc-800">
                    <div class="flex justify-between items-center mb-2">
                        <h3 class="font-semibold text-lg">Events</h3>
                        <button onclick="openAddModal()" class="bg-violet-600 hover:bg-violet-500 px-3 py-1.5 rounded-full text-sm font-medium transition">+ Add</button>
                    </div>
                    <div class="flex items-center gap-1.5 mb-2 flex-wrap">
                        <button onclick="exportICS()" class="text-xs bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1 rounded-full transition" title="Export .ics">Export</button>
                        <button onclick="openImportModal()" class="text-xs bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1 rounded-full transition" title="Import .ics">Import</button>
                        <button onclick="openManageModal()" class="text-xs bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1 rounded-full transition" title="Manage events">Manage</button>
                    </div>
                    <div class="flex items-center gap-2">
                        <div class="relative flex-1">
                            <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                            <input id="searchInput" type="text" placeholder="Search events..." class="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-violet-500 transition" oninput="handleSearch()">
                        </div>
                    </div>
                    <div id="filterBar" class="flex gap-1.5 mt-2 flex-wrap">
                        <button onclick="toggleFilter('all')" data-filter="all" class="text-xs px-2.5 py-1 rounded-full bg-zinc-700 text-white transition">All</button>
                        <button onclick="toggleFilter('task')" data-filter="task" class="text-xs px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400 transition">Tasks</button>
                        <button onclick="toggleFilter('meeting')" data-filter="meeting" class="text-xs px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400 transition">Meetings</button>
                        <button onclick="toggleFilter('deadline')" data-filter="deadline" class="text-xs px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400 transition">Deadlines</button>
                    </div>
                </div>
                <div id="sidebarEvents" class="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-2">
                </div>
            </div>
        </div>

        <div class="mobile-bottom-bar bg-zinc-900 border-t border-zinc-800 py-2 px-4 justify-around items-center no-print" style="display:none">
            <button onclick="openAddModal()" class="flex flex-col items-center text-xs text-zinc-400 hover:text-violet-400">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                Add
            </button>
            <button onclick="setView('week')" id="mobileWeek" class="flex flex-col items-center text-xs text-violet-400">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                <span id="mobileWeekLabel">Day</span>
            </button>
            <button onclick="goToday()" class="flex flex-col items-center text-xs text-zinc-400 hover:text-violet-400">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="2"/><path stroke-linecap="round" stroke-width="2" d="M12 6v6l4 2"/></svg>
                Today
            </button>
            <button onclick="setView('month')" id="mobileMonth" class="flex flex-col items-center text-xs text-zinc-400">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>
                Month
            </button>
            <button onclick="toggleMobileSidebar()" class="flex flex-col items-center text-xs text-zinc-400 hover:text-violet-400">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16"/></svg>
                Events
            </button>
        </div>
    </div>

    <div id="eventModal" class="hidden fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 modal-backdrop">
        <div class="bg-zinc-900 rounded-3xl w-full max-w-lg p-6 md:p-8 modal-content max-h-[90vh] overflow-y-auto scrollbar-thin">
            <h3 id="modalTitle" class="text-xl md:text-2xl font-bold mb-4 md:mb-6">Add Event</h3>
            <input type="hidden" id="eventId">
            <div class="space-y-5">
                <div>
                    <label class="block text-sm text-zinc-400 mb-1">Title</label>
                    <input id="eventTitle" type="text" class="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 focus:outline-none focus:border-violet-500 transition" placeholder="Lunch with Alex tomorrow 12pm">
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm text-zinc-400 mb-1">Start Date</label>
                        <input id="eventDate" type="date" class="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 focus:outline-none focus:border-violet-500 transition">
                    </div>
                    <div>
                        <label class="block text-sm text-zinc-400 mb-1">End Date</label>
                        <input id="eventEndDate" type="date" class="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 focus:outline-none focus:border-violet-500 transition" placeholder="Same as start">
                    </div>
                </div>
                <div>
                    <label class="block text-sm text-zinc-400 mb-1">Type</label>
                    <select id="eventType" class="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 focus:outline-none focus:border-violet-500 transition">
                        <option value="task">Task</option>
                        <option value="meeting">Meeting</option>
                        <option value="deadline">Deadline</option>
                    </select>
                </div>
                <div class="flex items-center gap-3">
                    <label class="text-sm text-zinc-400">All day</label>
                    <input id="eventAllDay" type="checkbox" class="w-4 h-4 accent-violet-500" onchange="toggleAllDay()">
                </div>
                <div id="timeFields" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm text-zinc-400 mb-1">Start Time</label>
                        <div class="flex gap-1">
                            <select id="eventStartHour" class="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-3 py-3 focus:outline-none focus:border-violet-500 transition"></select>
                            <span class="self-center text-zinc-500">:</span>
                            <select id="eventStartMin" class="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-3 py-3 focus:outline-none focus:border-violet-500 transition"></select>
                        </div>
                        <input type="hidden" id="eventStart">
                    </div>
                    <div>
                        <label class="block text-sm text-zinc-400 mb-1">End Time</label>
                        <div class="flex gap-1">
                            <select id="eventEndHour" class="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-3 py-3 focus:outline-none focus:border-violet-500 transition"></select>
                            <span class="self-center text-zinc-500">:</span>
                            <select id="eventEndMin" class="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-3 py-3 focus:outline-none focus:border-violet-500 transition"></select>
                        </div>
                        <input type="hidden" id="eventEnd">
                    </div>
                </div>
                <div>
                    <label class="block text-sm text-zinc-400 mb-1">Recurrence</label>
                    <select id="eventRecurrence" class="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 focus:outline-none focus:border-violet-500 transition">
                        <option value="none">Does not repeat</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="biweekly">Every 2 weeks</option>
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                    </select>
                </div>
                <div id="recurrenceIntervalFields" class="hidden grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm text-zinc-400 mb-1">Every N</label>
                        <input id="eventRecurrenceInterval" type="number" min="1" max="52" value="1" class="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 focus:outline-none focus:border-violet-500 transition">
                    </div>
                    <div>
                        <label class="block text-sm text-zinc-400 mb-1">On days</label>
                        <div id="recurrenceBydayPicker" class="flex flex-wrap gap-1 mt-1">
                            <button type="button" onclick="toggleByday('MO')" data-day="MO" class="w-8 h-8 text-xs rounded-lg bg-zinc-800 hover:bg-zinc-700 transition">M</button>
                            <button type="button" onclick="toggleByday('TU')" data-day="TU" class="w-8 h-8 text-xs rounded-lg bg-zinc-800 hover:bg-zinc-700 transition">T</button>
                            <button type="button" onclick="toggleByday('WE')" data-day="WE" class="w-8 h-8 text-xs rounded-lg bg-zinc-800 hover:bg-zinc-700 transition">W</button>
                            <button type="button" onclick="toggleByday('TH')" data-day="TH" class="w-8 h-8 text-xs rounded-lg bg-zinc-800 hover:bg-zinc-700 transition">T</button>
                            <button type="button" onclick="toggleByday('FR')" data-day="FR" class="w-8 h-8 text-xs rounded-lg bg-zinc-800 hover:bg-zinc-700 transition">F</button>
                            <button type="button" onclick="toggleByday('SA')" data-day="SA" class="w-8 h-8 text-xs rounded-lg bg-zinc-800 hover:bg-zinc-700 transition">S</button>
                            <button type="button" onclick="toggleByday('SU')" data-day="SU" class="w-8 h-8 text-xs rounded-lg bg-zinc-800 hover:bg-zinc-700 transition">S</button>
                        </div>
                    </div>
                </div>
                <div id="recurrenceEndFields" class="hidden">
                    <label class="block text-sm text-zinc-400 mb-1">Repeat until</label>
                    <input id="eventRecurrenceEnd" type="date" class="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 focus:outline-none focus:border-violet-500 transition">
                </div>
                <div>
                    <label class="block text-sm text-zinc-400 mb-1">Description</label>
                    <textarea id="eventDesc" rows="3" class="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 focus:outline-none focus:border-violet-500 transition resize-none"></textarea>
                </div>
                <div>
                    <label class="block text-sm text-zinc-400 mb-1">Color</label>
                    <div id="colorPicker" class="flex gap-2 flex-wrap">
                        <button type="button" onclick="pickColor('violet')" class="w-8 h-8 rounded-full bg-violet-500 border-2 border-transparent hover:border-white transition" data-color="violet"></button>
                        <button type="button" onclick="pickColor('blue')" class="w-8 h-8 rounded-full bg-blue-500 border-2 border-transparent hover:border-white transition" data-color="blue"></button>
                        <button type="button" onclick="pickColor('emerald')" class="w-8 h-8 rounded-full bg-emerald-500 border-2 border-transparent hover:border-white transition" data-color="emerald"></button>
                        <button type="button" onclick="pickColor('amber')" class="w-8 h-8 rounded-full bg-amber-500 border-2 border-transparent hover:border-white transition" data-color="amber"></button>
                        <button type="button" onclick="pickColor('red')" class="w-8 h-8 rounded-full bg-red-500 border-2 border-transparent hover:border-white transition" data-color="red"></button>
                        <button type="button" onclick="pickColor('pink')" class="w-8 h-8 rounded-full bg-pink-500 border-2 border-transparent hover:border-white transition" data-color="pink"></button>
                        <button type="button" onclick="pickColor('cyan')" class="w-8 h-8 rounded-full bg-cyan-500 border-2 border-transparent hover:border-white transition" data-color="cyan"></button>
                        <button type="button" onclick="pickColor('orange')" class="w-8 h-8 rounded-full bg-orange-500 border-2 border-transparent hover:border-white transition" data-color="orange"></button>
                    </div>
                </div>
            </div>
            <div class="mt-8 flex gap-3">
                <button onclick="closeModal()" class="flex-1 py-3 rounded-2xl border border-zinc-700 hover:bg-zinc-800 transition">Cancel</button>
                <button id="deleteBtn" onclick="deleteEvent()" class="py-3 px-4 rounded-2xl border border-red-800 text-red-400 hover:bg-red-900/30 transition hidden">Delete</button>
                <button onclick="saveEvent()" class="flex-1 py-3 bg-violet-600 hover:bg-violet-500 rounded-2xl font-semibold transition">Save</button>
            </div>
        </div>
    </div>

    <div id="importModal" class="hidden fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 modal-backdrop">
        <div class="bg-zinc-900 rounded-3xl w-full max-w-lg p-8 modal-content">
            <h3 class="text-2xl font-bold mb-6">Import ICS</h3>
            <div class="space-y-4">
                <div>
                    <label class="block text-sm text-zinc-400 mb-1">Import from URL</label>
                    <div class="flex gap-2">
                        <input id="icsUrl" type="url" placeholder="https://calendar.google.com/calendar/ical/.../basic.ics" class="flex-1 bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 focus:outline-none focus:border-violet-500 transition text-sm">
                        <button onclick="importICSUrl()" class="bg-violet-600 hover:bg-violet-500 px-5 py-3 rounded-2xl text-sm font-medium transition whitespace-nowrap">Fetch</button>
                    </div>
                </div>
                <div class="flex items-center gap-4 text-zinc-600">
                    <div class="flex-1 h-px bg-zinc-800"></div>
                    <span class="text-xs">or</span>
                    <div class="flex-1 h-px bg-zinc-800"></div>
                </div>
                <div>
                    <label class="block text-sm text-zinc-400 mb-1">Paste ICS content</label>
                    <textarea id="icsContent" rows="6" class="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 focus:outline-none focus:border-violet-500 transition resize-none text-sm font-mono"></textarea>
                </div>
                <div>
                    <label class="block text-sm text-zinc-400 mb-2">Or upload a .ics file</label>
                    <input id="icsFile" type="file" accept=".ics" class="w-full text-sm text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-violet-600 file:text-white hover:file:bg-violet-500">
                </div>
                <div id="importStatus" class="text-sm text-zinc-400"></div>
            </div>
            <div class="mt-6 flex gap-3">
                <button onclick="closeImportModal()" class="flex-1 py-3 rounded-2xl border border-zinc-700 hover:bg-zinc-800 transition">Cancel</button>
                <button onclick="importICS()" class="flex-1 py-3 bg-violet-600 hover:bg-violet-500 rounded-2xl font-semibold transition">Import</button>
            </div>
        </div>
    </div>

    <div id="keyboardHelpModal" class="hidden fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 modal-backdrop">
        <div class="bg-zinc-900 rounded-3xl w-full max-w-md p-8 modal-content">
            <h3 class="text-xl font-bold mb-4">Keyboard Shortcuts</h3>
            <div class="space-y-2 text-sm">
                <div class="flex justify-between"><span>New event</span><span class="kbd">N</span></div>
                <div class="flex justify-between"><span>Today</span><span class="kbd">T</span></div>
                <div class="flex justify-between"><span>Previous</span><span class="kbd">←</span></div>
                <div class="flex justify-between"><span>Next</span><span class="kbd">→</span></div>
                <div class="flex justify-between"><span>Week view</span><span class="kbd">W</span></div>
                <div class="flex justify-between"><span>Month view</span><span class="kbd">M</span></div>
                <div class="flex justify-between"><span>Focus search</span><span class="kbd">/</span></div>
                <div class="flex justify-between"><span>Close modal</span><span class="kbd">Esc</span></div>
            </div>
            <button onclick="closeKeyboardHelp()" class="mt-6 w-full py-3 bg-violet-600 hover:bg-violet-500 rounded-2xl font-semibold transition">Got it</button>
        </div>
    </div>

    <div id="manageModal" class="hidden fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 modal-backdrop">
        <div class="bg-zinc-900 rounded-3xl w-full max-w-2xl p-8 modal-content max-h-[85vh] flex flex-col">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-bold">Manage Events</h3>
                <div class="flex items-center gap-3">
                    <button onclick="manageSelectAll()" class="text-xs bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-full transition">Select All</button>
                    <button onclick="manageSelectNone()" class="text-xs bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-full transition">Deselect</button>
                    <button onclick="closeManageModal()" class="p-2 hover:bg-zinc-800 rounded-lg">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>
            </div>
            <div id="manageFilterBar" class="flex gap-1.5 mb-3 flex-wrap">
                <button onclick="manageFilter('all')" data-mfilter="all" class="text-xs px-2.5 py-1 rounded-full bg-zinc-700 text-white transition">All</button>
                <button onclick="manageFilter('task')" data-mfilter="task" class="text-xs px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400 transition">Tasks</button>
                <button onclick="manageFilter('meeting')" data-mfilter="meeting" class="text-xs px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400 transition">Meetings</button>
                <button onclick="manageFilter('deadline')" data-mfilter="deadline" class="text-xs px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400 transition">Deadlines</button>
                <button onclick="manageFilter('imported')" data-mfilter="imported" class="text-xs px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400 transition">Imported</button>
            </div>
            <div id="manageList" class="flex-1 overflow-y-auto scrollbar-thin space-y-1 mb-4">
            </div>
            <div class="flex items-center justify-between">
                <span id="manageSelectedCount" class="text-sm text-zinc-400">0 selected</span>
                <button id="manageDeleteBtn" onclick="manageDeleteSelected()" class="px-6 py-2.5 rounded-2xl border border-red-800 text-red-400 hover:bg-red-900/30 transition font-medium opacity-50 cursor-not-allowed" disabled>Delete Selected</button>
            </div>
        </div>
    </div>

    <div id="toastContainer" class="fixed bottom-20 md:bottom-6 right-6 z-50 space-y-2 no-print"></div>

    <div id="mobileSidebarOverlay" class="hidden fixed inset-0 bg-black/60 z-40" onclick="toggleMobileSidebar()"></div>
    <div id="mobileSidebar" class="fixed right-0 top-0 bottom-0 w-80 max-w-full bg-zinc-900 z-50 transform translate-x-full transition-transform duration-200 overflow-y-auto scrollbar-thin no-print">
        <div class="p-4 border-b border-zinc-800 flex justify-between items-center">
            <h3 class="font-semibold text-lg">Events</h3>
            <button onclick="toggleMobileSidebar()" class="p-2 hover:bg-zinc-800 rounded-lg">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        </div>
        <div id="mobileSidebarEvents" class="p-4 space-y-2"></div>
    </div>

    <script>
        window.appUsername = "<?= htmlspecialchars($username) ?>";
        window.csrfToken = "<?= htmlspecialchars($csrfToken) ?>";
        <?php if ($demoMode): ?>
        window.isDemo = true;
        <?php else: ?>
        window.isDemo = false;
        <?php endif; ?>
    </script>
    <script src="js/app.js"></script>
</body>
</html>