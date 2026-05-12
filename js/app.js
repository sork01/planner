(function() {
    const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const TYPE_COLORS = {
        task: 'violet',
        meeting: 'blue',
        deadline: 'red'
    };
    const COLOR_MAP = {
        violet: { bg: 'rgba(139, 92, 246, 0.25)', border: '#8b5cf6', text: '#c4b5fd' },
        blue: { bg: 'rgba(59, 130, 246, 0.25)', border: '#3b82f6', text: '#93c5fd' },
        emerald: { bg: 'rgba(16, 185, 129, 0.25)', border: '#10b981', text: '#6ee7b7' },
        amber: { bg: 'rgba(245, 158, 11, 0.25)', border: '#f59e0b', text: '#fcd34d' },
        red: { bg: 'rgba(239, 68, 68, 0.25)', border: '#ef4444', text: '#fca5a5' },
        pink: { bg: 'rgba(236, 72, 153, 0.25)', border: '#ec4899', text: '#f9a8d4' },
        cyan: { bg: 'rgba(6, 182, 212, 0.25)', border: '#06b6d4', text: '#67e8f9' },
        orange: { bg: 'rgba(249, 115, 22, 0.25)', border: '#f97316', text: '#fdba74' }
    };
    const TYPE_ICONS = { task: '☑', meeting: '👥', deadline: '⏰' };
    const START_HOUR = 6;
    const END_HOUR = 23;
    const SLOT_HEIGHT = 52;

    let events = [];
    let currentView = 'week';
    let currentDate = new Date();
    let selectedColor = 'violet';

    function getMonday(d) {
        d = new Date(d);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function formatDate(d) {
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function formatTime(timeStr) {
        if (!timeStr) return '';
        const [h, m] = timeStr.split(':').map(Number);
        const suffix = h >= 12 ? 'PM' : 'AM';
        const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
        return h12 + ':' + String(m).padStart(2, '0') + ' ' + suffix;
    }

    function sameDay(a, b) {
        return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    }

    function isToday(d) {
        return sameDay(d, new Date());
    }

    function escHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    async function apiCall(action, data) {
        if (window.isDemo) {
            if (action === 'add') {
                data.event.id = uniqId();
                data.event.created_at = new Date().toISOString();
                events.push(data.event);
                renderAll();
                return { status: 'success', event: data.event };
            }
            if (action === 'update') {
                const idx = events.findIndex(e => e.id === data.id);
                if (idx !== -1) { events[idx] = data.event; renderAll(); }
                return { status: 'success' };
            }
            if (action === 'delete') {
                events = events.filter(e => e.id !== data.id);
                renderAll();
                return { status: 'success' };
            }
        }
        const resp = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.csrfToken },
            body: JSON.stringify({ action, ...data })
        });
        return resp.json();
    }

    function uniqId() {
        return 'evt_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }

    async function loadEvents() {
        if (window.isDemo) {
            const now = new Date();
            const today = formatDate(now);
            const tomorrow = formatDate(new Date(now.getTime() + 86400000));
            const dayAfter = formatDate(new Date(now.getTime() + 2 * 86400000));
            const yesterday = formatDate(new Date(now.getTime() - 86400000));
            events = [
                { id: 'd1', title: 'Team standup', date: today, type: 'meeting', start_time: '09:00', end_time: '09:30', description: 'Daily sync', color: 'blue', created_at: '' },
                { id: 'd2', title: 'Review PRs', date: today, type: 'task', start_time: '10:00', end_time: '11:30', description: 'Review open pull requests', color: 'violet', created_at: '' },
                { id: 'd3', title: 'Project deadline', date: tomorrow, type: 'deadline', start_time: '17:00', end_time: '', description: 'Submit final deliverables', color: 'red', created_at: '' },
                { id: 'd4', title: 'Lunch with Alex', date: tomorrow, type: 'meeting', start_time: '12:00', end_time: '13:00', description: '', color: 'emerald', created_at: '' },
                { id: 'd5', title: 'Write docs', date: dayAfter, type: 'task', start_time: '14:00', end_time: '16:00', description: 'API documentation', color: 'amber', created_at: '' },
                { id: 'd6', title: 'Gym', date: yesterday, type: 'task', start_time: '07:00', end_time: '08:00', description: 'Morning workout', color: 'cyan', created_at: '' },
            ];
            return;
        }
        const resp = await fetch('api.php', {
            headers: { 'X-CSRF-Token': window.csrfToken }
        });
        const data = await resp.json();
        events = data.events || [];
    }

    function setView(view) {
        currentView = view;
        document.getElementById('btnWeek').className = 'px-4 py-2 text-sm font-medium transition ' +
            (view === 'week' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white');
        document.getElementById('btnMonth').className = 'px-4 py-2 text-sm font-medium transition ' +
            (view === 'month' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white');
        document.getElementById('weekView').classList.toggle('hidden', view !== 'week');
        document.getElementById('monthView').classList.toggle('hidden', view !== 'month');
        renderAll();
    }

    function navPrev() {
        if (currentView === 'week') {
            currentDate = new Date(currentDate.getTime() - 7 * 86400000);
        } else {
            currentDate.setMonth(currentDate.getMonth() - 1);
        }
        renderAll();
    }

    function navNext() {
        if (currentView === 'week') {
            currentDate = new Date(currentDate.getTime() + 7 * 86400000);
        } else {
            currentDate.setMonth(currentDate.getMonth() + 1);
        }
        renderAll();
    }

    function goToday() {
        currentDate = new Date();
        renderAll();
    }

    function renderNavTitle() {
        const el = document.getElementById('navTitle');
        if (currentView === 'week') {
            const mon = getMonday(currentDate);
            const sun = new Date(mon.getTime() + 6 * 86400000);
            if (mon.getMonth() === sun.getMonth()) {
                el.textContent = mon.toLocaleDateString('en-US', { month: 'long' }) + ' ' + mon.getDate() + ' – ' + sun.getDate() + ', ' + mon.getFullYear();
            } else {
                el.textContent = mon.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' – ' + sun.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + sun.getFullYear();
            }
        } else {
            el.textContent = MONTH_NAMES[currentDate.getMonth()] + ' ' + currentDate.getFullYear();
        }
    }

    function getEventsForDate(dateStr) {
        return events.filter(e => e.date === dateStr).sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
    }

    function renderWeekHeaders() {
        const mon = getMonday(currentDate);
        for (let i = 0; i < 7; i++) {
            const d = new Date(mon.getTime() + i * 86400000);
            const el = document.getElementById('dayHead' + i);
            const today = isToday(d);
            el.className = 'py-2 px-1 text-center text-sm week-day-header' + (today ? ' is-today font-semibold' : ' text-zinc-400');
            el.innerHTML = '<span class="block text-xs">' + DAY_NAMES[i] + '</span>' +
                '<span class="block text-lg' + (today ? ' bg-violet-600 rounded-full w-8 h-8 leading-8 mx-auto' : '') + '">' + d.getDate() + '</span>';
        }
    }

    function renderWeekView() {
        renderWeekHeaders();
        const grid = document.getElementById('weekGrid');
        const mon = getMonday(currentDate);
        const now = new Date();
        let html = '<div class="grid grid-cols-8 relative">';

        html += '<div class="border-r border-zinc-800">';
        for (let h = START_HOUR; h < END_HOUR; h++) {
            html += '<div class="h-[' + SLOT_HEIGHT + 'px] text-xs text-zinc-500 text-right pr-2 pt-1">' +
                (h === 0 ? '12 AM' : h < 12 ? h + ' AM' : h === 12 ? '12 PM' : (h - 12) + ' PM') +
                '</div>';
        }
        html += '</div>';

        for (let col = 0; col < 7; col++) {
            const d = new Date(mon.getTime() + col * 86400000);
            const dateStr = formatDate(d);
            const dayEvents = getEventsForDate(dateStr);
            const todayClass = isToday(d) ? ' bg-zinc-900/50' : '';

            html += '<div class="border-r border-zinc-800 relative' + todayClass + '">';

            for (let h = START_HOUR; h < END_HOUR; h++) {
                const isNowLine = isToday(d) && now.getHours() === h;
                html += '<div class="h-[' + SLOT_HEIGHT + 'px] border-t border-zinc-800/50 time-slot relative cursor-pointer" data-date="' + dateStr + '" data-hour="' + h + '" onclick="window._addAtSlot(this)">';
                if (isNowLine) {
                    const mins = now.getMinutes();
                    html += '<div class="absolute left-0 right-0 z-10" style="top:' + (mins / 60 * SLOT_HEIGHT) + 'px"><div class="h-px bg-red-500 w-full"></div><div class="w-2 h-2 rounded-full bg-red-500 absolute -left-1 -top-1"></div></div>';
                }
                html += '</div>';
            }

            for (const evt of dayEvents) {
                const color = COLOR_MAP[evt.color || TYPE_COLORS[evt.type]] || COLOR_MAP.violet;
                const startH = evt.start_time ? parseInt(evt.start_time.split(':')[0]) : 0;
                const startM = evt.start_time ? parseInt(evt.start_time.split(':')[1]) : 0;
                const endH = evt.end_time ? parseInt(evt.end_time.split(':')[0]) : startH + 1;
                const endM = evt.end_time ? parseInt(evt.end_time.split(':')[1]) : 0;

                const topOffset = Math.max(0, (startH - START_HOUR) * SLOT_HEIGHT + (startM / 60) * SLOT_HEIGHT);
                const height = Math.max(SLOT_HEIGHT / 2, ((endH - startH) * SLOT_HEIGHT + ((endM - startM) / 60) * SLOT_HEIGHT));
                const bottomBound = (END_HOUR - START_HOUR) * SLOT_HEIGHT;
                const clampedTop = Math.min(topOffset, bottomBound - 20);
                const clampedHeight = Math.min(height, bottomBound - clampedTop);
                const timeLabel = (evt.start_time ? formatTime(evt.start_time) : '') + (evt.end_time ? ' – ' + formatTime(evt.end_time) : '');

                html += '<div class="cal-event absolute left-1 right-1 rounded-lg px-2 py-1 text-xs overflow-hidden z-20 cursor-pointer" ' +
                    'style="top:' + clampedTop + 'px;height:' + clampedHeight + 'px;background:' + color.bg + ';border-left:3px solid ' + color.border + ';" ' +
                    'onclick="window._editEvent(\'' + evt.id + '\')" title="' + escHtml(evt.title) + '">' +
                    '<div class="font-medium truncate" style="color:' + color.text + '">' + TYPE_ICONS[evt.type] + ' ' + escHtml(evt.title) + '</div>' +
                    (timeLabel ? '<div class="text-zinc-400 truncate">' + timeLabel + '</div>' : '') +
                    '</div>';
            }

            html += '</div>';
        }

        html += '</div>';
        grid.innerHTML = html;

        const nowHour = now.getHours();
        if (nowHour >= START_HOUR && nowHour <= END_HOUR && isToday(new Date())) {
            const today = new Date();
            const monday = getMonday(currentDate);
            const todayDayIdx = (today.getDay() + 6) % 7;
            grid.scrollTop = Math.max(0, (nowHour - START_HOUR - 1) * SLOT_HEIGHT);
        } else {
            grid.scrollTop = (8 - START_HOUR) * SLOT_HEIGHT;
        }
    }

    function renderMonthView() {
        const container = document.getElementById('monthView');
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDow = (firstDay.getDay() + 6) % 7;
        const daysInMonth = lastDay.getDate();
        const prevMonthLast = new Date(year, month, 0).getDate();

        let html = '<div class="grid grid-cols-7 border-b border-zinc-800 bg-zinc-900">';
        DAY_NAMES.forEach(d => {
            html += '<div class="py-2 text-center text-xs text-zinc-500 font-medium">' + d + '</div>';
        });
        html += '</div><div class="grid grid-cols-7">';

        const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;
        for (let i = 0; i < totalCells; i++) {
            let dayNum, dateStr, isCurrentMonth;
            if (i < startDow) {
                dayNum = prevMonthLast - startDow + i + 1;
                const d = new Date(year, month - 1, dayNum);
                dateStr = formatDate(d);
                isCurrentMonth = false;
            } else if (i >= startDow + daysInMonth) {
                dayNum = i - startDow - daysInMonth + 1;
                const d = new Date(year, month + 1, dayNum);
                dateStr = formatDate(d);
                isCurrentMonth = false;
            } else {
                dayNum = i - startDow + 1;
                dateStr = formatDate(new Date(year, month, dayNum));
                isCurrentMonth = true;
            }

            const dayEvents = getEventsForDate(dateStr);
            const todayClass = isCurrentMonth && isToday(new Date(dateStr)) ? ' is-today' : '';
            const opacityClass = isCurrentMonth ? '' : ' opacity-40';
            const minH = dayEvents.length > 2 ? 'min-h-[120px]' : 'min-h-[90px]';

            html += '<div class="border-t border-r border-zinc-800 p-1.5 month-day cursor-pointer' + todayClass + opacityClass + '" onclick="window._addAtDate(\'' + dateStr + '\')">';
            html += '<div class="text-sm font-medium mb-1">' + dayNum + '</div>';
            dayEvents.slice(0, 3).forEach(evt => {
                const color = COLOR_MAP[evt.color || TYPE_COLORS[evt.type]] || COLOR_MAP.violet;
                html += '<div class="text-xs px-1.5 py-0.5 rounded truncate mb-0.5 cursor-pointer cal-event" ' +
                    'style="background:' + color.bg + ';color:' + color.text + ';border-left:2px solid ' + color.border + ';" ' +
                    'onclick="event.stopPropagation();window._editEvent(\'' + evt.id + '\')">' +
                    TYPE_ICONS[evt.type] + ' ' + escHtml(evt.title) + '</div>';
            });
            if (dayEvents.length > 3) {
                html += '<div class="text-xs text-zinc-400">+' + (dayEvents.length - 3) + ' more</div>';
            }
            html += '</div>';
        }
        html += '</div>';
        container.innerHTML = html;
    }

    function renderSidebar() {
        const container = document.getElementById('sidebarEvents');
        const today = formatDate(new Date());

        let todayEvents = getEventsForDate(today);
        let upcoming = events.filter(e => e.date > today).sort((a, b) => a.date.localeCompare(b.date) || (a.start_time || '').localeCompare(b.start_time || ''));
        let overdue = events.filter(e => e.date < today && e.type === 'deadline').sort((a, b) => a.date.localeCompare(b.date));

        let html = '';

        if (overdue.length) {
            html += '<div class="mb-6">';
            html += '<h4 class="text-sm font-semibold text-red-400 mb-2 uppercase tracking-wider">Overdue</h4>';
            overdue.forEach(evt => {
                html += renderSidebarEvent(evt);
            });
            html += '</div>';
        }

        html += '<div class="mb-6">';
        html += '<h4 class="text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Today</h4>';
        if (todayEvents.length === 0) {
            html += '<p class="text-sm text-zinc-600">No events today</p>';
        } else {
            todayEvents.forEach(evt => {
                html += renderSidebarEvent(evt);
            });
        }
        html += '</div>';

        html += '<div>';
        html += '<h4 class="text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Upcoming</h4>';
        if (upcoming.length === 0) {
            html += '<p class="text-sm text-zinc-600">No upcoming events</p>';
        } else {
            upcoming.slice(0, 10).forEach(evt => {
                html += renderSidebarEvent(evt);
            });
        }
        html += '</div>';

        container.innerHTML = html;
    }

    function renderSidebarEvent(evt) {
        const color = COLOR_MAP[evt.color || TYPE_COLORS[evt.type]] || COLOR_MAP.violet;
        const timeLabel = evt.start_time ? formatTime(evt.start_time) + (evt.end_time ? ' – ' + formatTime(evt.end_time) : '') : '';
        return '<div class="p-3 rounded-xl cursor-pointer hover:bg-zinc-800 transition cal-event" ' +
            'style="border-left:3px solid ' + color.border + ';" ' +
            'onclick="window._editEvent(\'' + evt.id + '\')">' +
            '<div class="font-medium text-sm" style="color:' + color.text + '">' + TYPE_ICONS[evt.type] + ' ' + escHtml(evt.title) + '</div>' +
            '<div class="text-xs text-zinc-500 mt-0.5">' + evt.date + (timeLabel ? ' · ' + timeLabel : '') + '</div>' +
            (evt.description ? '<div class="text-xs text-zinc-500 mt-0.5 truncate">' + escHtml(evt.description) + '</div>' : '') +
            '</div>';
    }

    function renderAll() {
        renderNavTitle();
        if (currentView === 'week') {
            renderWeekView();
        } else {
            renderMonthView();
        }
        renderSidebar();
    }

    function openAddModal(date, hour) {
        document.getElementById('modalTitle').textContent = 'Add Event';
        document.getElementById('eventId').value = '';
        document.getElementById('eventTitle').value = '';
        document.getElementById('eventDate').value = date || formatDate(new Date());
        document.getElementById('eventType').value = 'task';
        document.getElementById('eventStart').value = hour !== undefined ? String(hour).padStart(2, '0') + ':00' : '09:00';
        document.getElementById('eventEnd').value = hour !== undefined ? String(hour + 1).padStart(2, '0') + ':00' : '10:00';
        document.getElementById('eventDesc').value = '';
        document.getElementById('deleteBtn').classList.add('hidden');
        pickColor('violet');
        document.getElementById('eventModal').classList.remove('hidden');
    }

    function openEditModal(id) {
        const evt = events.find(e => e.id === id);
        if (!evt) return;
        document.getElementById('modalTitle').textContent = 'Edit Event';
        document.getElementById('eventId').value = evt.id;
        document.getElementById('eventTitle').value = evt.title;
        document.getElementById('eventDate').value = evt.date;
        document.getElementById('eventType').value = evt.type;
        document.getElementById('eventStart').value = evt.start_time || '';
        document.getElementById('eventEnd').value = evt.end_time || '';
        document.getElementById('eventDesc').value = evt.description || '';
        document.getElementById('deleteBtn').classList.remove('hidden');
        pickColor(evt.color || TYPE_COLORS[evt.type]);
        document.getElementById('eventModal').classList.remove('hidden');
    }

    function closeModal() {
        document.getElementById('eventModal').classList.add('hidden');
    }

    function pickColor(color) {
        selectedColor = color;
        document.querySelectorAll('#colorPicker button').forEach(btn => {
            btn.classList.toggle('ring-2', btn.dataset.color === color);
            btn.classList.toggle('ring-white', btn.dataset.color === color);
            btn.classList.toggle('ring-offset-2', btn.dataset.color === color);
            btn.classList.toggle('ring-offset-zinc-900', btn.dataset.color === color);
        });
    }

    async function saveEvent() {
        const id = document.getElementById('eventId').value;
        const evt = {
            title: document.getElementById('eventTitle').value.trim(),
            date: document.getElementById('eventDate').value,
            type: document.getElementById('eventType').value,
            start_time: document.getElementById('eventStart').value,
            end_time: document.getElementById('eventEnd').value,
            description: document.getElementById('eventDesc').value.trim(),
            color: selectedColor
        };

        if (!evt.title || !evt.date) {
            alert('Please fill in the title and date.');
            return;
        }

        if (id) {
            const result = await apiCall('update', { id, event: evt });
            if (result.status === 'success') {
                const idx = events.findIndex(e => e.id === id);
                if (idx !== -1) events[idx] = { ...evt, id, created_at: events[idx].created_at };
            }
        } else {
            const result = await apiCall('add', { event: evt });
            if (result.status === 'success' && result.event) {
                events.push(result.event);
            }
        }

        closeModal();
        renderAll();
    }

    async function deleteEvent() {
        const id = document.getElementById('eventId').value;
        if (!id) return;
        if (!confirm('Delete this event?')) return;
        await apiCall('delete', { id });
        events = events.filter(e => e.id !== id);
        closeModal();
        renderAll();
    }

    window._addAtSlot = function(el) {
        const date = el.dataset.date;
        const hour = parseInt(el.dataset.hour);
        openAddModal(date, hour);
    };

    window._addAtDate = function(date) {
        openAddModal(date);
    };

    window._editEvent = function(id) {
        openEditModal(id);
    };

    window.addView = setView;
    window.navPrev = navPrev;
    window.navNext = navNext;
    window.goToday = goToday;
    window.openAddModal = openAddModal;
    window.closeModal = closeModal;
    window.pickColor = pickColor;
    window.saveEvent = saveEvent;
    window.deleteEvent = deleteEvent;
    window.setView = setView;

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeModal();
    });

    document.getElementById('eventModal').addEventListener('click', function(e) {
        if (e.target === this) closeModal();
    });

    async function init() {
        await loadEvents();
        setView('week');
    }

    init();
})();