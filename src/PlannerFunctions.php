<?php

function expandRecurrence($events) {
    $DAY_MAP = ['SU'=>0,'MO'=>1,'TU'=>2,'WE'=>3,'TH'=>4,'FR'=>5,'SA'=>6];
    $expanded = [];
    $now = new DateTime();
    $limit = clone $now;
    $limit->modify('+1 year');
    $pastLimit = clone $now;
    $pastLimit->modify('-1 year');
    foreach ($events as $evt) {
        if (empty($evt['recurrence']) || $evt['recurrence'] === 'none') {
            $expanded[] = $evt;
            continue;
        }
        $start = new DateTime($evt['date']);
        $until = isset($evt['recurrence_end']) && $evt['recurrence_end'] ? new DateTime($evt['recurrence_end']) : clone $limit;
        if ($until > $limit) $until = clone $limit;
        $interval = ['daily' => 'P1D', 'weekly' => 'P1W', 'monthly' => 'P1M', 'yearly' => 'P1Y'][$evt['recurrence']] ?? 'P1W';
        $intervalN = isset($evt['recurrence_interval']) && intval($evt['recurrence_interval']) > 1 ? intval($evt['recurrence_interval']) : 1;
        $byday = isset($evt['recurrence_byday']) && !empty($evt['recurrence_byday']) ? explode(',', $evt['recurrence_byday']) : [];
        $bydayNums = array_map(function($d) use ($DAY_MAP) { return $DAY_MAP[strtoupper($d)] ?? null; }, $byday);
        $bydayNums = array_filter($bydayNums, function($d) { return $d !== null; });

        $di = new DateInterval($interval);
        if ($intervalN > 1) $di = new DateInterval(str_replace('P1', 'P' . $intervalN, $interval));

        $period = new DatePeriod($start, $di, $until);
        $idx = 0;
        foreach ($period as $d) {
            if (!empty($bydayNums)) {
                if (!in_array((int)$d->format('w'), $bydayNums)) continue;
            }
            if ($d < $pastLimit) { $idx++; continue; }
            if ($d > $until) break;
            $occ = $evt;
            $occ['date'] = $d->format('Y-m-d');
            $occ['id'] = $evt['id'] . '_' . $d->format('Ymd');
            $occ['recurrence_parent'] = $evt['id'];
            $occ['recurrence_idx'] = $idx;
            if (!empty($occ['end_date']) && $occ['end_date'] !== $evt['date']) {
                $startDt = new DateTime($evt['date']);
                $endDt = new DateTime($evt['end_date']);
                $diffDays = $startDt->diff($endDt)->days;
                $occEnd = clone $d;
                $occEnd->modify('+' . $diffDays . ' days');
                $occ['end_date'] = $occEnd->format('Y-m-d');
            }
            $expanded[] = $occ;
            $idx++;
        }
    }
    return $expanded;
}

function generateICS($events) {
    $ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Planner//EN\r\nCALSCALE:GREGORIAN\r\n";
    foreach ($events as $evt) {
        $dtStart = str_replace('-', '', $evt['date']);
        $dtEnd = $dtStart;
        if (!empty($evt['start_time'])) {
            $dtStart .= 'T' . str_replace(':', '', $evt['start_time']) . '00';
            if (!empty($evt['end_time'])) {
                if (!empty($evt['end_date'])) {
                    $dtEnd = str_replace('-', '', $evt['end_date']) . 'T' . str_replace(':', '', $evt['end_time']) . '00';
                } else {
                    $dtEnd = str_replace('-', '', $evt['date']) . 'T' . str_replace(':', '', $evt['end_time']) . '00';
                }
            } else {
                $h = intval($evt['start_time']);
                $dtEnd = str_replace('-', '', $evt['date']) . 'T' . sprintf('%02d', $h + 1) . str_replace(':', '', substr($evt['start_time'], 2)) . '00';
            }
        }
        if ($evt['all_day'] ?? false) {
            $dtStart = str_replace('-', '', $evt['date']);
            if (!empty($evt['end_date'])) {
                $endDay = (new DateTime($evt['end_date']))->modify('+1 day')->format('Ymd');
            } else {
                $endDay = (new DateTime($evt['date']))->modify('+1 day')->format('Ymd');
            }
            $dtEnd = $endDay;
            $ics .= "BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:{$dtStart}\r\nDTEND;VALUE=DATE:{$dtEnd}\r\n";
        } elseif (!empty($evt['start_time'])) {
            $ics .= "BEGIN:VEVENT\r\nDTSTART:{$dtStart}\r\nDTEND:{$dtEnd}\r\n";
        } else {
            $dtStart = str_replace('-', '', $evt['date']);
            if (!empty($evt['end_date'])) {
                $dtEnd = (new DateTime($evt['end_date']))->modify('+1 day')->format('Ymd');
            } else {
                $dtEnd = (new DateTime($evt['date']))->modify('+1 day')->format('Ymd');
            }
            $ics .= "BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:{$dtStart}\r\nDTEND;VALUE=DATE:{$dtEnd}\r\n";
        }
        $ics .= "SUMMARY:" . addcslashes($evt['title'], "\r\n;,:") . "\r\n";
        if (!empty($evt['description'])) {
            $ics .= "DESCRIPTION:" . addcslashes($evt['description'], "\r\n;,:") . "\r\n";
        }
        if (!empty($evt['recurrence']) && $evt['recurrence'] !== 'none') {
            $rrule = ['daily' => 'FREQ=DAILY', 'weekly' => 'FREQ=WEEKLY', 'monthly' => 'FREQ=MONTHLY', 'yearly' => 'FREQ=YEARLY'][$evt['recurrence']] ?? '';
            if ($rrule) {
                if (!empty($evt['recurrence_interval']) && intval($evt['recurrence_interval']) > 1) {
                    $rrule .= ';INTERVAL=' . intval($evt['recurrence_interval']);
                }
                if (!empty($evt['recurrence_byday'])) {
                    $rrule .= ';BYDAY=' . $evt['recurrence_byday'];
                }
                if (!empty($evt['recurrence_end'])) {
                    $until = str_replace('-', '', $evt['recurrence_end']) . 'T235959';
                    $rrule .= ";UNTIL={$until}";
                }
                $ics .= "RRULE:{$rrule}\r\n";
            }
        }
        $ics .= "UID:{$evt['id']}@planner\r\nEND:VEVENT\r\n";
    }
    $ics .= "END:VCALENDAR\r\n";
    return $ics;
}
