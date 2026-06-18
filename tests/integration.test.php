#!/usr/bin/env php
<?php

$passed = 0;
$failed = 0;
$errors = [];
$base = 'https://localhost/planner/';
$ssoBase = 'https://localhost/sso/';
$cookieJar = sys_get_temp_dir() . '/planner_inttest_cookies.txt';

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
function assert_false($value, $msg = '') { assert_eq($value, false, $msg); }
function assert_not_null($value, $msg = '') { assert_eq($value !== null, true, $msg); }

function request($method, $path, $data = null, $csrf = null) {
    global $cookieJar;
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $path,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_COOKIEFILE => $cookieJar,
        CURLOPT_COOKIEJAR => $cookieJar,
    ]);
    $headers = [];
    if ($csrf) $headers[] = 'X-CSRF-Token: ' . $csrf;
    if ($data !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        $headers[] = 'Content-Type: application/json';
    }
    if (!empty($headers)) curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $error = curl_error($ch);
    curl_close($ch);
    if ($error) return ['http_code' => 0, 'headers' => '', 'body' => '', 'error' => $error];
    return ['http_code' => $httpCode, 'headers' => substr($response, 0, $headerSize), 'body' => substr($response, $headerSize), 'error' => null];
}

function get($path) { return request('GET', $path); }
function post($path, $data = null, $csrf = null) { return request('POST', $path, $data, $csrf); }

function extract_csrf($html) {
    if (preg_match('/<meta name="csrf-token" content="([^"]+)">/', $html, $m)) return $m[1];
    return null;
}

// ============================================================
echo "=== Environment Check ===\n";
$check = get($base);
if ($check['error'] || $check['http_code'] === 0) {
    echo "SKIP: Server not reachable: " . ($check['error'] ?? 'no response') . "\n";
    exit(0);
}
echo "Server reachable (HTTP {$check['http_code']})\n";

// ============================================================
echo "\n=== Unauthenticated Tests ===\n";

echo "\nTest 1: Unauthenticated access redirects to SSO\n";
$res = get($base);
assert_true(in_array($res['http_code'], [302, 303, 307]), "Should redirect to SSO, got HTTP {$res['http_code']}");
assert_contains($res['headers'], 'Location: /sso/', 'Should redirect to /sso/');

echo "\nTest 2: Unauthenticated API redirects to SSO\n";
$res = get($base . 'api.php');
assert_contains($res['headers'], 'Location: /sso/', 'Should redirect to SSO');

// ============================================================
echo "\n=== Security Headers Tests ===\n";

echo "\nTest 3: .git directory is blocked\n";
$res = get($base . '.git/config');
assert_true(in_array($res['http_code'], [403, 404]), ".git blocked, got HTTP {$res['http_code']}");

echo "\nTest 4: .htaccess is blocked\n";
$res = get($base . '.htaccess');
assert_true(in_array($res['http_code'], [403, 404]), ".htaccess blocked, got HTTP {$res['http_code']}");

echo "\nTest 5: JSON files are blocked\n";
$res = get($base . 'data/Sork_events.json');
assert_true(in_array($res['http_code'], [403, 404]), "JSON data blocked, got HTTP {$res['http_code']}");

echo "\nTest 6: Static assets are served\n";
$res = get($base . 'js/app.js');
assert_true($res['http_code'] === 200 || $res['http_code'] === 304, 'JS should be accessible');

// ============================================================
echo "\n=== Setup: Register test user via SSO ===\n";

$testUser = 'inttest_' . bin2hex(random_bytes(4));
$testPassword = 'TestPass123!';

register_shutdown_function(function() {
    global $cookieJar, $testUser, $base;
    @unlink($cookieJar);
    exec("docker exec php8site sh -c 'rm -f /var/www/planner/data/{$testUser}_events.json' 2>/dev/null");
});

echo "Getting CSRF token from SSO...\n";
$res = get($ssoBase);
assert_eq($res['http_code'], 200, 'SSO page should load');
$csrf = extract_csrf($res['body']);
assert_not_null($csrf, 'Should extract CSRF token');
echo "  CSRF token: " . substr($csrf, 0, 16) . "...\n";

echo "Registering test user '$testUser'...\n";
$res = post($ssoBase . 'api.php?action=register', [
    'username' => $testUser,
    'password' => $testPassword,
    'email' => '',
], $csrf);
assert_eq($res['http_code'], 200, 'Registration should return 200');
$body = json_decode($res['body'], true);
assert_true($body['success'] ?? false, 'Registration should succeed');
echo "  User registered successfully\n";

// ============================================================
echo "\n=== Authenticated Tests ===\n";

echo "\nTest 7: Authenticated page loads\n";
$res = get($base);
assert_eq($res['http_code'], 200, 'Authenticated page should load');

echo "\nTest 8: API POST without CSRF returns 403\n";
$res = post($base . 'api.php', ['action' => 'list']);
assert_eq($res['http_code'], 403, 'No-CSRF POST returns 403');

echo "\nTest 9: API POST with valid CSRF and add event\n";
$res = get($base);
$csrf2 = extract_csrf($res['body']);
assert_not_null($csrf2, 'Should extract CSRF from planner page');

$res = post($base . 'api.php', [
    'action' => 'add',
    'event' => [
        'title' => 'Test Event',
        'date' => date('Y-m-d'),
        'type' => 'task',
    ],
], $csrf2);
assert_eq($res['http_code'], 200, 'Add event should respond');
$body = json_decode($res['body'], true);
assert_true(($body['status'] ?? '') === 'success', 'Event should be created');

echo "\nTest 10: API POST with unknown action returns error\n";
$res = post($base . 'api.php', ['action' => 'nonexistent'], $csrf2);
$body = json_decode($res['body'], true);
assert_eq($body['status'] ?? '', 'error', 'Unknown action returns error');
assert_eq($body['message'] ?? '', 'Unknown action', 'Unknown action message');

echo "\nTest 11: GET api.php without CSRF returns 403\n";
$res = get($base . 'api.php');
assert_eq($res['http_code'], 403, 'GET without CSRF returns 403');

// ============================================================
echo "\n=== Cleanup ===\n";

exec("docker exec php8site sh -c 'rm -f /var/www/sso/data/{$testUser}.json' 2>/dev/null");
echo "  Cleaned up SSO test user\n";
exec("docker exec php8site sh -c 'rm -f /var/www/sso/data/rate_limits/*.json /var/www/sso/data/rate_limits/*.lock' 2>/dev/null");
echo "  Cleaned up rate limiter\n";
exec("docker exec php8site sh -c 'rm -f /var/www/planner/data/{$testUser}_events.json' 2>/dev/null");
echo "  Cleaned up planner test data\n";
@unlink($cookieJar);
echo "  Cleaned up cookie jar\n";

// ============================================================
$total = $passed + $failed;
echo "\n" . str_repeat('=', 50) . "\n";
echo "Planner Integration Tests: $passed passed, $failed failed ($total total)\n";
if (count($errors) > 0) {
    echo "\nFailures:\n";
    foreach ($errors as $err) echo "  - $err\n";
}
echo str_repeat('=', 50) . "\n";

exit($failed > 0 ? 1 : 0);
