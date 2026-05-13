(function() {
    const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const DAY_NAMES_SHORT = ['M','T','W','T','F','S','S'];
    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const TYPE_COLORS = { task: 'violet', meeting: 'blue', deadline: 'red' };
    const TYPE_ICONS = { task: '☑', meeting: '👥', deadline: '⏰' };
    const COLOR_MAP = {
        violet: { bg: 'rgba(139,92,246,0.25)', border: '#8b5cf6', text: '#c4b5fd' },
        blue: { bg: 'rgba(59,130,246,0.25)', border: '#3b82f6', text: '#93c5fd' },
        emerald: { bg: 'rgba(16,185,129,0.25)', border: '#10b981', text: '#6ee7b7' },
        amber: { bg: 'rgba(245,158,11,0.25)', border: '#f59e0b', text: '#fcd34d' },
        red: { bg: 'rgba(239,68,68,0.25)', border: '#ef4444', text: '#fca5a5' },
        pink: { bg: 'rgba(236,72,153,0.25)', border: '#ec4899', text: '#f9a8d4' },
        cyan: { bg: 'rgba(6,182,212,0.25)', border: '#06b6d4', text: '#67e8f9' },
        orange: { bg: 'rgba(249,115,22,0.25)', border: '#f97316', text: '#fdba74' }
    };
    const START_HOUR = 6;
    const END_HOUR = 23;
    const SLOT_HEIGHT = 52;
    const MOBILE_SLOT_HEIGHT = 40;
    const RECURRENCE_LABELS = { none: 'Does not repeat', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };
    const DAY_ABBR = { SU: 'Sun', MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat' };

    function isMobile() { return window.innerWidth <= 768; }

    function recurrenceLabel(evt) {
        if (!evt.recurrence || evt.recurrence === 'none') return '';
        var label = RECURRENCE_LABELS[evt.recurrence] || evt.recurrence;
        var interval = evt.recurrence_interval || 1;
        if (interval > 1) {
            label = 'Every ' + interval + ' ' + ({daily:'days',weekly:'weeks',monthly:'months',yearly:'years'}[evt.recurrence] || 'periods');
        }
        if (evt.recurrence_byday) {
            var days = evt.recurrence_byday.split(',').map(function(d) { return DAY_ABBR[d] || d; }).join(', ');
            label += ' on ' + days;
        }
        return ' ↻' + label;
    }

    let events = [];
    let currentView = 'week';
    let currentDate = new Date();
    let selectedColor = 'violet';
    let activeFilter = 'all';
    let searchQuery = '';
    let dragState = null;
    let notificationTimers = [];
    let sidebarWidth = 288;

    function getMonday(d) {
        d = new Date(d);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);
        d.setHours(0,0,0,0);
        return d;
    }

    function getISOWeek(d) {
        const date = new Date(d.getTime());
        date.setHours(0,0,0,0);
        date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
        const week1 = new Date(date.getFullYear(), 0, 4);
        return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    }

    function formatDate(d) {
        return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    }

function initTimeSelects() {
        var hourSelects = [document.getElementById('eventStartHour'), document.getElementById('eventEndHour')];
        var minSelects = [document.getElementById('eventStartMin'), document.getElementById('eventEndMin')];
        hourSelects.forEach(function(sel) {
            sel.innerHTML = '<option value="">--</option>';
            for (var h = 0; h < 24; h++) {
                var opt = document.createElement('option');
                opt.value = String(h).padStart(2, '0');
                opt.textContent = String(h).padStart(2, '0');
                sel.appendChild(opt);
            }
        });
        minSelects.forEach(function(sel) {
            sel.innerHTML = '<option value="">--</option>';
            [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].forEach(function(m) {
                var opt = document.createElement('option');
                opt.value = String(m).padStart(2, '0');
                opt.textContent = String(m).padStart(2, '0');
                sel.appendChild(opt);
            });
        });
        document.getElementById('eventStartHour').addEventListener('change', syncTimeToHidden);
        document.getElementById('eventStartMin').addEventListener('change', syncTimeToHidden);
        document.getElementById('eventEndHour').addEventListener('change', syncTimeToHidden);
        document.getElementById('eventEndMin').addEventListener('change', syncTimeToHidden);
    }

    function syncTimeToHidden() {
        var sh = document.getElementById('eventStartHour').value;
        var sm = document.getElementById('eventStartMin').value;
        var eh = document.getElementById('eventEndHour').value;
        var em = document.getElementById('eventEndMin').value;
        document.getElementById('eventStart').value = (sh && sm) ? sh + ':' + sm : '';
        document.getElementById('eventEnd').value = (eh && em) ? eh + ':' + em : '';
    }

    function syncHiddenToSelects() {
        var startVal = document.getElementById('eventStart').value;
        var endVal = document.getElementById('eventEnd').value;
        if (startVal) {
            var sp = startVal.split(':');
            document.getElementById('eventStartHour').value = sp[0];
            document.getElementById('eventStartMin').value = sp[1];
        } else {
            document.getElementById('eventStartHour').value = '';
            document.getElementById('eventStartMin').value = '';
        }
        if (endVal) {
            var ep = endVal.split(':');
            document.getElementById('eventEndHour').value = ep[0];
            document.getElementById('eventEndMin').value = ep[1];
        } else {
            document.getElementById('eventEndHour').value = '';
            document.getElementById('eventEndMin').value = '';
        }
    }

    function formatTime(timeStr) {
        if (!timeStr) return '';
        var parts = timeStr.split(':').map(Number);
        return parts[0].toString().padStart(2, '0') + ':' + parts[1].toString().padStart(2, '0');
    }

    function sameDay(a,b) {
        return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
    }

    function isToday(d) { return sameDay(d, new Date()); }

    function escHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function showToast(message, undoCallback) {
        var container = document.getElementById('toastContainer');
        var toast = document.createElement('div');
        toast.className = 'toast-enter bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-200 flex items-center gap-3 shadow-lg';
        toast.innerHTML = '<span>' + escHtml(message) + '</span>';
        if (undoCallback) {
            var btn = document.createElement('button');
            btn.className = 'text-violet-400 hover:text-violet-300 font-medium';
            btn.textContent = 'Undo';
            btn.onclick = function() {
                undoCallback();
                toast.classList.add('toast-exit');
                setTimeout(function() { toast.remove(); }, 300);
            };
            toast.appendChild(btn);
        }
        container.appendChild(toast);
        setTimeout(function() {
            toast.classList.add('toast-exit');
            setTimeout(function() { toast.remove(); }, 300);
        }, 5000);
    }

    function parseNaturalDate(text) {
        var now = new Date();
        var result = { date: null, start_time: null, end_time: null, title: text };
        var lower = text.toLowerCase();

        var dayMap = {
            'today': 0, 'tonight': 0,
            'tomorrow': 1, 'tmrw': 1, 'tmr': 1,
            'monday': nextDayOffset(1), 'mon': nextDayOffset(1),
            'tuesday': nextDayOffset(2), 'tue': nextDayOffset(2), 'tues': nextDayOffset(2),
            'wednesday': nextDayOffset(3), 'wed': nextDayOffset(3),
            'thursday': nextDayOffset(4), 'thu': nextDayOffset(4), 'thur': nextDayOffset(4), 'thurs': nextDayOffset(4),
            'friday': nextDayOffset(5), 'fri': nextDayOffset(5),
            'saturday': nextDayOffset(6), 'sat': nextDayOffset(6),
            'sunday': nextDayOffset(0), 'sun': nextDayOffset(0)
        };

        function nextDayOffset(targetDay) {
            var current = now.getDay();
            var diff = targetDay - current;
            if (diff <= 0) diff += 7;
            return diff;
        }

        var timeRegex = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
        var timeMatch = text.match(timeRegex);
        if (timeMatch) {
            var h = parseInt(timeMatch[1]);
            var m = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
            var ampm = (timeMatch[3] || '').toLowerCase();
            if (ampm === 'pm' && h !== 12) h += 12;
            else if (ampm === 'am' && h === 12) h = 0;
            else if (!ampm && h >= 1 && h <= 6) h += 12;
            result.start_time = String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
            var endH = Math.min(h + 1, 23);
            result.end_time = String(endH).padStart(2,'0') + ':' + String(m).padStart(2,'0');
            text = text.replace(timeMatch[0], '').trim();
        }

        var dateStr = null;
        for (var word in dayMap) {
            if (lower.includes(word)) {
                var d = new Date(now.getTime() + dayMap[word] * 86400000);
                dateStr = formatDate(d);
                text = text.replace(new RegExp(word, 'gi'), '').trim();
                break;
            }
        }

        var dateRegex = /(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/;
        var dateMatch = text.match(dateRegex);
        if (dateMatch && !dateStr) {
            var mm = parseInt(dateMatch[1]);
            var dd = parseInt(dateMatch[2]);
            var yyyy = dateMatch[3] ? (dateMatch[3].length === 2 ? '20' + dateMatch[3] : dateMatch[3]) : now.getFullYear();
            dateStr = yyyy + '-' + String(mm).padStart(2,'0') + '-' + String(dd).padStart(2,'0');
            text = text.replace(dateMatch[0], '').trim();
        }

        if (dateStr) result.date = dateStr;
        else result.date = formatDate(now);

        var nextWeekMatch = text.match(/next\s+week/i);
        if (nextWeekMatch && !dateStr) {
            var d2 = new Date(now.getTime() + 7 * 86400000);
            result.date = formatDate(d2);
            text = text.replace(nextWeekMatch[0], '').trim();
        }

        if (result.start_time && !result.end_time) {
            var endH2 = Math.min(parseInt(result.start_time.split(':')[0]) + 1, 23);
            result.end_time = String(endH2).padStart(2,'0') + ':00';
        }

        result.title = text.replace(/\s+/g, ' ').trim() || 'New Event';
        return result;
    }

    async function apiCall(action, data) {
        if (window.isDemo) {
            if (action === 'add') {
                data.event.id = uniqId();
                data.event.created_at = new Date().toISOString();
                if (!data.event.hasOwnProperty('completed')) data.event.completed = false;
                if (!data.event.hasOwnProperty('all_day')) data.event.all_day = false;
                if (!data.event.hasOwnProperty('recurrence')) data.event.recurrence = 'none';
                if (!data.event.hasOwnProperty('recurrence_interval')) data.event.recurrence_interval = 1;
                if (!data.event.hasOwnProperty('recurrence_byday')) data.event.recurrence_byday = null;
                events.push(data.event);
                renderAll();
                return { status: 'success', event: data.event };
            }
            if (action === 'update') {
                var idx = events.findIndex(function(e) { return e.id === data.id; });
                if (idx !== -1) { events[idx] = data.event; renderAll(); }
                return { status: 'success' };
            }
            if (action === 'delete') {
                events = events.filter(function(e) { return e.id !== data.id; });
                renderAll();
                return { status: 'success' };
            }
            if (action === 'toggle_complete') {
                var idx2 = events.findIndex(function(e) { return e.id === data.id; });
                if (idx2 !== -1) {
                    events[idx2].completed = !events[idx2].completed;
                    renderAll();
                    return { status: 'success', completed: events[idx2].completed };
                }
                return { status: 'success' };
            }
        }
        var resp = await fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.csrfToken },
            body: JSON.stringify({ action: action, data: data ? data.data || undefined : undefined, ...data })
        });
        return resp.json();
    }

    function makeApiCall(action, payload) {
        if (window.isDemo) {
            if (action === 'add') {
                payload.event.id = uniqId();
                payload.event.created_at = new Date().toISOString();
                if (!payload.event.hasOwnProperty('completed')) payload.event.completed = false;
                if (!payload.event.hasOwnProperty('all_day')) payload.event.all_day = false;
                if (!payload.event.hasOwnProperty('recurrence')) payload.event.recurrence = 'none';
                events.push(payload.event);
                renderAll();
                return Promise.resolve({ status: 'success', event: payload.event });
            }
            if (action === 'update') {
                var idx = events.findIndex(function(e) { return e.id === payload.id; });
                if (idx !== -1) { events[idx] = payload.event; renderAll(); }
                return Promise.resolve({ status: 'success' });
            }
            if (action === 'delete') {
                events = events.filter(function(e) { return e.id !== payload.id; });
                renderAll();
                return Promise.resolve({ status: 'success' });
            }
            if (action === 'toggle_complete') {
                var idx2 = events.findIndex(function(e) { return e.id === payload.id; });
                if (idx2 !== -1) {
                    events[idx2].completed = !events[idx2].completed;
                    renderAll();
                    return Promise.resolve({ status: 'success', completed: events[idx2].completed });
                }
                return Promise.resolve({ status: 'success' });
            }
        }
        return fetch('api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.csrfToken },
            body: JSON.stringify({ action: action, ...payload })
        }).then(function(r) { return r.json(); });
    }

    function uniqId() {
        return 'evt_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }

    async function loadEvents() {
        if (window.isDemo) {
            var now = new Date();
            var today = formatDate(now);
            var tomorrow = formatDate(new Date(now.getTime() + 86400000));
            var dayAfter = formatDate(new Date(now.getTime() + 2*86400000));
            var yesterday = formatDate(new Date(now.getTime() - 86400000));
            var nextWeek = formatDate(new Date(now.getTime() + 7*86400000));
            events = [
                { id: 'd1', title: 'Team standup', date: today, type: 'meeting', start_time: '09:00', end_time: '09:30', description: 'Daily sync', color: 'blue', created_at: '', completed: false, all_day: false, recurrence: 'none' },
                { id: 'd2', title: 'Review PRs', date: today, type: 'task', start_time: '10:00', end_time: '11:30', description: 'Review open pull requests', color: 'violet', created_at: '', completed: false, all_day: false, recurrence: 'none' },
                { id: 'd3', title: 'Project deadline', date: tomorrow, type: 'deadline', start_time: '17:00', end_time: '', description: 'Submit final deliverables', color: 'red', created_at: '', completed: false, all_day: false, recurrence: 'none' },
                { id: 'd4', title: 'Lunch with Alex', date: tomorrow, type: 'meeting', start_time: '12:00', end_time: '13:00', description: '', color: 'emerald', created_at: '', completed: false, all_day: false, recurrence: 'none' },
                { id: 'd5', title: 'Write docs', date: dayAfter, type: 'task', start_time: '14:00', end_time: '16:00', description: 'API documentation', color: 'amber', created_at: '', completed: false, all_day: false, recurrence: 'none' },
                { id: 'd6', title: 'Gym', date: yesterday, type: 'task', start_time: '07:00', end_time: '08:00', description: 'Morning workout', color: 'cyan', created_at: '', completed: true, all_day: false, recurrence: 'none' },
                { id: 'd7', title: 'Weekly review', date: nextWeek, type: 'meeting', start_time: '10:00', end_time: '11:00', description: 'Team retrospective', color: 'blue', created_at: '', completed: false, all_day: false, recurrence: 'weekly', recurrence_interval: 1, recurrence_byday: null },
                { id: 'd8', title: 'Birthday party', date: dayAfter, type: 'meeting', start_time: '', end_time: '', description: "Sam's birthday", color: 'pink', created_at: '', completed: false, all_day: true, recurrence: 'none' },
                { id: 'd9', title: 'Conference', date: today, type: 'meeting', start_time: '09:00', end_time: '17:00', description: 'Tech summit downtown', color: 'blue', created_at: '', completed: false, all_day: false, recurrence: 'none', end_date: dayAfter }
            ];
            return;
        }
        var resp = await fetch('api.php', { headers: { 'X-CSRF-Token': window.csrfToken } });
        var data = await resp.json();
        events = data.events || [];
    }

    function getFilteredEvents() {
        var filtered = events;
        if (activeFilter !== 'all') {
            filtered = filtered.filter(function(e) { return e.type === activeFilter; });
        }
        if (searchQuery) {
            var q = searchQuery.toLowerCase();
            filtered = filtered.filter(function(e) {
                return e.title.toLowerCase().includes(q) || (e.description || '').toLowerCase().includes(q);
            });
        }
        return filtered;
    }

    function setView(view) {
        currentView = view;
        var btnWeek = document.getElementById('btnWeek');
        var btnMonth = document.getElementById('btnMonth');
        if (btnWeek) btnWeek.className = 'px-4 py-2 text-sm font-medium transition ' + (view === 'week' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white');
        if (btnMonth) btnMonth.className = 'px-4 py-2 text-sm font-medium transition ' + (view === 'month' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white');
        document.getElementById('weekView').classList.toggle('hidden', view !== 'week');
        document.getElementById('monthView').classList.toggle('hidden', view !== 'month');
        var mw = document.getElementById('mobileWeek');
        var mm = document.getElementById('mobileMonth');
        if (mw && mm) {
            mw.className = 'flex flex-col items-center text-xs ' + (view === 'week' ? 'text-violet-400' : 'text-zinc-400');
            mm.className = 'flex flex-col items-center text-xs ' + (view === 'month' ? 'text-violet-400' : 'text-zinc-400');
        }
        var mobileWeekLabel = document.getElementById('mobileWeekLabel');
        if (mobileWeekLabel) mobileWeekLabel.textContent = isMobile() ? 'Day' : 'Week';
        renderAll();
    }

    function navPrev() {
        if (isMobile() && currentView === 'week') {
            currentDate = new Date(currentDate.getTime() - 86400000);
        } else if (currentView === 'week') {
            currentDate = new Date(currentDate.getTime() - 7*86400000);
        } else {
            currentDate.setMonth(currentDate.getMonth() - 1);
        }
        renderAll();
    }

    function navNext() {
        if (isMobile() && currentView === 'week') {
            currentDate = new Date(currentDate.getTime() + 86400000);
        } else if (currentView === 'week') {
            currentDate = new Date(currentDate.getTime() + 7*86400000);
        } else {
            currentDate.setMonth(currentDate.getMonth() + 1);
        }
        renderAll();
    }

    function goToday() { currentDate = new Date(); renderAll(); }

    function renderNavTitle() {
        var el = document.getElementById('navTitle');
        if (currentView === 'week') {
            if (isMobile()) {
                var d = currentDate;
                el.textContent = DAY_NAMES[d.getDay() === 0 ? 6 : d.getDay() - 1] + ' ' + MONTH_NAMES[d.getMonth()] + ' ' + d.getDate();
            } else {
                var mon = getMonday(currentDate);
                var sun = new Date(mon.getTime() + 6*86400000);
                var wk = getISOWeek(mon);
                if (mon.getMonth() === sun.getMonth()) {
                    el.textContent = MONTH_NAMES[mon.getMonth()] + ' ' + mon.getDate() + ' \u2013 ' + sun.getDate() + ', ' + mon.getFullYear() + ' (W' + wk + ')';
                } else {
                    el.textContent = mon.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ' \u2013 ' + sun.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ', ' + mon.getFullYear() + ' (W' + wk + ')';
                }
            }
        } else {
            el.textContent = MONTH_NAMES[currentDate.getMonth()] + ' ' + currentDate.getFullYear() + ' (W' + getISOWeek(currentDate) + ')';
        }
        var weekLabel = document.getElementById('weekNumLabel');
        if (weekLabel && currentView === 'week') {
            weekLabel.textContent = 'W' + getISOWeek(getMonday(currentDate));
        } else if (weekLabel) {
            weekLabel.textContent = '';
        }
    }

    function getEventsForDate(dateStr) {
        return getFilteredEvents().filter(function(e) {
            if (e.end_date && e.end_date !== e.date) {
                return dateStr >= e.date && dateStr <= e.end_date;
            }
            return e.date === dateStr;
        }).sort(function(a,b) {
            if (a.all_day && !b.all_day) return -1;
            if (!a.all_day && b.all_day) return 1;
            return (a.start_time || '').localeCompare(b.start_time || '');
        });
    }

    function isMultiDayEvent(evt) {
        return evt.end_date && evt.end_date !== evt.date;
    }

    function getEventContinuation(evt, dateStr) {
        if (!isMultiDayEvent(evt)) return null;
        if (evt.date === dateStr) return 'start';
        if (evt.end_date === dateStr) return 'end';
        if (dateStr > evt.date && dateStr < evt.end_date) return 'middle';
        return null;
    }

    function renderWeekHeaders() {
        var headerRow = document.querySelector('.week-header-row');
        if (headerRow) headerRow.style.display = isMobile() ? 'none' : '';
        if (isMobile()) return;
        var mon = getMonday(currentDate);
        for (var i = 0; i < 7; i++) {
            var d = new Date(mon.getTime() + i*86400000);
            var el = document.getElementById('dayHead' + i);
            var today = isToday(d);
            el.className = 'py-2 px-1 text-center text-sm week-day-header' + (today ? ' is-today font-semibold' : ' text-zinc-400');
            el.innerHTML = '<span class="block text-xs">' + DAY_NAMES[i] + '</span>' +
                '<span class="block text-lg' + (today ? ' bg-violet-600 rounded-full w-8 h-8 leading-8 mx-auto' : '') + '">' + d.getDate() + '</span>';
        }
    }

    function renderWeekView() {
        if (isMobile()) {
            renderMobileDayView();
            return;
        }
        renderWeekHeaders();
        var grid = document.getElementById('weekGrid');
        var mon = getMonday(currentDate);
        var now = new Date();
        var weekDates = [];
        for (var i = 0; i < 7; i++) {
            weekDates.push(formatDate(new Date(mon.getTime() + i * 86400000)));
        }

        var multiDayEvents = getFilteredEvents().filter(function(e) {
            if (!isMultiDayEvent(e)) return false;
            var eEnd = e.end_date;
            return eEnd >= weekDates[0] && e.date <= weekDates[6];
        }).sort(function(a,b) {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            return (a.start_time||'').localeCompare(b.start_time||'');
        });

        var singleDayByDate = {};
        weekDates.forEach(function(ds) { singleDayByDate[ds] = []; });
        getFilteredEvents().forEach(function(e) {
            if (isMultiDayEvent(e)) return;
            if (singleDayByDate[e.date]) singleDayByDate[e.date].push(e);
        });
        weekDates.forEach(function(ds) {
            singleDayByDate[ds].sort(function(a,b) {
                if (a.all_day && !b.all_day) return -1;
                if (!a.all_day && b.all_day) return 1;
                return (a.start_time||'').localeCompare(b.start_time||'');
            });
        });

        var html = '<div class="grid grid-cols-8 relative">';

        html += '<div class="border-r border-zinc-800">';
        if (multiDayEvents.length > 0) {
            html += '<div class="min-h-[28px] text-xs text-zinc-500 text-right pr-2 pt-1">All day</div>';
        }
        var hasAnyAllday = Object.values(singleDayByDate).some(function(evts) { return evts.some(function(e) { return e.all_day; }); });
        if (hasAnyAllday && multiDayEvents.length === 0) {
            html += '<div class="min-h-[24px] text-xs text-zinc-500 text-right pr-2 pt-1">All day</div>';
        } else if (hasAnyAllday) {
            html += '<div class="min-h-[24px]"></div>';
        }
        for (var h = START_HOUR; h < END_HOUR; h++) {
            html += '<div class="h-[' + SLOT_HEIGHT + 'px] text-xs text-zinc-500 text-right pr-2 pt-1">' +
                (h < 10 ? '0' : '') + h + ':00</div>';
        }
        html += '</div>';

        for (var col = 0; col < 7; col++) {
            var d = new Date(mon.getTime() + col * 86400000);
            var dateStr = weekDates[col];
            var todayClass = isToday(d) ? ' bg-zinc-900/50' : '';

html += '<div class="border-r border-zinc-800' + todayClass + '" data-drop-date="' + dateStr + '">';

            if (multiDayEvents.length > 0) {
                html += '<div class="border-b border-zinc-800/50 px-1 py-1 min-h-[28px]">';
                multiDayEvents.forEach(function(evt) {
                    if (dateStr < evt.date || dateStr > evt.end_date) return;
                    var color = COLOR_MAP[evt.color || TYPE_COLORS[evt.type]] || COLOR_MAP.violet;
                    var cont = getEventContinuation(evt, dateStr);
                    var completedClass = evt.completed ? ' completed-event' : '';
                    var isStart = cont === 'start';
                    var isEnd = cont === 'end';
                    var dayNum = Math.round((new Date(dateStr).getTime() - new Date(evt.date).getTime()) / 86400000) + 1;
                    var totalDays = Math.round((new Date(evt.end_date).getTime() - new Date(evt.date).getTime()) / 86400000) + 1;
                    var label = escHtml(evt.title);
                    if (totalDays > 1 && !isStart) label = '\u2192 ' + label;
                    if (isStart && evt.start_time) label = formatTime(evt.start_time) + ' ' + label;
                    if (isEnd && evt.end_time) label = label + ' ' + formatTime(evt.end_time);
                    html += '<div class="cal-event text-xs px-1.5 py-0.5 rounded truncate mb-0.5 cursor-pointer' + completedClass + '" ' +
                        'style="background:' + color.bg + ';color:' + color.text + ';border-left:2px solid ' + color.border + ';" ' +
                        'draggable="true" data-event-id="' + evt.id + '" ' +
                        'onclick="window._editEvent(\'' + evt.id + '\')">' +
                        TYPE_ICONS[evt.type] + ' <span class="evt-title">' + label + '</span>' +
                        (evt.completed ? ' ✓' : '') +
                        (evt.recurrence && evt.recurrence !== 'none' ? ' ↻' : '') +
                        '</div>';
                });
                html += '</div>';
            }

            var dayEvents = singleDayByDate[dateStr];
            var alldayEvents = dayEvents.filter(function(e) { return e.all_day; });
            if (alldayEvents.length > 0) {
                html += '<div class="border-b border-zinc-800/50 px-1 py-1 min-h-[24px]">';
                alldayEvents.forEach(function(evt) {
                    var color = COLOR_MAP[evt.color || TYPE_COLORS[evt.type]] || COLOR_MAP.violet;
                    var completedClass = evt.completed ? ' completed-event' : '';
                    html += '<div class="cal-event text-xs px-1.5 py-0.5 rounded truncate mb-0.5 cursor-pointer' + completedClass + '" ' +
                        'style="background:' + color.bg + ';color:' + color.text + ';border-left:2px solid ' + color.border + ';" ' +
                        'draggable="true" data-event-id="' + evt.id + '" ' +
                        'onclick="window._editEvent(\'' + evt.id + '\')">' +
                        TYPE_ICONS[evt.type] + ' <span class="evt-title">' + escHtml(evt.title) + '</span>' +
                        (evt.completed ? ' ✓' : '') + '</div>';
                });
                html += '</div>';
            }

            html += '<div class="relative" data-drop-date="' + dateStr + '">';

            for (var h2 = START_HOUR; h2 < END_HOUR; h2++) {
                var isNowLine = isToday(d) && now.getHours() === h2;
                html += '<div class="h-[' + SLOT_HEIGHT + 'px] border-t border-zinc-800/50 time-slot relative cursor-pointer" data-date="' + dateStr + '" data-hour="' + h2 + '" onclick="window._addAtSlot(this)">';
                if (isNowLine) {
                    var mins = now.getMinutes();
                    html += '<div class="absolute left-0 right-0 z-10" style="top:' + (mins/60*SLOT_HEIGHT) + 'px"><div class="h-px bg-red-500 w-full"></div><div class="w-2 h-2 rounded-full bg-red-500 absolute -left-1 -top-1"></div></div>';
                }
                html += '</div>';
            }

            var timedEvents = dayEvents.filter(function(e) { return !e.all_day && !isMultiDayEvent(e); });
            timedEvents.forEach(function(evt) {
                var color = COLOR_MAP[evt.color || TYPE_COLORS[evt.type]] || COLOR_MAP.violet;
                var startH = evt.start_time ? parseInt(evt.start_time.split(':')[0]) : 0;
                var startM = evt.start_time ? parseInt(evt.start_time.split(':')[1]) : 0;
                var endH = evt.end_time ? parseInt(evt.end_time.split(':')[0]) : startH + 1;
                var endM = evt.end_time ? parseInt(evt.end_time.split(':')[1]) : 0;

                var topOffset = Math.max(0, (startH - START_HOUR) * SLOT_HEIGHT + (startM/60) * SLOT_HEIGHT);
                var height = Math.max(SLOT_HEIGHT/2, ((endH - startH) * SLOT_HEIGHT + ((endM - startM)/60) * SLOT_HEIGHT));
                var timeLabel = (evt.start_time ? formatTime(evt.start_time) : '') + (evt.end_time ? ' \u2013 ' + formatTime(evt.end_time) : '');
                var completedClass = evt.completed ? ' completed-event' : '';
                var recurrenceBadge = evt.recurrence && evt.recurrence !== 'none' ? recurrenceLabel(evt) : '';

                html += '<div class="cal-event absolute left-1 right-1 rounded-lg px-2 py-1 text-xs overflow-hidden z-20 cursor-pointer' + completedClass + '" ' +
                    'style="top:' + topOffset + 'px;height:' + height + 'px;background:' + color.bg + ';border-left:3px solid ' + color.border + ';" ' +
                    'draggable="true" data-event-id="' + evt.id + '" ' +
                    'onclick="window._editEvent(\'' + evt.id + '\')" title="' + escHtml(evt.title) + '">' +
                    '<div class="font-medium truncate evt-title" style="color:' + color.text + '">' + TYPE_ICONS[evt.type] + ' ' + escHtml(evt.title) + recurrenceBadge + (evt.completed ? ' ✓' : '') + '</div>' +
                    (timeLabel ? '<div class="text-zinc-400 truncate">' + timeLabel + '</div>' : '') +
                    '</div>';
            });

            html += '</div>';
            html += '</div>';
        }

        html += '</div>';
        grid.innerHTML = html;

        setupDragDrop();

        var nowHour = now.getHours();
        if (nowHour >= START_HOUR && nowHour <= END_HOUR) {
            grid.scrollTop = Math.max(0, (nowHour - START_HOUR - 1) * SLOT_HEIGHT);
        } else {
            grid.scrollTop = (8 - START_HOUR) * SLOT_HEIGHT;
        }
    }

    function renderMobileDayView() {
        var grid = document.getElementById('weekGrid');
        var dateStr = formatDate(currentDate);
        var d = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
        var now = new Date();
        var dayLabel = DAY_NAMES[d.getDay() === 0 ? 6 : d.getDay() - 1] + ' ' + MONTH_NAMES[d.getMonth()] + ' ' + d.getDate();

        var allEvents = getFilteredEvents().filter(function(e) { return e.date === dateStr; });
        var multiDayEvents = allEvents.filter(function(e) { return isMultiDayEvent(e); });
        var dayEvents = allEvents.filter(function(e) { return !isMultiDayEvent(e); });
        var alldayEvents = dayEvents.filter(function(e) { return e.all_day; });
        var timedEvents = dayEvents.filter(function(e) { return !e.all_day && !isMultiDayEvent(e); });

        var SH = MOBILE_SLOT_HEIGHT;
        var html = '';

        html += '<div class="flex items-center justify-between px-3 py-2 bg-zinc-900 border-b border-zinc-800">';
        html += '<button onclick="navPrev()" class="p-1.5 hover:bg-zinc-800 rounded-lg"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg></button>';
        html += '<span class="text-sm font-medium">' + dayLabel + '</span>';
        html += '<button onclick="navNext()" class="p-1.5 hover:bg-zinc-800 rounded-lg"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg></button>';
        html += '</div>';

        html += '<div class="flex flex-1 overflow-hidden">';
        html += '<div class="border-r border-zinc-800 shrink-0" style="width:40px">';
        for (var h = START_HOUR; h < END_HOUR; h++) {
            html += '<div class="text-xs text-zinc-500 text-right pr-1" style="height:' + SH + 'px;line-height:' + SH + 'px">' + (h < 10 ? '0' : '') + h + '</div>';
        }
        html += '</div>';

        html += '<div class="flex-1 relative" data-drop-date="' + dateStr + '">';
        for (var h2 = START_HOUR; h2 < END_HOUR; h2++) {
            var isNowLine = isToday(d) && now.getHours() === h2;
            html += '<div class="border-t border-zinc-800/50 time-slot relative cursor-pointer" style="height:' + SH + 'px" data-date="' + dateStr + '" data-hour="' + h2 + '" onclick="window._addAtSlot(this)">';
            if (isNowLine) {
                var mins = now.getMinutes();
                html += '<div class="absolute left-0 right-0 z-10" style="top:' + (mins/60*SH) + 'px"><div class="h-px bg-red-500 w-full"></div><div class="w-2 h-2 rounded-full bg-red-500 absolute -left-1 -top-1"></div></div>';
            }
            html += '</div>';
        }

        timedEvents.forEach(function(evt) {
            var color = COLOR_MAP[evt.color || TYPE_COLORS[evt.type]] || COLOR_MAP.violet;
            var startH = evt.start_time ? parseInt(evt.start_time.split(':')[0]) : 0;
            var startM = evt.start_time ? parseInt(evt.start_time.split(':')[1]) : 0;
            var endH = evt.end_time ? parseInt(evt.end_time.split(':')[0]) : startH + 1;
            var endM = evt.end_time ? parseInt(evt.end_time.split(':')[1]) : 0;
            var topOffset = Math.max(0, (startH - START_HOUR) * SH + (startM/60) * SH);
            var height = Math.max(SH/2, ((endH - startH) * SH + ((endM - startM)/60) * SH));
            var timeLabel = (evt.start_time ? formatTime(evt.start_time) : '') + (evt.end_time ? ' \u2013 ' + formatTime(evt.end_time) : '');
            var completedClass = evt.completed ? ' completed-event' : '';
            html += '<div class="cal-event absolute left-1 right-1 rounded-lg px-2 py-1 text-xs overflow-hidden z-20 cursor-pointer' + completedClass + '" ' +
                'style="top:' + topOffset + 'px;height:' + height + 'px;background:' + color.bg + ';border-left:3px solid ' + color.border + ';" ' +
                'draggable="true" data-event-id="' + evt.id + '" ' +
                'onclick="window._editEvent(\'' + evt.id + '\')">' +
                '<div class="font-medium truncate evt-title" style="color:' + color.text + '">' + TYPE_ICONS[evt.type] + ' ' + escHtml(evt.title) + (evt.completed ? ' ✓' : '') + '</div>' +
                (timeLabel ? '<div class="text-zinc-400 truncate">' + timeLabel + '</div>' : '') +
                '</div>';
        });

        html += '</div></div>';

        var listEvents = multiDayEvents.concat(alldayEvents);
        if (listEvents.length > 0) {
            html += '<div class="border-t border-zinc-800 px-3 py-2 space-y-1">';
            listEvents.forEach(function(evt) {
                var color = COLOR_MAP[evt.color || TYPE_COLORS[evt.type]] || COLOR_MAP.violet;
                var completedClass = evt.completed ? ' completed-event' : '';
                var timeLabel = evt.all_day ? 'All day' : (evt.start_time ? formatTime(evt.start_time) : '') + (evt.end_time ? ' \u2013 ' + formatTime(evt.end_time) : '');
                html += '<div class="cal-event text-sm px-3 py-2 rounded-lg cursor-pointer' + completedClass + '" ' +
                    'style="background:' + color.bg + ';color:' + color.text + ';border-left:3px solid ' + color.border + ';" ' +
                    'draggable="true" data-event-id="' + evt.id + '" ' +
                    'onclick="window._editEvent(\'' + evt.id + '\')">' +
                    TYPE_ICONS[evt.type] + ' <span class="evt-title">' + escHtml(evt.title) + '</span>' +
                    (timeLabel ? ' <span class="text-zinc-400 text-xs">' + timeLabel + '</span>' : '') +
                    (evt.completed ? ' ✓' : '') +
                    '</div>';
            });
            html += '</div>';
        }

        grid.innerHTML = html;
        grid.className = 'flex-1 overflow-y-auto scrollbar-thin';
        setupDragDrop();

        var nowHour = now.getHours();
        if (isToday(d) && nowHour >= START_HOUR && nowHour <= END_HOUR) {
            grid.scrollTop = Math.max(0, (nowHour - START_HOUR - 1) * SH);
        } else {
            grid.scrollTop = (8 - START_HOUR) * SH;
        }
    }

    function renderMonthView() {
        var container = document.getElementById('monthView');
        var year = currentDate.getFullYear();
        var month = currentDate.getMonth();
        var firstDay = new Date(year, month, 1);
        var lastDay = new Date(year, month + 1, 0);
        var startDow = (firstDay.getDay() + 6) % 7;
        var daysInMonth = lastDay.getDate();
        var prevMonthLast = new Date(year, month, 0).getDate();
        var mobile = isMobile();

        var dayLabels = mobile ? DAY_NAMES_SHORT : DAY_NAMES;
        var cols = mobile ? 7 : 8;
        var headerHtml = '';
        if (!mobile) {
            headerHtml += '<div class="py-2 text-center text-xs text-zinc-500 font-medium px-0.5">Wk</div>';
        }
        (mobile ? DAY_NAMES_SHORT : DAY_NAMES).forEach(function(d) {
            headerHtml += '<div class="py-2 text-center text-xs text-zinc-500 font-medium">' + d + '</div>';
        });
        var html = '<div class="grid grid-cols-' + cols + ' border-b border-zinc-800 bg-zinc-900">' + headerHtml + '</div>';

        var totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;
        var cellIdx = 0;
        html += '<div class="grid grid-cols-' + cols + '">';
        for (var i = 0; i < totalCells; i++) {
            if (!mobile && i % 7 === 0) {
                var weekDate = i < startDow ? new Date(year, month - 1, prevMonthLast - startDow + i + 1) : new Date(year, month, i - startDow + 1);
                html += '<div class="p-1 text-xs text-zinc-600 text-center border-t border-r border-zinc-800/50">' + getISOWeek(weekDate) + '</div>';
            }
            var dayNum, dateStr2, isCurrentMonth;
            if (i < startDow) {
                dayNum = prevMonthLast - startDow + i + 1;
                var dd = new Date(year, month - 1, dayNum);
                dateStr2 = formatDate(dd);
                isCurrentMonth = false;
            } else if (i >= startDow + daysInMonth) {
                dayNum = i - startDow - daysInMonth + 1;
                var dd2 = new Date(year, month + 1, dayNum);
                dateStr2 = formatDate(dd2);
                isCurrentMonth = false;
            } else {
                dayNum = i - startDow + 1;
                dateStr2 = formatDate(new Date(year, month, dayNum));
                isCurrentMonth = true;
            }

            var dayEvents = getEventsForDate(dateStr2);
            var todayClass2 = isCurrentMonth && isToday(new Date(dateStr2)) ? ' is-today' : '';
            var opacityClass = isCurrentMonth ? '' : ' opacity-40';
            var maxShow = mobile ? 2 : 3;
            var minH2 = dayEvents.length > maxShow ? (mobile ? 'min-h-[60px]' : 'min-h-[120px]') : (mobile ? 'min-h-[50px]' : 'min-h-[90px]');

            html += '<div class="border-t border-r border-zinc-800 ' + (mobile ? 'p-0.5' : 'p-1.5') + ' month-day cursor-pointer' + todayClass2 + opacityClass + '" onclick="window._addAtDate(\'' + dateStr2 + '\')" data-drop-date="' + dateStr2 + '">';
            html += '<div class="' + (mobile ? 'text-xs' : 'text-sm') + ' font-medium mb-0.5">' + dayNum + '</div>';
            dayEvents.slice(0, maxShow).forEach(function(evt) {
                var color = COLOR_MAP[evt.color || TYPE_COLORS[evt.type]] || COLOR_MAP.violet;
                var completedClass2 = evt.completed ? ' completed-event' : '';
                var recurrence2 = evt.recurrence && evt.recurrence !== 'none' ? recurrenceLabel(evt) : '';
                var cont = getEventContinuation(evt, dateStr2);
                var evtLabel = escHtml(evt.title);
                if (isMultiDayEvent(evt)) {
                    if (cont === 'start') evtLabel = evtLabel + ' \u2192';
                    else if (cont === 'end') evtLabel = '\u2190 ' + evtLabel;
                    else if (cont === 'middle') evtLabel = '\u2190 ' + evtLabel + ' \u2192';
                }
                html += '<div class="' + (mobile ? 'text-[9px] px-0.5 py-px' : 'text-xs px-1.5 py-0.5') + ' rounded truncate cursor-pointer cal-event' + completedClass2 + '" ' +
                    'style="background:' + color.bg + ';color:' + color.text + ';border-left:2px solid ' + color.border + ';" ' +
                    'draggable="true" data-event-id="' + evt.id + '" ' +
                    'onclick="event.stopPropagation();window._editEvent(\'' + evt.id + '\')">' +
                    '<span class="evt-title">' + evtLabel + '</span>' + (evt.completed ? ' ✓' : '') + '</div>';
            });
            if (dayEvents.length > maxShow) {
                html += '<div class="text-xs text-zinc-400">+' + (dayEvents.length - maxShow) + '</div>';
            }
            html += '</div>';
            cellIdx++;
        }
        html += '</div>';
        container.innerHTML = html;

        setupDragDrop();
    }

    function renderSidebar() {
        var container = document.getElementById('sidebarEvents');
        var mobileContainer = document.getElementById('mobileSidebarEvents');
        var today = formatDate(new Date());
        var seenIds = {};
        function dedup(list) {
            return list.filter(function(e) {
                var key = e.recurrence_parent || e.id;
                if (seenIds[key]) return false;
                seenIds[key] = true;
                return true;
            });
        }
        var todayEvents = dedup(getFilteredEvents().filter(function(e) {
            if (e.end_date && e.end_date !== e.date) return today >= e.date && today <= e.end_date;
            return e.date === today;
        })).sort(function(a,b) {
            if (a.all_day && !b.all_day) return -1;
            if (!a.all_day && b.all_day) return 1;
            return (a.start_time||'').localeCompare(b.start_time||'');
        });
        var upcoming = dedup(getFilteredEvents().filter(function(e) {
            if (e.end_date && e.end_date !== e.date) return e.date > today;
            return e.date > today;
        })).sort(function(a,b) {
            return a.date.localeCompare(b.date) || (a.start_time||'').localeCompare(b.start_time||'');
        });
        var overdue = dedup(getFilteredEvents().filter(function(e) {
            return e.date < today && e.type === 'deadline' && !e.completed && !(e.end_date && e.end_date >= today);
        })).sort(function(a,b) {
            return b.date.localeCompare(a.date);
        });
        var past = dedup(getFilteredEvents().filter(function(e) {
            if (e.end_date && e.end_date >= today) return false;
            if (e.date >= today) return false;
            if (e.type === 'deadline' && !e.completed && !(e.end_date && e.end_date >= today)) return false;
            return true;
        })).sort(function(a,b) {
            return b.date.localeCompare(a.date);
        });

        var html = '';

        if (overdue.length) {
            html += '<div class="mb-6">';
            html += '<h4 class="text-sm font-semibold text-red-400 mb-2 uppercase tracking-wider">Overdue</h4>';
            overdue.forEach(function(evt) { html += renderSidebarEvent(evt); });
            html += '</div>';
        }

        html += '<div class="mb-6">';
        html += '<h4 class="text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Today</h4>';
        if (todayEvents.length === 0) {
            html += '<p class="text-sm text-zinc-600">No events today</p>';
        } else {
            todayEvents.forEach(function(evt) { html += renderSidebarEvent(evt); });
        }
        html += '</div>';

        html += '<div class="mb-6">';
        html += '<h4 class="text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Upcoming</h4>';
        if (upcoming.length === 0) {
            html += '<p class="text-sm text-zinc-600">No upcoming events</p>';
        } else {
            upcoming.slice(0, 15).forEach(function(evt) { html += renderSidebarEvent(evt); });
        }
        html += '</div>';

        if (past.length) {
            html += '<div class="mb-6">';
            html += '<h4 class="text-sm font-semibold text-zinc-500 mb-2 uppercase tracking-wider cursor-pointer select-none" onclick="window._togglePast()">&#9660; Past <span class="text-zinc-600 font-normal">(' + past.length + ')</span></h4>';
            html += '<div id="pastEventsList" style="display:none">';
            past.slice(0, 20).forEach(function(evt) { html += renderSidebarEvent(evt, true); });
            if (past.length > 20) {
                html += '<p class="text-xs text-zinc-500 mt-1">+' + (past.length - 20) + ' more past events</p>';
            }
            html += '</div></div>';
        }

        container.innerHTML = html;
        if (mobileContainer) mobileContainer.innerHTML = html;
    }

function renderSidebarEvent(evt, isPast) {
        var color = COLOR_MAP[evt.color || TYPE_COLORS[evt.type]] || COLOR_MAP.violet;
        var timeLabel;
        if (evt.all_day && isMultiDayEvent(evt)) {
            timeLabel = evt.date + ' \u2013 ' + evt.end_date;
        } else if (isMultiDayEvent(evt)) {
            timeLabel = evt.date + ' \u2013 ' + evt.end_date;
            if (evt.start_time) timeLabel += ' ' + formatTime(evt.start_time);
            if (evt.end_time) timeLabel += ' \u2013 ' + formatTime(evt.end_time);
        } else if (evt.all_day) {
            timeLabel = 'All day';
        } else {
            timeLabel = evt.start_time ? formatTime(evt.start_time) + (evt.end_time ? ' \u2013 ' + formatTime(evt.end_time) : '') : '';
        }
        var recurrenceLabel2 = evt.recurrence && evt.recurrence !== 'none' ? recurrenceLabel(evt) : '';
        var completedStyle = evt.completed ? ' opacity-50 line-through' : '';
        var pastStyle = isPast && !evt.completed ? ' opacity-60' : '';
        var dateLabel = isMultiDayEvent(evt) ? evt.date + ' \u2013 ' + evt.end_date : evt.date;
        return '<div class="p-3 rounded-xl cursor-pointer hover:bg-zinc-800 transition cal-event group' + completedStyle + pastStyle + '" ' +
            'style="border-left:3px solid ' + color.border + ';" ' +
            'onclick="window._editEvent(\'' + evt.id + '\')">' +
            '<div class="flex items-center justify-between">' +
            '<div class="flex items-center gap-2 min-w-0">' +
            (evt.type === 'task' ? '<button onclick="event.stopPropagation();window._toggleComplete(\'' + evt.id + '\')" class="w-4 h-4 rounded border ' + (evt.completed ? 'bg-violet-500 border-violet-500' : 'border-zinc-600 hover:border-violet-500') + ' flex items-center justify-center shrink-0">' +
                (evt.completed ? '<svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>' : '') +
            '</button>' : '') +
            '<div class="font-medium text-sm truncate evt-title" style="color:' + color.text + '">' + TYPE_ICONS[evt.type] + ' ' + escHtml(evt.title) + recurrenceLabel2 + '</div>' +
            '</div>' +
            '<button onclick="event.stopPropagation();window._quickDelete(\'' + evt.id + '\')" class="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition shrink-0 ml-2" title="Delete">' +
            '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>' +
            '</button></div>' +
            '<div class="text-xs text-zinc-500 mt-0.5">' + dateLabel + (timeLabel && timeLabel !== dateLabel ? ' \u00b7 ' + timeLabel : '') + '</div>' +
            (evt.description ? '<div class="text-xs text-zinc-500 mt-0.5 truncate">' + escHtml(evt.description) + '</div>' : '') +
            '</div>';
    }

    function renderAll() {
        renderNavTitle();
        if (currentView === 'week') renderWeekView();
        else renderMonthView();
        renderSidebar();
    }

    function toggleAllDay() {
        var allDay = document.getElementById('eventAllDay').checked;
        var timeFields = document.getElementById('timeFields');
        if (allDay) {
            timeFields.style.display = 'none';
        } else {
            timeFields.style.display = '';
        }
    }

    function openAddModal(date, hour) {
        document.getElementById('modalTitle').textContent = 'Add Event';
        document.getElementById('eventId').value = '';
        document.getElementById('eventTitle').value = '';
        document.getElementById('eventDate').value = date || formatDate(new Date());
        document.getElementById('eventEndDate').value = '';
        document.getElementById('eventType').value = 'task';
        document.getElementById('eventStart').value = hour !== undefined ? String(hour).padStart(2,'0') + ':00' : '09:00';
        document.getElementById('eventEnd').value = hour !== undefined ? String(Math.min(hour+1,23)).padStart(2,'0') + ':00' : '10:00';
        syncHiddenToSelects();
        document.getElementById('eventDesc').value = '';
        document.getElementById('eventAllDay').checked = false;
        document.getElementById('timeFields').style.display = '';
        document.getElementById('eventRecurrence').value = 'none';
        document.getElementById('eventRecurrenceInterval').value = 1;
        selectedBydays = [];
        document.querySelectorAll('#recurrenceBydayPicker button').forEach(function(btn) {
            btn.className = 'w-8 h-8 text-xs rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition';
        });
        document.getElementById('recurrenceEndFields').classList.add('hidden');
        document.getElementById('recurrenceIntervalFields').classList.add('hidden');
        document.getElementById('eventRecurrenceEnd').value = '';
        document.getElementById('deleteBtn').classList.add('hidden');
        pickColor('violet');
        document.getElementById('eventModal').classList.remove('hidden');
        setTimeout(function() { document.getElementById('eventTitle').focus(); }, 100);
    }

    function openEditModal(id) {
        var evt = events.find(function(e) { return e.id === id; });
        if (!evt) return;
        document.getElementById('modalTitle').textContent = 'Edit Event';
        document.getElementById('eventId').value = evt.id;
        document.getElementById('eventTitle').value = evt.title;
        document.getElementById('eventDate').value = evt.date;
        document.getElementById('eventEndDate').value = evt.end_date || '';
        document.getElementById('eventType').value = evt.type;
        document.getElementById('eventStart').value = evt.start_time || '';
        document.getElementById('eventEnd').value = evt.end_time || '';
        syncHiddenToSelects();
        document.getElementById('eventDesc').value = evt.description || '';
        document.getElementById('eventAllDay').checked = !!evt.all_day;
        toggleAllDayDisplay(!!evt.all_day);
        var recVal = evt.recurrence || 'none';
        if (recVal === 'weekly' && evt.recurrence_interval >= 2 && (!evt.recurrence_byday || evt.recurrence_byday.split(',').length <= 1)) {
            // detect biweekly pattern for display
        }
        document.getElementById('eventRecurrence').value = recVal;
        document.getElementById('eventRecurrenceInterval').value = evt.recurrence_interval || 1;
        selectedBydays = evt.recurrence_byday ? evt.recurrence_byday.split(',') : [];
        document.querySelectorAll('#recurrenceBydayPicker button').forEach(function(btn) {
            var isActive = selectedBydays.indexOf(btn.dataset.day) >= 0;
            btn.className = 'w-8 h-8 text-xs rounded-lg transition ' + (isActive ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700');
        });
        document.getElementById('eventRecurrenceEnd').value = evt.recurrence_end || '';
        toggleRecurrenceEnd(recVal);
        document.getElementById('deleteBtn').classList.remove('hidden');
        pickColor(evt.color || TYPE_COLORS[evt.type]);
        document.getElementById('eventModal').classList.remove('hidden');
    }

    function toggleAllDayDisplay(isAllDay) {
        var timeFields = document.getElementById('timeFields');
        timeFields.style.display = isAllDay ? 'none' : '';
    }

    function toggleRecurrenceEnd(val) {
        var fields = document.getElementById('recurrenceEndFields');
        var intervalFields = document.getElementById('recurrenceIntervalFields');
        if (val && val !== 'none') {
            fields.classList.remove('hidden');
            intervalFields.classList.remove('hidden');
            if (val === 'biweekly') {
                document.getElementById('eventRecurrenceInterval').value = 2;
                document.getElementById('eventRecurrence').value = 'weekly';
            }
        } else {
            fields.classList.add('hidden');
            intervalFields.classList.add('hidden');
        }
    }

    var selectedBydays = [];
    function toggleByday(day) {
        var idx = selectedBydays.indexOf(day);
        if (idx >= 0) selectedBydays.splice(idx, 1);
        else selectedBydays.push(day);
        document.querySelectorAll('#recurrenceBydayPicker button').forEach(function(btn) {
            var isActive = selectedBydays.indexOf(btn.dataset.day) >= 0;
            btn.className = 'w-8 h-8 text-xs rounded-lg transition ' + (isActive ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700');
        });
    }

    function closeModal() {
        document.getElementById('eventModal').classList.add('hidden');
    }

    function pickColor(color) {
        selectedColor = color;
        document.querySelectorAll('#colorPicker button').forEach(function(btn) {
            btn.classList.toggle('ring-2', btn.dataset.color === color);
            btn.classList.toggle('ring-white', btn.dataset.color === color);
            btn.classList.toggle('ring-offset-2', btn.dataset.color === color);
            btn.classList.toggle('ring-offset-zinc-900', btn.dataset.color === color);
        });
    }

    async function saveEvent() {
        var id = document.getElementById('eventId').value;
        var titleVal = document.getElementById('eventTitle').value.trim();
        var parsed = parseNaturalDate(titleVal);
        var isAllDay = document.getElementById('eventAllDay').checked;
        var recurrence = document.getElementById('eventRecurrence').value;
        var recurrenceInterval = parseInt(document.getElementById('eventRecurrenceInterval').value) || 1;
        var recurrenceByday = selectedBydays.length > 0 ? selectedBydays.join(',') : null;
        var recurrenceEnd = document.getElementById('eventRecurrenceEnd').value || null;

        var evt = {
            title: parsed.title || titleVal,
            date: document.getElementById('eventDate').value || parsed.date,
            end_date: document.getElementById('eventEndDate').value || null,
            type: document.getElementById('eventType').value,
            start_time: isAllDay ? '' : (document.getElementById('eventStart').value || parsed.start_time || ''),
            end_time: isAllDay ? '' : (document.getElementById('eventEnd').value || parsed.end_time || ''),
            description: document.getElementById('eventDesc').value.trim(),
            color: selectedColor,
            all_day: isAllDay,
            completed: false,
            recurrence: recurrence,
            recurrence_interval: recurrenceInterval,
            recurrence_byday: recurrenceByday,
            recurrence_end: recurrenceEnd
        };

        if (!evt.title || !evt.date) {
            showToast('Please fill in the title and date.');
            return;
        }

        if (id) {
            var existing = events.find(function(e) { return e.id === id; });
            if (existing) {
                evt.completed = existing.completed;
                evt.id = existing.id;
                evt.created_at = existing.created_at;
            }
            var result = await makeApiCall('update', { id: id, event: evt });
            if (result.status === 'success') {
                var idx = events.findIndex(function(e) { return e.id === id; });
                if (idx !== -1) events[idx] = evt;
            }
        } else {
            var result2 = await makeApiCall('add', { event: evt });
            if (result2.status === 'success' && result2.event) {
                events.push(result2.event);
            }
        }

        closeModal();
        renderAll();
    }

    async function deleteEvent() {
        var id = document.getElementById('eventId').value;
        if (!id) return;
        var evt = events.find(function(e) { return e.id === id; });
        if (!evt) return;

        var deletedEvent = Object.assign({}, evt);
        await makeApiCall('delete', { id: id });
        events = events.filter(function(e) { return e.id !== id; });
        closeModal();
        renderAll();
        showToast('Event deleted', function() {
            events.push(deletedEvent);
            makeApiCall('add', { event: deletedEvent });
            renderAll();
        });
    }

    function toggleFilter(filter) {
        activeFilter = filter;
        document.querySelectorAll('#filterBar button').forEach(function(btn) {
            var isActive = btn.dataset.filter === filter;
            btn.className = 'text-xs px-2.5 py-1 rounded-full transition ' + (isActive ? 'bg-zinc-700 text-white' : 'bg-zinc-800 text-zinc-400');
        });
        renderAll();
    }

    function handleSearch() {
        searchQuery = document.getElementById('searchInput').value;
        renderSidebar();
    }

    function toggleMobileSidebar() {
        var sidebar = document.getElementById('mobileSidebar');
        var overlay = document.getElementById('mobileSidebarOverlay');
        var isOpen = !sidebar.classList.contains('translate-x-full');
        if (isOpen) {
            sidebar.classList.add('translate-x-full');
            overlay.classList.add('hidden');
        } else {
            sidebar.classList.remove('translate-x-full');
            overlay.classList.remove('hidden');
        }
    }

    function setupDragDrop() {
        var draggables = document.querySelectorAll('[data-event-id][draggable="true"]');
        draggables.forEach(function(el) {
            el.addEventListener('dragstart', function(e) {
                dragState = { id: el.dataset.eventId };
                el.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', el.dataset.eventId);
            });
            el.addEventListener('dragend', function() {
                el.classList.remove('dragging');
                dragState = null;
                document.querySelectorAll('.drag-over').forEach(function(d) { d.classList.remove('drag-over'); });
            });
        });

        var dropTargets = document.querySelectorAll('[data-drop-date]');
        dropTargets.forEach(function(target) {
            target.addEventListener('dragover', function(e) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                target.classList.add('drag-over');
            });
            target.addEventListener('dragleave', function() {
                target.classList.remove('drag-over');
            });
            target.addEventListener('drop', function(e) {
                e.preventDefault();
                target.classList.remove('drag-over');
                var eventId = e.dataTransfer.getData('text/plain');
                var newDate = target.dataset.dropDate;
                var evt = events.find(function(ev) { return ev.id === eventId; });
                if (evt && evt.date !== newDate) {
                    var oldDate = evt.date;
                    evt.date = newDate;
                    makeApiCall('update', { id: eventId, event: evt });
                    showToast('Moved to ' + newDate, function() {
                        evt.date = oldDate;
                        makeApiCall('update', { id: eventId, event: evt });
                        renderAll();
                    });
                    renderAll();
                }
            });
        });
    }

    async function exportICS() {
        if (window.isDemo) {
            showToast('Export not available in demo mode');
            return;
        }
        var link = document.createElement('a');
        link.href = 'api.php?action=export_ics';
        link.download = 'planner.ics';
        link.click();
    }

    function openImportModal() {
        document.getElementById('importModal').classList.remove('hidden');
        document.getElementById('icsContent').value = '';
        document.getElementById('icsFile').value = '';
        var urlInput = document.getElementById('icsUrl');
        if (urlInput) urlInput.value = '';
        document.getElementById('importStatus').textContent = '';
    }

    function closeImportModal() {
        document.getElementById('importModal').classList.add('hidden');
    }

    async function importICS() {
        var content = document.getElementById('icsContent').value.trim();
        var fileInput = document.getElementById('icsFile');
        var fileName = fileInput.files.length > 0 ? fileInput.files[0].name : '';

        if (!content && fileInput.files.length > 0) {
            var reader = new FileReader();
            reader.onload = async function(e) {
                await doImport(e.target.result, fileName ? 'file' : 'paste', fileName);
            };
            reader.readAsText(fileInput.files[0]);
            return;
        }

        if (!content) {
            showToast('Please paste ICS content or select a file');
            return;
        }

        await doImport(content, 'paste', '');
    }

    async function importICSUrl() {
        var url = document.getElementById('icsUrl').value.trim();
        if (!url) {
            showToast('Please enter a URL');
            return;
        }
        if (window.isDemo) {
            showToast('Import not available in demo mode');
            return;
        }
        document.getElementById('importStatus').textContent = 'Fetching from URL...';
        var result = await makeApiCall('import_ics_url', { url: url, import_source: 'url', import_filename: url });
        if (result.status === 'success') {
            var count = result.count || 0;
            document.getElementById('importStatus').textContent = '';
            showToast('Imported ' + count + ' events from URL');
            closeImportModal();
            await loadEvents();
            renderAll();
        } else {
            document.getElementById('importStatus').textContent = '';
            showToast(result.message || 'Failed to import from URL');
        }
    }

    async function doImport(content, source, filename) {
        if (window.isDemo) {
            showToast('Import not available in demo mode');
            return;
        }
        var payload = { ics_content: content, import_source: source || 'paste', import_filename: filename || '' };
        var result = await makeApiCall('import_ics', payload);
        if (result.status === 'success') {
            showToast('Imported ' + result.count + ' events');
            closeImportModal();
            await loadEvents();
            renderAll();
        } else {
            showToast(result.message || 'Import failed');
        }
    }

    function openKeyboardHelp() {
        document.getElementById('keyboardHelpModal').classList.remove('hidden');
    }

    function closeKeyboardHelp() {
        document.getElementById('keyboardHelpModal').classList.add('hidden');
    }

    function setupNotifications() {
        if (!('Notification' in window) || window.isDemo) return;
        if (Notification.permission === 'granted') {
            scheduleReminders();
        } else if (Notification.permission === 'default') {
            Notification.requestPermission().then(function(perm) {
                if (perm === 'granted') scheduleReminders();
            });
        }
    }

    function scheduleReminders() {
        notificationTimers.forEach(function(t) { clearTimeout(t); });
        notificationTimers = [];
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        var now = new Date();
        var REMINDER_MINUTES = 15;
        var REMINDER_MS = REMINDER_MINUTES * 60 * 1000;
        var LOOKAHEAD_MS = 7 * 24 * 60 * 60 * 1000;
        var upcoming = events.filter(function(e) {
            if (e.all_day || !e.start_time || e.completed) return false;
            var h = parseInt(e.start_time.split(':')[0]);
            var m = parseInt(e.start_time.split(':')[1]);
            var parts = e.date.split('-');
            var evtTime = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), h, m);
            var diff = evtTime.getTime() - now.getTime();
            return diff > 0 && diff < LOOKAHEAD_MS;
        });
        upcoming.forEach(function(evt) {
            var h = parseInt(evt.start_time.split(':')[0]);
            var m = parseInt(evt.start_time.split(':')[1]);
            var parts = evt.date.split('-');
            var evtTime = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), h, m);
            var reminderTime = evtTime.getTime() - REMINDER_MS;
            var delay = reminderTime - now.getTime();
            if (delay > 0) {
                var timer = setTimeout(function() {
                    new Notification('Planner: ' + evt.title, {
                        body: 'Starting at ' + formatTime(evt.start_time) + (evt.end_time ? ' - ' + formatTime(evt.end_time) : '') + ' on ' + evt.date,
                        icon: 'favicon.svg'
                    });
                }, delay);
                notificationTimers.push(timer);
            } else {
                new Notification('Planner: ' + evt.title, {
                    body: 'Starting at ' + formatTime(evt.start_time) + (evt.end_time ? ' - ' + formatTime(evt.end_time) : '') + ' on ' + evt.date,
                    icon: 'favicon.svg'
                });
            }
        });
    }

    function initSidebarResizer() {
        var resizer = document.getElementById('sidebarResizer');
        var sidebar = document.getElementById('sidebar');
        if (!resizer || !sidebar) return;
        var isResizing = false;

        resizer.addEventListener('mousedown', function(e) {
            isResizing = true;
            resizer.classList.add('active');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', function(e) {
            if (!isResizing) return;
            var newWidth = window.innerWidth - e.clientX;
            if (newWidth < 240) newWidth = 240;
            if (newWidth > 600) newWidth = 600;
            sidebar.style.width = newWidth + 'px';
            sidebarWidth = newWidth;
        });

        document.addEventListener('mouseup', function() {
            if (isResizing) {
                isResizing = false;
                resizer.classList.remove('active');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        });
    }

    window._addAtSlot = function(el) {
        var date = el.dataset.date;
        var hour = parseInt(el.dataset.hour);
        openAddModal(date, hour);
    };

    window._addAtDate = function(date) {
        openAddModal(date);
    };

    window._editEvent = function(id) {
        openEditModal(id);
    };

    window._togglePast = function() {
        var list = document.getElementById('pastEventsList');
        if (list) {
            list.style.display = list.style.display === 'none' ? '' : 'none';
        }
    };

    window._toggleComplete = async function(id) {
        var evt = events.find(function(e) { return e.id === id; });
        if (!evt) return;
        var baseId = id.indexOf('_') !== -1 ? id.substring(0, id.lastIndexOf('_')) : id;
        if (evt.recurrence_parent) baseId = evt.recurrence_parent;
        var result = await makeApiCall('toggle_complete', { id: baseId });
        if (result.status === 'success') {
            evt.completed = result.completed;
            renderAll();
        }
    };

    window._quickDelete = async function(id) {
        var evt = events.find(function(e) { return e.id === id; });
        if (!evt) return;
        var deletedEvent = Object.assign({}, evt);
        await makeApiCall('delete', { id: id });
        events = events.filter(function(e) { return e.id !== id; });
        renderAll();
        showToast('Event deleted', function() {
            events.push(deletedEvent);
            makeApiCall('add', { event: deletedEvent });
            renderAll();
        });
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
    window.toggleFilter = toggleFilter;
    window.handleSearch = handleSearch;
    window.exportICS = exportICS;
    window.openImportModal = openImportModal;
    window.closeImportModal = closeImportModal;
    window.importICS = importICS;
    window.importICSUrl = importICSUrl;
    window.openKeyboardHelp = openKeyboardHelp;
    window.closeKeyboardHelp = closeKeyboardHelp;
    window.toggleMobileSidebar = toggleMobileSidebar;
    window.toggleAllDay = toggleAllDay;
    window.toggleByday = toggleByday;
    window.openManageModal = openManageModal;
    window.closeManageModal = closeManageModal;
    window.manageSelectAll = manageSelectAll;
    window.manageSelectNone = manageSelectNone;
    window.manageFilter = manageFilter;
    window.manageDeleteSelected = manageDeleteSelected;
    window.manageToggleCheck = manageToggleCheck;

    document.addEventListener('keydown', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
            if (e.key === 'Escape') closeModal();
            return;
        }

        var eventModal = document.getElementById('eventModal');
        var importModal = document.getElementById('importModal');
        var kbModal = document.getElementById('keyboardHelpModal');

        if (e.key === 'Escape') {
            if (!eventModal.classList.contains('hidden')) closeModal();
            else if (!importModal.classList.contains('hidden')) closeImportModal();
            else if (!kbModal.classList.contains('hidden')) closeKeyboardHelp();
            else if (!document.getElementById('manageModal').classList.contains('hidden')) closeManageModal();
            return;
        }

        if (!eventModal.classList.contains('hidden') || !importModal.classList.contains('hidden') || !kbModal.classList.contains('hidden') || !document.getElementById('manageModal').classList.contains('hidden')) return;

        switch(e.key) {
            case 'n': case 'N': openAddModal(); e.preventDefault(); break;
            case 't': case 'T': goToday(); e.preventDefault(); break;
            case 'ArrowLeft': navPrev(); e.preventDefault(); break;
            case 'ArrowRight': navNext(); e.preventDefault(); break;
            case 'w': case 'W': setView('week'); e.preventDefault(); break;
            case 'm': case 'M': setView('month'); e.preventDefault(); break;
            case '/': document.getElementById('searchInput').focus(); e.preventDefault(); break;
        }
    });

    document.getElementById('eventModal').addEventListener('click', function(e) {
        if (e.target === this) closeModal();
    });
    document.getElementById('importModal').addEventListener('click', function(e) {
        if (e.target === this) closeImportModal();
    });
    document.getElementById('keyboardHelpModal').addEventListener('click', function(e) {
        if (e.target === this) closeKeyboardHelp();
    });
    document.getElementById('manageModal').addEventListener('click', function(e) {
        if (e.target === this) closeManageModal();
    });

    var manageFilterType = 'all';
    var manageSelectedIds = {};
    var manageFilterSource = null;

    function openManageModal() {
        manageFilterType = 'all';
        manageSelectedIds = {};
        renderManageList();
        document.getElementById('manageModal').classList.remove('hidden');
    }

    function closeManageModal() {
        document.getElementById('manageModal').classList.add('hidden');
    }

    function manageFilter(type) {
        manageFilterType = type;
        manageSelectedIds = {};
        document.querySelectorAll('#manageFilterBar button').forEach(function(btn) {
            var isActive = btn.dataset.mfilter === type;
            btn.className = 'text-xs px-2.5 py-1 rounded-full transition ' + (isActive ? 'bg-zinc-700 text-white' : 'bg-zinc-800 text-zinc-400');
        });
        renderManageList();
    }

    function renderManageList() {
        var list = document.getElementById('manageList');
        var filtered = events.slice();
        if (manageFilterType === 'imported') {
            filtered = filtered.filter(function(e) { return !!e.import_source || !!e.import_uid; });
        } else if (manageFilterType !== 'all') {
            filtered = filtered.filter(function(e) { return e.type === manageFilterType; });
        }
        filtered.sort(function(a,b) { return a.date.localeCompare(b.date) || (a.start_time||'').localeCompare(b.start_time||''); });

        if (filtered.length === 0) {
            list.innerHTML = '<div class="text-center text-zinc-500 py-8">No events found</div>';
            updateManageCount();
            return;
        }

        var groups = {};
        filtered.forEach(function(e) {
            var source = e.import_source || 'Manual';
            var srcShort = source.length > 40 ? source.substring(0, 37) + '...' : source;
            if (!groups[srcShort]) groups[srcShort] = [];
            groups[srcShort].push(e);
        });

        var html = '';
        for (var src in groups) {
            if (manageFilterType === 'imported' || Object.keys(groups).length > 1) {
                html += '<div class="text-xs font-semibold text-zinc-500 uppercase tracking-wider mt-3 mb-1">' + escHtml(src) + '</div>';
            }
            groups[src].forEach(function(evt) {
                var color = COLOR_MAP[evt.color || TYPE_COLORS[evt.type]] || COLOR_MAP.violet;
                var checked = manageSelectedIds[evt.id] ? 'checked' : '';
                var dateLabel = evt.end_date ? evt.date + ' \u2013 ' + evt.end_date : evt.date;
                var timeLabel2 = evt.all_day ? 'All day' : (evt.start_time ? formatTime(evt.start_time) : '');
                html += '<label class="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800 cursor-pointer' + (manageSelectedIds[evt.id] ? ' bg-zinc-800/50' : '') + '">' +
                    '<input type="checkbox" class="w-4 h-4 accent-violet-500 shrink-0" data-manage-id="' + evt.id + '" ' + checked + ' onchange="window.manageToggleCheck(\'' + evt.id + '\')">' +
                    '<div class="w-2 h-2 rounded-full shrink-0" style="background:' + color.border + '"></div>' +
                    '<div class="min-w-0 flex-1">' +
                    '<div class="text-sm truncate">' + TYPE_ICONS[evt.type] + ' ' + escHtml(evt.title) + (evt.completed ? ' ✓' : '') + (evt.recurrence && evt.recurrence !== 'none' ? ' ↻' : '') + '</div>' +
                    '<div class="text-xs text-zinc-500">' + dateLabel + (timeLabel2 ? ' \u00b7 ' + timeLabel2 : '') + '</div>' +
                    '</div></label>';
            });
        }
        list.innerHTML = html;
        updateManageCount();
    }

    function manageToggleCheck(id) {
        if (manageSelectedIds[id]) {
            delete manageSelectedIds[id];
        } else {
            manageSelectedIds[id] = true;
        }
        updateManageCount();
    }

    function manageSelectAll() {
        var filtered = events.slice();
        if (manageFilterType === 'imported') {
            filtered = filtered.filter(function(e) { return !!e.import_source || !!e.import_uid; });
        } else if (manageFilterType !== 'all') {
            filtered = filtered.filter(function(e) { return e.type === manageFilterType; });
        }
        filtered.forEach(function(e) { manageSelectedIds[e.id] = true; });
        renderManageList();
    }

    function manageSelectNone() {
        manageSelectedIds = {};
        renderManageList();
    }

    function updateManageCount() {
        var count = Object.keys(manageSelectedIds).length;
        document.getElementById('manageSelectedCount').textContent = count + ' selected';
        var btn = document.getElementById('manageDeleteBtn');
        if (count > 0) {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
        } else {
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }

    async function manageDeleteSelected() {
        var ids = Object.keys(manageSelectedIds);
        if (ids.length === 0) return;
        var count = ids.length;
        var deletedEvents = events.filter(function(e) { return manageSelectedIds[e.id]; });

        if (window.isDemo) {
            events = events.filter(function(e) { return !manageSelectedIds[e.id]; });
            manageSelectedIds = {};
            renderManageList();
            renderAll();
            showToast('Deleted ' + count + ' events', function() {
                deletedEvents.forEach(function(e) { events.push(e); });
                renderManageList();
                renderAll();
            });
            return;
        }

        var result = await makeApiCall('delete_selected', { ids: ids });
        if (result.status === 'success') {
            events = events.filter(function(e) { return !manageSelectedIds[e.id]; });
            manageSelectedIds = {};
            renderManageList();
            renderAll();
            showToast('Deleted ' + (result.deleted || count) + ' events', function() {
                deletedEvents.forEach(function(e) { events.push(e); });
                makeApiCall('add', { event: null });
                for (var i = 0; i < deletedEvents.length; i++) {
                    makeApiCall('add', { event: deletedEvents[i] });
                }
                renderManageList();
                renderAll();
            });
        } else {
            showToast(result.message || 'Delete failed');
        }
    }

    document.getElementById('eventRecurrence').addEventListener('change', function() {
        toggleRecurrenceEnd(this.value);
    });

    async function init() {
        initTimeSelects();
        await loadEvents();
        setView('week');
        setupNotifications();
        initSidebarResizer();
        initMobileGestures();
        window.addEventListener('resize', function() { renderAll(); });
    }

    function initMobileGestures() {
        var grid = document.getElementById('weekGrid');
        var touchStartX = 0;
        var touchStartY = 0;
        grid.addEventListener('touchstart', function(e) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }, { passive: true });
        grid.addEventListener('touchend', function(e) {
            if (!isMobile() || currentView !== 'week') return;
            var dx = e.changedTouches[0].clientX - touchStartX;
            var dy = e.changedTouches[0].clientY - touchStartY;
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                if (dx < 0) navNext();
                else navPrev();
            }
        }, { passive: true });
    }

    init();
})();