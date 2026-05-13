<?php
require_once __DIR__ . '/../sso/auth.php';
require 'config.php';

$user = requireAuth();

header('Content-Type: application/json');

$csrfToken = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
if (!ssoVerifyCsrf($csrfToken)) {
    http_response_code(403);
    echo json_encode(['status' => 'error', 'message' => 'CSRF validation failed']);
    exit;
}

$username = preg_replace('/[^a-zA-Z0-9_-]/', '', $user['username']);
if (empty($username)) {
    echo json_encode(['status' => 'error', 'message' => 'Invalid username']);
    exit;
}

$dataFile = DATA_DIR . $username . '_events.json';

function loadData($file) {
    if (!file_exists($file)) return ['events' => []];
    $data = json_decode(file_get_contents($file), true);
    return $data ?: ['events' => []];
}

function saveData($file, $data) {
    $tmp = $file . '.' . bin2hex(random_bytes(8)) . '.tmp';
    if (file_put_contents($tmp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) === false) {
        @unlink($tmp);
        return false;
    }
    if (!rename($tmp, $file)) {
        @unlink($tmp);
        return false;
    }
    return true;
}

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

$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents('php://input'), true);

if ($method === 'GET') {
    $action = $_GET['action'] ?? '';
    if ($action === 'export_ics') {
        $data = loadData($dataFile);
        $ics = generateICS($data['events']);
        $ics = str_replace("\r\n", "\r\n", $ics);
        header('Content-Type: text/calendar; charset=utf-8');
        header('Content-Disposition: attachment; filename="planner.ics"');
        echo $ics;
        exit;
    }
    if ($action === 'import_ics') {
        echo json_encode(['status' => 'error', 'message' => 'Use POST for import']);
        exit;
    }
    $data = loadData($dataFile);
    $data['events'] = expandRecurrence($data['events']);
    echo json_encode($data);
    exit;
}

if ($method === 'POST') {
    $action = $input['action'] ?? '';

    if ($action === 'add') {
        $event = $input['event'] ?? null;
        if (!$event || !isset($event['title'], $event['date'], $event['type'])) {
            echo json_encode(['status' => 'error', 'message' => 'Missing required fields']);
            exit;
        }
        $data = loadData($dataFile);
        $event['id'] = uniqid('evt_', true);
        $event['created_at'] = date('Y-m-d H:i:s');
        if (!isset($event['completed'])) $event['completed'] = false;
        if (!isset($event['all_day'])) $event['all_day'] = false;
        if (!isset($event['recurrence'])) $event['recurrence'] = 'none';
        if (empty($event['end_date'])) $event['end_date'] = null;
        if (empty($event['recurrence_interval'])) $event['recurrence_interval'] = 1;
        if (empty($event['recurrence_byday'])) $event['recurrence_byday'] = null;
        $data['events'][] = $event;
        if (saveData($dataFile, $data)) {
            $expanded = expandRecurrence([$event]);
            echo json_encode(['status' => 'success', 'event' => $expanded[0] ?? $event]);
        } else {
            echo json_encode(['status' => 'error', 'message' => 'Failed to save']);
        }
        exit;
    }

    if ($action === 'update') {
        $event = $input['event'] ?? null;
        $id = $input['id'] ?? null;
        if (!$id || !$event) {
            echo json_encode(['status' => 'error', 'message' => 'Missing id or event data']);
            exit;
        }
        $data = loadData($dataFile);
        $baseId = $id;
        if (strpos($id, '_') !== false) {
            $parts = explode('_', $id);
            array_pop($parts);
            $baseId = implode('_', $parts);
        }
        if (strpos($baseId, 'evt_') !== 0) $baseId = $id;
        $found = false;
        foreach ($data['events'] as $i => $e) {
            if ($e['id'] === $baseId || $e['id'] === $id) {
                $event['id'] = $e['id'];
                $event['created_at'] = $e['created_at'] ?? date('Y-m-d H:i:s');
                if (!isset($event['completed'])) $event['completed'] = $e['completed'] ?? false;
                if (!isset($event['all_day'])) $event['all_day'] = $e['all_day'] ?? false;
                if (!isset($event['recurrence'])) $event['recurrence'] = $e['recurrence'] ?? 'none';
                if (!isset($event['end_date'])) $event['end_date'] = $e['end_date'] ?? null;
                if (!isset($event['recurrence_interval'])) $event['recurrence_interval'] = $e['recurrence_interval'] ?? 1;
                if (!isset($event['recurrence_byday'])) $event['recurrence_byday'] = $e['recurrence_byday'] ?? null;
                $data['events'][$i] = $event;
                $found = true;
                break;
            }
        }
        if (!$found) {
            echo json_encode(['status' => 'error', 'message' => 'Event not found']);
            exit;
        }
        if (saveData($dataFile, $data)) {
            echo json_encode(['status' => 'success', 'event' => $event]);
        } else {
            echo json_encode(['status' => 'error', 'message' => 'Failed to save']);
        }
        exit;
    }

    if ($action === 'toggle_complete') {
        $id = $input['id'] ?? null;
        if (!$id) {
            echo json_encode(['status' => 'error', 'message' => 'Missing id']);
            exit;
        }
        $data = loadData($dataFile);
        $baseId = $id;
        if (strpos($id, '_') !== false) {
            $parts = explode('_', $id);
            array_pop($parts);
            $baseId = implode('_', $parts);
        }
        $found = false;
        foreach ($data['events'] as $i => $e) {
            if ($e['id'] === $baseId || $e['id'] === $id) {
                $data['events'][$i]['completed'] = empty($e['completed']);
                $found = true;
                break;
            }
        }
        if (!$found) {
            echo json_encode(['status' => 'error', 'message' => 'Event not found']);
            exit;
        }
        if (saveData($dataFile, $data)) {
            echo json_encode(['status' => 'success', 'completed' => $data['events'][$i]['completed']]);
        } else {
            echo json_encode(['status' => 'error', 'message' => 'Failed to save']);
        }
        exit;
    }

    if ($action === 'delete') {
        $id = $input['id'] ?? null;
        if (!$id) {
            echo json_encode(['status' => 'error', 'message' => 'Missing id']);
            exit;
        }
        $data = loadData($dataFile);
        $baseId = $id;
        if (strpos($id, '_') !== false) {
            $parts = explode('_', $id);
            array_pop($parts);
            $baseId = implode('_', $parts);
        }
        $data['events'] = array_values(array_filter($data['events'], fn($e) => $e['id'] !== $baseId && $e['id'] !== $id));
        if (saveData($dataFile, $data)) {
            echo json_encode(['status' => 'success']);
        } else {
            echo json_encode(['status' => 'error', 'message' => 'Failed to save']);
        }
        exit;
    }

    if ($action === 'delete_selected') {
        $ids = $input['ids'] ?? [];
        if (empty($ids) || !is_array($ids)) {
            echo json_encode(['status' => 'error', 'message' => 'No IDs provided']);
            exit;
        }
        $data = loadData($dataFile);
        $idSet = array_flip($ids);
        foreach ($ids as &$idRef) {
            if (strpos($idRef, '_') !== false) {
                $parts = explode('_', $idRef);
                array_pop($parts);
                $idSet[implode('_', $parts)] = true;
            }
        }
        unset($idRef);
        $before = count($data['events']);
        $data['events'] = array_values(array_filter($data['events'], fn($e) => !isset($idSet[$e['id']])));
        $deleted = $before - count($data['events']);
        if (saveData($dataFile, $data)) {
            echo json_encode(['status' => 'success', 'deleted' => $deleted]);
        } else {
            echo json_encode(['status' => 'error', 'message' => 'Failed to save']);
        }
        exit;
    }

    if ($action === 'import_ics_url') {
        $url = $input['url'] ?? '';
        if (empty($url) || !filter_var($url, FILTER_VALIDATE_URL)) {
            echo json_encode(['status' => 'error', 'message' => 'Invalid URL']);
            exit;
        }
        $allowed = false;
        foreach (['http://', 'https://', 'webcal://', 'webcals://'] as $prefix) {
            if (stripos($url, $prefix) === 0) { $allowed = true; break; }
        }
        if (!$allowed) {
            echo json_encode(['status' => 'error', 'message' => 'Only http/https/webcal URLs are allowed']);
            exit;
        }
        $url = str_ireplace(['webcal://', 'webcals://'], ['https://', 'https://'], $url);
        $ctx = stream_context_create(['http' => ['timeout' => 15, 'follow_location' => true, 'max_redirects' => 5], 'ssl' => ['verify_peer' => true]]);
        $icsData = @file_get_contents($url, false, $ctx);
        if ($icsData === false) {
            echo json_encode(['status' => 'error', 'message' => 'Could not fetch the URL. Check that it\'s accessible.']);
            exit;
        }
        $input['ics_content'] = $icsData;
    }

    if ($action === 'import_ics' || $action === 'import_ics_url') {
        $icsData = $input['ics_content'] ?? '';
        $importSource = $input['import_source'] ?? null;
        if ($importSource === 'url' && !empty($input['url'])) {
            $importSource = 'URL: ' . $input['url'];
        } elseif ($importSource === 'file' && !empty($input['import_filename'])) {
            $importSource = 'File: ' . $input['import_filename'];
        } elseif ($importSource === 'paste') {
            $importSource = 'Pasted ICS ' . date('Y-m-d H:i:s');
        }
        if (empty($icsData)) {
            echo json_encode(['status' => 'error', 'message' => 'No ICS data provided']);
            exit;
        }
        $icsData = preg_replace('/\r?\n[ \t]/', '', $icsData);
        $parsed = [];
        $lines = preg_split('/\r?\n/', $icsData);
        $inEvent = false;
        $current = [];
        foreach ($lines as $line) {
            $line = rtrim($line);
            if ($line === '') continue;
            if ($line === 'BEGIN:VEVENT') {
                $inEvent = true;
                $current = ['type' => 'task', 'color' => 'violet', 'all_day' => false, 'completed' => false, 'recurrence' => 'none', 'end_date' => null, 'recurrence_interval' => 1, 'recurrence_byday' => null];
                if ($importSource) $current['import_source'] = $importSource;
            } elseif ($line === 'END:VEVENT') {
                $inEvent = false;
                if (!empty($current['title']) && !empty($current['date'])) {
                    $current['id'] = uniqid('evt_', true);
                    $current['created_at'] = date('Y-m-d H:i:s');
                    $parsed[] = $current;
                }
                $current = [];
            } elseif ($inEvent) {
                $colonPos = strpos($line, ':');
                if ($colonPos === false) continue;
                $propPart = substr($line, 0, $colonPos);
                $val = substr($line, $colonPos + 1);
                $propUpper = strtoupper(strtok($propPart, ';'));
                if ($propUpper === 'SUMMARY') {
                    $current['title'] = rtrim(str_replace(['\\n', '\\N', "\r\n", "\n", "\r"], ' ', $val));
                } elseif ($propUpper === 'DESCRIPTION') {
                    $current['description'] = rtrim(str_replace(['\\n', '\\N', "\r\n", "\n", "\r"], ' ', $val));
                } elseif ($propUpper === 'DTSTART') {
                    $isDateOnly = stripos($propPart, 'VALUE=DATE') !== false;
                    $val = rtrim($val, 'Z');
                    if ($isDateOnly) {
                        $current['date'] = substr($val, 0, 4) . '-' . substr($val, 4, 2) . '-' . substr($val, 6, 2);
                        $current['all_day'] = true;
                    } else {
                        $current['date'] = substr($val, 0, 4) . '-' . substr($val, 4, 2) . '-' . substr($val, 6, 2);
                        if (strlen($val) >= 13 && $val[8] === 'T') {
                            $current['start_time'] = substr($val, 9, 2) . ':' . substr($val, 11, 2);
                        }
                    }
                } elseif ($propUpper === 'DTEND') {
                    $isDateOnly = stripos($propPart, 'VALUE=DATE') !== false;
                    $val = rtrim($val, 'Z');
                    if ($isDateOnly) {
                        $endDate = substr($val, 0, 4) . '-' . substr($val, 4, 2) . '-' . substr($val, 6, 2);
                        if (strlen($val) >= 13 && $val[8] === 'T') {
                            $current['end_time'] = substr($val, 9, 2) . ':' . substr($val, 11, 2);
                        }
                        $startDate = $current['date'] ?? null;
                        if ($startDate) {
                            $inclEnd = (new DateTime($endDate))->modify('-1 day')->format('Y-m-d');
                            if ($inclEnd > $startDate) {
                                $current['end_date'] = $inclEnd;
                            }
                        }
                    } else {
                        $endDateStr = substr($val, 0, 4) . '-' . substr($val, 4, 2) . '-' . substr($val, 6, 2);
                        if (strlen($val) >= 13 && $val[8] === 'T') {
                            $current['end_time'] = substr($val, 9, 2) . ':' . substr($val, 11, 2);
                        }
                        $startDate = $current['date'] ?? null;
                        if ($startDate && $endDateStr !== $startDate) {
                            $current['end_date'] = $endDateStr;
                        }
                    }
                } elseif ($propUpper === 'RRULE') {
                    $rrule = $val;
                    if (stripos($rrule, 'FREQ=DAILY') !== false) $current['recurrence'] = 'daily';
                    elseif (stripos($rrule, 'FREQ=WEEKLY') !== false) $current['recurrence'] = 'weekly';
                    elseif (stripos($rrule, 'FREQ=MONTHLY') !== false) $current['recurrence'] = 'monthly';
                    elseif (stripos($rrule, 'FREQ=YEARLY') !== false) $current['recurrence'] = 'yearly';
                    if (preg_match('/INTERVAL=(\d+)/i', $rrule, $m)) {
                        $current['recurrence_interval'] = intval($m[1]);
                    }
                    if (preg_match('/BYDAY=([A-Z,]+)/i', $rrule, $m)) {
                        $current['recurrence_byday'] = strtoupper($m[1]);
                    }
                    if (stripos($rrule, 'UNTIL=') !== false) {
                        $untilVal = substr($rrule, stripos($rrule, 'UNTIL=') + 6);
                        $untilVal = rtrim(explode(';', $untilVal)[0], 'Z');
                        $untilClean = preg_replace('/[^0-9]/', '', substr($untilVal, 0, 8));
                        if (strlen($untilClean) === 8) {
                            $current['recurrence_end'] = substr($untilClean, 0, 4) . '-' . substr($untilClean, 4, 2) . '-' . substr($untilClean, 6, 2);
                        }
                    }
                } elseif ($propUpper === 'UID') {
                    $current['import_uid'] = $val;
                }
            }
        }
        if (empty($parsed)) {
            echo json_encode(['status' => 'error', 'message' => 'No valid events found in ICS file']);
            exit;
        }
        $data = loadData($dataFile);
        foreach ($parsed as $evt) {
            $data['events'][] = $evt;
        }
        if (saveData($dataFile, $data)) {
            echo json_encode(['status' => 'success', 'count' => count($parsed)]);
        } else {
            echo json_encode(['status' => 'error', 'message' => 'Failed to save']);
        }
        exit;
    }

    echo json_encode(['status' => 'error', 'message' => 'Unknown action']);
    exit;
}

echo json_encode(['status' => 'error', 'message' => 'Method not allowed']);