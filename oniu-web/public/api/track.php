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

function track_log_file(): string {
  return data_dir() . '/track.jsonl';
}

function track_agg_file(): string {
  return data_dir() . '/track-agg.json';
}

function client_ip(): string {
  $ip = $_SERVER['REMOTE_ADDR'] ?? '';
  if (!is_string($ip) || $ip === '') $ip = '0.0.0.0';
  return $ip;
}

function country_code(): string {
  $c = $_SERVER['HTTP_CF_IPCOUNTRY'] ?? $_SERVER['HTTP_X_COUNTRY_CODE'] ?? $_SERVER['HTTP_X_COUNTRY'] ?? '';
  if (!is_string($c)) return '';
  $c = strtoupper(trim($c));
  if (!preg_match('/^[A-Z]{2}$/', $c)) return '';
  return $c;
}

function safe_text($v, int $maxLen): string {
  $s = is_string($v) ? $v : '';
  $s = trim($s);
  if ($s === '') return '';
  if (mb_strlen($s) > $maxLen) $s = mb_substr($s, 0, $maxLen);
  return $s;
}

function safe_slug($v, int $maxLen): string {
  $s = safe_text($v, $maxLen);
  if ($s === '') return '';
  if (!preg_match('/^[a-z0-9_.:-]{1,' . $maxLen . '}$/i', $s)) return '';
  return $s;
}

function safe_path($v): string {
  $p = safe_text($v, 160);
  if ($p === '') return '/';
  if ($p[0] !== '/') $p = '/' . $p;
  return $p;
}

function read_json_body(): array {
  $raw = file_get_contents('php://input');
  if ($raw === false || trim($raw) === '') return [];
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
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

function load_agg(string $file): array {
  if (!file_exists($file)) return [];
  $raw = @file_get_contents($file);
  if (!is_string($raw) || trim($raw) === '') return [];
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}

function save_agg(string $file, array $data): void {
  $fp = @fopen($file, 'cb');
  if ($fp === false) respond(500, ['error' => 'agg_open_failed']);
  try {
    if (!flock($fp, LOCK_EX)) respond(500, ['error' => 'agg_lock_failed']);
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    fflush($fp);
    flock($fp, LOCK_UN);
  } finally {
    fclose($fp);
  }
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'POST') respond(405, ['error' => 'method_not_allowed']);

$body = read_json_body();
$event = safe_slug($body['event'] ?? '', 32);
if ($event === '') $event = 'page_view';
if (!in_array($event, ['page_view', 'chat_open', 'chat_send'], true)) $event = 'page_view';

$path = safe_path($body['path'] ?? '/');
$ref = safe_text($body['ref'] ?? '', 240);
$tz = safe_text($body['tz'] ?? '', 60);
$lang = safe_text($body['lang'] ?? '', 60);
$cid = safe_slug($body['cid'] ?? '', 64);
$chat = !empty($body['chat']);

$ip = client_ip();
$country = country_code();
$ua = safe_text($_SERVER['HTTP_USER_AGENT'] ?? '', 220);

$ts = now_ms();
$row = [
  'ts' => $ts,
  'event' => $event,
  'path' => $path,
  'ref' => $ref,
  'tz' => $tz,
  'lang' => $lang,
  'ip' => $ip,
  'country' => $country,
  'cid' => $cid,
  'chat' => $chat,
  'ua' => $ua,
];

append_jsonl(track_log_file(), $row);

$aggFile = track_agg_file();
$agg = load_agg($aggFile);
if (!is_array($agg)) $agg = [];

$key = $ip . '|' . ($cid !== '' ? $cid : 'no-cid');
$prev = isset($agg[$key]) && is_array($agg[$key]) ? $agg[$key] : [];
$count = isset($prev['count']) ? intval($prev['count']) : 0;
$first = isset($prev['firstSeen']) ? intval($prev['firstSeen']) : 0;
$last = isset($prev['lastSeen']) ? intval($prev['lastSeen']) : 0;
$chatEver = !empty($prev['chatEver']);
$paths = isset($prev['paths']) && is_array($prev['paths']) ? $prev['paths'] : [];
$events = isset($prev['events']) && is_array($prev['events']) ? $prev['events'] : [];

$count++;
if ($first <= 0) $first = $ts;
if ($ts > $last) $last = $ts;
if ($chat) $chatEver = true;
$paths[$path] = (isset($paths[$path]) ? intval($paths[$path]) : 0) + 1;
$events[$event] = (isset($events[$event]) ? intval($events[$event]) : 0) + 1;

$agg[$key] = [
  'ip' => $ip,
  'cid' => $cid,
  'country' => $country,
  'count' => $count,
  'firstSeen' => $first,
  'lastSeen' => $last,
  'chatEver' => $chatEver,
  'paths' => $paths,
  'events' => $events,
  'ua' => $ua,
];

save_agg($aggFile, $agg);
respond(200, ['ok' => true]);


