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

$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents('php://input'), true);

if ($method === 'GET') {
    $data = loadData($dataFile);
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
        $data['events'][] = $event;
        if (saveData($dataFile, $data)) {
            echo json_encode(['status' => 'success', 'event' => $event]);
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
        $found = false;
        foreach ($data['events'] as $i => $e) {
            if ($e['id'] === $id) {
                $event['id'] = $id;
                $event['created_at'] = $e['created_at'] ?? date('Y-m-d H:i:s');
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

    if ($action === 'delete') {
        $id = $input['id'] ?? null;
        if (!$id) {
            echo json_encode(['status' => 'error', 'message' => 'Missing id']);
            exit;
        }
        $data = loadData($dataFile);
        $data['events'] = array_values(array_filter($data['events'], fn($e) => $e['id'] !== $id));
        if (saveData($dataFile, $data)) {
            echo json_encode(['status' => 'success']);
        } else {
            echo json_encode(['status' => 'error', 'message' => 'Failed to save']);
        }
        exit;
    }

    echo json_encode(['status' => 'error', 'message' => 'Unknown action']);
    exit;
}

echo json_encode(['status' => 'error', 'message' => 'Method not allowed']);