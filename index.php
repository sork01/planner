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
    </style>
</head>
<body class="bg-zinc-950 text-zinc-100 min-h-screen flex flex-col">

    <?php if ($demoMode): ?>
    <div class="bg-amber-600 text-center py-2 text-sm font-medium">
        Demo mode &mdash; changes are not saved. <a href="/sso/?redirect=/planner/" class="underline">Log in</a> to save your own events.
    </div>
    <?php endif; ?>

    <div class="flex flex-col h-screen">
        <div class="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex justify-between items-center shrink-0">
            <div class="flex items-center gap-3">
                <div class="w-9 h-9 bg-violet-500 rounded-2xl flex items-center justify-center text-xl">📅</div>
                <h1 class="text-2xl font-semibold">Planner</h1>
                <span class="text-sm text-zinc-400 ml-2"><?= $displayName ?></span>
            </div>
            <div class="flex items-center gap-3">
                <div class="flex items-center bg-zinc-800 rounded-full overflow-hidden">
                    <button id="btnWeek" onclick="setView('week')" class="px-4 py-2 text-sm font-medium transition">Week</button>
                    <button id="btnMonth" onclick="setView('month')" class="px-4 py-2 text-sm font-medium transition">Month</button>
                </div>
                <button onclick="goToday()" class="text-sm bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-full transition">Today</button>
                <div class="flex items-center gap-1">
                    <button onclick="navPrev()" class="p-2 hover:bg-zinc-800 rounded-lg transition">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                    </button>
                    <button onclick="navNext()" class="p-2 hover:bg-zinc-800 rounded-lg transition">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                    </button>
                </div>
                <h2 id="navTitle" class="text-lg font-medium min-w-[200px] text-center"></h2>
                <?php if ($demoMode): ?>
                <a href="/sso/?redirect=<?= urlencode('/planner/') ?>" class="text-blue-400 hover:text-blue-300 text-sm ml-4">Log in</a>
                <?php else: ?>
                <form method="POST" action="/sso/" class="inline ml-4"><input type="hidden" name="logout" value="1"><input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrfToken) ?>"><input type="hidden" name="redirect" value="/planner/"><button type="submit" class="text-red-400 hover:text-red-300 text-sm">Logout</button></form>
                <?php endif; ?>
            </div>
        </div>

        <div class="flex flex-1 overflow-hidden">
            <div id="calendarArea" class="flex-1 overflow-hidden flex flex-col">
                <div id="weekView" class="flex-1 overflow-hidden flex flex-col">
                    <div class="grid grid-cols-8 border-b border-zinc-800 bg-zinc-900 shrink-0">
                        <div class="py-2 px-1 text-xs text-zinc-500 text-center">Time</div>
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

            <div class="w-80 bg-zinc-900 border-l border-zinc-800 flex flex-col shrink-0">
                <div class="p-4 border-b border-zinc-800 flex justify-between items-center">
                    <h3 class="font-semibold text-lg">Events</h3>
                    <button onclick="openAddModal()" class="bg-violet-600 hover:bg-violet-500 px-4 py-2 rounded-full text-sm font-medium transition">+ Add</button>
                </div>
                <div id="sidebarEvents" class="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-2">
                </div>
            </div>
        </div>
    </div>

    <div id="eventModal" class="hidden fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 modal-backdrop">
        <div class="bg-zinc-900 rounded-3xl w-full max-w-lg p-8 modal-content">
            <h3 id="modalTitle" class="text-2xl font-bold mb-6">Add Event</h3>
            <input type="hidden" id="eventId">
            <div class="space-y-5">
                <div>
                    <label class="block text-sm text-zinc-400 mb-1">Title</label>
                    <input id="eventTitle" type="text" class="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 focus:outline-none focus:border-violet-500 transition">
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm text-zinc-400 mb-1">Date</label>
                        <input id="eventDate" type="date" class="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 focus:outline-none focus:border-violet-500 transition">
                    </div>
                    <div>
                        <label class="block text-sm text-zinc-400 mb-1">Type</label>
                        <select id="eventType" class="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 focus:outline-none focus:border-violet-500 transition">
                            <option value="task">Task</option>
                            <option value="meeting">Meeting</option>
                            <option value="deadline">Deadline</option>
                        </select>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm text-zinc-400 mb-1">Start Time</label>
                        <input id="eventStart" type="time" class="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 focus:outline-none focus:border-violet-500 transition">
                    </div>
                    <div>
                        <label class="block text-sm text-zinc-400 mb-1">End Time</label>
                        <input id="eventEnd" type="time" class="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 focus:outline-none focus:border-violet-500 transition">
                    </div>
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