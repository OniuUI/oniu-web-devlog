<?php
declare(strict_types=1);

ignore_user_abort(true);
@set_time_limit(0);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function respond(int $status, array $payload): void {
  http_response_code($status);
  echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  exit;
}

function read_json_body(): array {
  $raw = file_get_contents('php://input');
  if ($raw === false || trim($raw) === '') return [];
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}

function now_ms(): int {
  return (int) round(microtime(true) * 1000);
}

function data_dir(): string {
  $dir = realpath(__DIR__ . '/../_data');
  if ($dir === false) {
    $dir = __DIR__ . '/../_data';
    @mkdir($dir, 0755, true);
    $dir = realpath($dir);
  }
  if ($dir === false) respond(500, ['error' => 'data_dir_unavailable']);
  return $dir;
}

function safe_room($v): string {
  $room = is_string($v) ? trim($v) : '';
  if ($room === '' || !preg_match('/^[a-z0-9_-]{1,32}$/', $room)) return 'global';
  return $room;
}

function safe_channel($v): string {
  $c = is_string($v) ? trim($v) : '';
  if ($c === '' || !preg_match('/^[a-z0-9_-]{1,64}$/', $c)) return 'global';
  return $c;
}

function safe_id($v): ?string {
  if (!is_string($v)) return null;
  $id = trim($v);
  if ($id === '') return null;
  if (preg_match('/^[0-9a-f]{32}$/i', $id)) return strtolower($id);
  if (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $id)) return strtolower($id);
  return null;
}

function safe_type($v): string {
  $t = is_string($v) ? trim($v) : '';
  if (!in_array($t, ['offer', 'answer', 'ice', 'leave', 'join'], true)) return '';
  return $t;
}

function safe_name($v): string {
  $s = is_string($v) ? trim($v) : '';
  if ($s === '') return '';
  $s = preg_replace('/\s+/', ' ', $s);
  $s = mb_substr($s, 0, 40);
  return $s;
}

function rtc_file(string $room): string {
  return data_dir() . '/rtc-' . $room . '.jsonl';
}

function presence_file(string $channel): string {
  return data_dir() . '/rtc-pres-' . $channel . '.json';
}

function load_presence(string $channel): array {
  $file = presence_file($channel);
  $raw = @file_get_contents($file);
  $data = is_string($raw) ? json_decode($raw, true) : null;
  return is_array($data) ? $data : [];
}

function save_presence(string $channel, array $data): void {
  $file = presence_file($channel);
  $fp = @fopen($file, 'cb');
  if ($fp === false) return;
  try {
    if (!flock($fp, LOCK_EX)) return;
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    fflush($fp);
    flock($fp, LOCK_UN);
  } finally {
    fclose($fp);
  }
}

function update_presence(string $channel, string $cid, string $name, int $now): void {
  $pres = load_presence($channel);
  $pres[$cid] = ['cid' => $cid, 'name' => $name, 'lastSeen' => $now];
  foreach ($pres as $k => $v) {
    $ls = is_array($v) && isset($v['lastSeen']) ? intval($v['lastSeen']) : 0;
    if ($ls < ($now - 60000)) unset($pres[$k]);
  }
  save_presence($channel, $pres);
}

function remove_presence(string $channel, string $cid, int $now): void {
  $pres = load_presence($channel);
  unset($pres[$cid]);
  foreach ($pres as $k => $v) {
    $ls = is_array($v) && isset($v['lastSeen']) ? intval($v['lastSeen']) : 0;
    if ($ls < ($now - 60000)) unset($pres[$k]);
  }
  save_presence($channel, $pres);
}

function append_jsonl(string $file, array $row): void {
  $fp = @fopen($file, 'ab');
  if ($fp === false) respond(500, ['error' => 'open_failed']);
  try {
    if (!flock($fp, LOCK_EX)) respond(500, ['error' => 'lock_failed']);
    fwrite($fp, json_encode($row, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n");
    fflush($fp);
    flock($fp, LOCK_UN);
  } finally {
    fclose($fp);
  }
}

function read_messages_since(string $file, int $since_ms, string $self, int $limit = 50): array {
  if (!file_exists($file)) return [];
  $fp = @fopen($file, 'rb');
  if ($fp === false) return [];
  $out = [];
  try {
    if (!flock($fp, LOCK_SH)) return [];
    $size = filesize($file);
    $readBytes = 262144;
    if ($size !== false && $size > $readBytes) {
      fseek($fp, -$readBytes, SEEK_END);
      fgets($fp);
    }
    while (!feof($fp)) {
      $line = fgets($fp);
      if ($line === false) break;
      $line = trim($line);
      if ($line === '') continue;
      $m = json_decode($line, true);
      if (!is_array($m)) continue;
      $ts = isset($m['ts']) ? intval($m['ts']) : 0;
      if ($ts <= $since_ms) continue;
      $to = isset($m['to']) && is_string($m['to']) ? $m['to'] : '';
      $from = isset($m['from']) && is_string($m['from']) ? $m['from'] : '';
      if ($from === $self) continue;
      if ($to !== '' && $to !== $self) continue;
      $out[] = $m;
      if (count($out) >= $limit) break;
    }
    flock($fp, LOCK_UN);
  } finally {
    fclose($fp);
  }
  return $out;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'POST') {
  $body = read_json_body();
  $room = safe_room($body['room'] ?? null);
  $channel = safe_channel($body['channel'] ?? $room);
  $from = safe_id($body['from'] ?? null);
  $to = isset($body['to']) ? safe_id($body['to']) : null;
  $type = safe_type($body['type'] ?? null);
  if (!$from) respond(400, ['error' => 'missing_from']);
  if ($type === '') respond(400, ['error' => 'bad_type']);

  $payload = $body['payload'] ?? null;
  if ($type === 'ice' && !is_array($payload)) respond(400, ['error' => 'bad_payload']);
  if (($type === 'offer' || $type === 'answer') && !is_string($payload)) respond(400, ['error' => 'bad_payload']);
  if ($type === 'join' && !is_array($payload)) $payload = [];

  $now = now_ms();
  $name = safe_name($body['name'] ?? ($payload['name'] ?? null));
  if ($type === 'join') {
    update_presence($channel, $from, $name, $now);
  } elseif ($type === 'leave') {
    remove_presence($channel, $from, $now);
  }

  $row = [
    'ts' => $now,
    'room' => $room,
    'channel' => $channel,
    'type' => $type,
    'from' => $from,
    'to' => $to ? $to : '',
    'payload' => $payload,
  ];
  append_jsonl(rtc_file($room), $row);
  respond(200, ['ok' => true]);
}

if ($method !== 'GET') respond(405, ['error' => 'method_not_allowed']);

$room = safe_room($_GET['room'] ?? null);
$client = safe_id($_GET['client'] ?? null);
if (!$client) respond(400, ['error' => 'missing_client']);
$since = isset($_GET['since']) ? intval($_GET['since']) : 0;
$timeout = isset($_GET['timeout']) ? intval($_GET['timeout']) : 20;
$timeout = max(0, min(25, $timeout));
$presenceChannel = isset($_GET['presence_channel']) ? safe_channel($_GET['presence_channel']) : '';

$start = time();
$file = rtc_file($room);

if ($timeout === 0) {
  $out = ['ok' => true, 'room' => $room, 'now' => now_ms(), 'messages' => read_messages_since($file, $since, $client, 100)];
  if ($presenceChannel !== '') {
    $pres = load_presence($presenceChannel);
    $rows = [];
    foreach ($pres as $cid => $v) {
      if (!is_array($v)) continue;
      $rows[] = [
        'cid' => (string)($v['cid'] ?? $cid),
        'name' => (string)($v['name'] ?? ''),
        'lastSeen' => intval($v['lastSeen'] ?? 0),
      ];
    }
    usort($rows, function($a, $b) { return ($b['lastSeen'] ?? 0) <=> ($a['lastSeen'] ?? 0); });
    $out['presence'] = $rows;
  }
  respond(200, $out);
}

while (true) {
  $msgs = read_messages_since($file, $since, $client, 100);
  if (count($msgs) > 0) {
    $out = ['ok' => true, 'room' => $room, 'now' => now_ms(), 'messages' => $msgs];
    if ($presenceChannel !== '') {
      $pres = load_presence($presenceChannel);
      $rows = [];
      foreach ($pres as $cid => $v) {
        if (!is_array($v)) continue;
        $rows[] = [
          'cid' => (string)($v['cid'] ?? $cid),
          'name' => (string)($v['name'] ?? ''),
          'lastSeen' => intval($v['lastSeen'] ?? 0),
        ];
      }
      usort($rows, function($a, $b) { return ($b['lastSeen'] ?? 0) <=> ($a['lastSeen'] ?? 0); });
      $out['presence'] = $rows;
    }
    respond(200, $out);
  }
  if ((time() - $start) >= $timeout) {
    $out = ['ok' => true, 'room' => $room, 'now' => now_ms(), 'messages' => []];
    if ($presenceChannel !== '') {
      $pres = load_presence($presenceChannel);
      $rows = [];
      foreach ($pres as $cid => $v) {
        if (!is_array($v)) continue;
        $rows[] = [
          'cid' => (string)($v['cid'] ?? $cid),
          'name' => (string)($v['name'] ?? ''),
          'lastSeen' => intval($v['lastSeen'] ?? 0),
        ];
      }
      usort($rows, function($a, $b) { return ($b['lastSeen'] ?? 0) <=> ($a['lastSeen'] ?? 0); });
      $out['presence'] = $rows;
    }
    respond(200, $out);
  }
  usleep(250000);
}


