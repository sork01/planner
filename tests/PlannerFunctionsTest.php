#!/usr/bin/env php
<?php
require_once __DIR__ . '/../src/PlannerFunctions.php';

$passed = 0;
$failed = 0;
$errors = [];

function assert_eq($actual, $expected, $msg = '') {
    global $passed, $failed, $errors;
    if ($actual === $expected) { $passed++; return; }
    $failed++;
    $errors[] = ($msg ? "$msg: " : '') . "Expected " . var_export($expected, true) . ", got " . var_export($actual, true);
    echo "  FAIL: " . end($errors) . "\n";
}

function assert_contains($haystack, $needle, $msg = '') {
    global $passed, $failed, $errors;
    if (str_contains($haystack, $needle)) { $passed++; return; }
    $failed++;
    $errors[] = ($msg ? "$msg: " : '') . "Expected to find: " . var_export($needle, true);
    echo "  FAIL: " . end($errors) . "\n";
}

function assert_true($value, $msg = '') { assert_eq($value, true, $msg); }
function assert_not_null($value, $msg = '') { assert_eq($value !== null, true, $msg); }

echo "=== PlannerFunctions Unit Tests ===\n";

// ============================================================
echo "\nTest 1: expandRecurrence passes through non-recurring events\n";
$events = [
    ['id' => 'evt_1', 'title' => 'Meeting', 'date' => '2026-06-18', 'recurrence' => 'none'],
];
$expanded = expandRecurrence($events);
assert_eq(count($expanded), 1, 'Single non-recurring event');
assert_eq($expanded[0]['title'], 'Meeting', 'Title preserved');

// ============================================================
echo "\nTest 2: expandRecurrence expands weekly event\n";
$events = [
    ['id' => 'evt_weekly', 'title' => 'Standup', 'date' => date('Y-m-d'), 'recurrence' => 'weekly'],
];
$expanded = expandRecurrence($events);
assert_true(count($expanded) > 1, 'Should expand to multiple occurrences');
assert_true(str_contains($expanded[1]['id'], 'evt_weekly'), 'Id has parent prefix');

// ============================================================
echo "\nTest 3: expandRecurrence expands daily event\n";
$events = [
    ['id' => 'evt_daily', 'title' => 'Daily', 'date' => date('Y-m-d'), 'recurrence' => 'daily'],
];
$expanded = expandRecurrence($events);
assert_true(count($expanded) > 2, 'Daily expands to many occurrences');

// ============================================================
echo "\nTest 4: expandRecurrence respects recurrence_end\n";
$events = [
    ['id' => 'evt_limited', 'title' => 'Limited', 'date' => date('Y-m-d'), 'recurrence' => 'daily', 'recurrence_end' => date('Y-m-d', strtotime('+3 days'))],
];
$expanded = expandRecurrence($events);
assert_true(count($expanded) >= 3 && count($expanded) <= 5, 'Limited by end date (got ' . count($expanded) . ')');

// ============================================================
echo "\nTest 5: expandRecurrence handles BYDAY filter\n";
// Next Monday
$nextMon = date('Y-m-d', strtotime('next Monday'));
$events = [
    ['id' => 'evt_byday', 'title' => 'MWF', 'date' => $nextMon, 'recurrence' => 'weekly', 'recurrence_byday' => 'MO,WE,FR'],
];
$expanded = expandRecurrence($events);
assert_true(count($expanded) > 0, 'Should expand BYDAY event');
// Each occurrence should be Mon, Wed, or Fri
foreach ($expanded as $occ) {
    $dayOfWeek = date('w', strtotime($occ['date']));
    assert_true(in_array($dayOfWeek, [1, 3, 5]), "BYDAY filter: day $dayOfWeek should be Mon(1), Wed(3), or Fri(5)");
}

// ============================================================
echo "\nTest 6: expandRecurrence handles interval > 1\n";
$events = [
    ['id' => 'evt_biweekly', 'title' => 'Biweekly', 'date' => date('Y-m-d'), 'recurrence' => 'weekly', 'recurrence_interval' => 2],
];
$expanded = expandRecurrence($events);
assert_true(count($expanded) > 0, 'Biweekly event expands');

// ============================================================
echo "\nTest 7: expandRecurrence shifts end_date for multi-day recurring events\n";
$events = [
    ['id' => 'evt_multiday', 'title' => 'Multi', 'date' => '2026-06-18', 'end_date' => '2026-06-20', 'recurrence' => 'weekly'],
];
$expanded = expandRecurrence($events);
if (count($expanded) > 1) {
    $second = $expanded[1];
    assert_true(strlen($second['end_date'] ?? '') > 0, 'Second occurrence has end_date');
    $diff = (strtotime($second['end_date']) - strtotime($second['date'])) / 86400;
    assert_eq($diff, 2, 'End date shifted by same duration as original');
}

// ============================================================
echo "\nTest 8: generateICS creates valid basic event\n";
$events = [
    ['id' => 'evt_001', 'title' => 'Test Event', 'date' => '2026-06-18', 'type' => 'task', 'all_day' => false, 'completed' => false, 'recurrence' => 'none'],
];
$ics = generateICS($events);
assert_contains($ics, 'BEGIN:VCALENDAR', 'Has VCALENDAR');
assert_contains($ics, 'BEGIN:VEVENT', 'Has VEVENT');
assert_contains($ics, 'SUMMARY:Test Event', 'Has summary');
assert_contains($ics, 'UID:evt_001@planner', 'Has UID');
assert_contains($ics, 'END:VEVENT', 'Has END:VEVENT');
assert_contains($ics, 'END:VCALENDAR', 'Has END:VCALENDAR');

// ============================================================
echo "\nTest 9: generateICS handles all-day events\n";
$events = [
    ['id' => 'evt_allday', 'title' => 'All Day', 'date' => '2026-06-18', 'type' => 'meeting', 'all_day' => true, 'completed' => false, 'recurrence' => 'none'],
];
$ics = generateICS($events);
assert_contains($ics, 'DTSTART;VALUE=DATE:20260618', 'All-day DTSTART');
assert_contains($ics, 'DTEND;VALUE=DATE:20260619', 'All-day DTEND (+1 day)');

// ============================================================
echo "\nTest 10: generateICS handles timed events\n";
$events = [
    ['id' => 'evt_timed', 'title' => 'Timed', 'date' => '2026-06-18', 'start_time' => '14:30', 'end_time' => '15:00', 'type' => 'meeting', 'all_day' => false, 'completed' => false, 'recurrence' => 'none'],
];
$ics = generateICS($events);
assert_contains($ics, 'DTSTART:20260618T143000', 'DTSTART with time');
assert_contains($ics, 'DTEND:20260618T150000', 'DTEND with time');

// ============================================================
echo "\nTest 11: generateICS handles recurring event RRULE\n";
$events = [
    ['id' => 'evt_recur', 'title' => 'Recurring', 'date' => '2026-06-18', 'type' => 'meeting', 'all_day' => false, 'completed' => false, 'recurrence' => 'weekly', 'recurrence_byday' => 'MO,WE'],
];
$ics = generateICS($events);
assert_contains($ics, 'RRULE:', 'Has RRULE');
assert_contains($ics, 'FREQ=WEEKLY', 'Weekly frequency');
assert_contains($ics, 'BYDAY=MO,WE', 'BYDAY filter');

// ============================================================
echo "\nTest 12: generateICS handles RRULE with interval\n";
$events = [
    ['id' => 'evt_bi', 'title' => 'Biweekly', 'date' => '2026-06-18', 'type' => 'meeting', 'all_day' => false, 'completed' => false, 'recurrence' => 'weekly', 'recurrence_interval' => 2],
];
$ics = generateICS($events);
assert_contains($ics, 'INTERVAL=2', 'Has interval');

// ============================================================
echo "\nTest 13: generateICS handles RRULE with UNTIL\n";
$events = [
    ['id' => 'evt_until', 'title' => 'Limited', 'date' => '2026-06-18', 'type' => 'task', 'all_day' => false, 'completed' => false, 'recurrence' => 'daily', 'recurrence_end' => '2026-06-25'],
];
$ics = generateICS($events);
assert_contains($ics, 'UNTIL=20260625T235959', 'Has UNTIL');

// ============================================================
echo "\nTest 14: generateICS multiple events\n";
$events = [
    ['id' => 'evt_a', 'title' => 'Event A', 'date' => '2026-06-18', 'type' => 'task', 'all_day' => true, 'completed' => false, 'recurrence' => 'none'],
    ['id' => 'evt_b', 'title' => 'Event B', 'date' => '2026-06-19', 'type' => 'meeting', 'all_day' => false, 'start_time' => '10:00', 'end_time' => '11:00', 'completed' => false, 'recurrence' => 'none'],
];
$ics = generateICS($events);
assert_eq(substr_count($ics, 'BEGIN:VEVENT'), 2, 'Two VEVENT blocks');
assert_contains($ics, 'Event A', 'First event');
assert_contains($ics, 'Event B', 'Second event');

// ============================================================
echo "\nTest 15: generateICS escapes special characters in summary\n";
$events = [
    ['id' => 'evt_esc', 'title' => "Lunch; Meeting, Special: Characters", 'date' => '2026-06-18', 'type' => 'task', 'all_day' => false, 'completed' => false, 'recurrence' => 'none'],
];
$ics = generateICS($events);
assert_contains($ics, 'Lunch\; Meeting\, Special\: Characters', 'Special chars escaped');

// ============================================================
$total = $passed + $failed;
echo "\n" . str_repeat('=', 50) . "\n";
echo "PlannerFunctions Tests: $passed passed, $failed failed ($total total)\n";
if (count($errors) > 0) {
    echo "\nFailures:\n";
    foreach ($errors as $err) echo "  - $err\n";
}
echo str_repeat('=', 50) . "\n";

exit($failed > 0 ? 1 : 0);
