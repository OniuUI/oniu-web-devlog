<?php
// Simple global chat endpoint for static sites.
// - GET  /api/chat.php?room=home&since=<ms>&timeout=25  -> long-poll for new messages
// - POST /api/chat.php  JSON { room, name, text }       -> append message
//
// Stores messages in /_data/chat-<room>.jsonl (protected via .htaccess).

declare(strict_types=1);

ignore_user_abort(true);
@set_time_limit(0);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function ensure_session(): void {
  if (session_status() !== PHP_SESSION_ACTIVE) {
    @session_start();
  }
}

function is_admin(): bool {
  ensure_session();
  return !empty($_SESSION['admin_ok']);
}

function csrf_ok($token): bool {
  ensure_session();
  if (!is_string($token) || $token === '') return false;
  $csrf = (string)($_SESSION['csrf'] ?? '');
  if ($csrf === '') return false;
  return hash_equals($csrf, $token);
}

function respond(int $status, array $payload): void {
  http_response_code($status);
  echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  exit;
}

function read_json_body(): array {
  $raw = file_get_contents('php://input');
  if ($raw === false || trim($raw) === '') return [];
  $data = json_decode($raw, true);
  if (!is_array($data)) return [];
  return $data;
}

function room_from($v): string {
  $room = is_string($v) ? $v : 'home';
  $room = trim($room);
  if ($room === '') $room = 'home';
  // allow only simple room slugs
  if (!preg_match('/^[a-z0-9_-]{1,32}$/', $room)) $room = 'home';
  return $room;
}

function safe_name(string $name): string {
  $name = trim($name);
  if ($name === '') $name = 'Anonymous';
  $name = mb_substr($name, 0, 40);
  return $name;
}

function safe_text(string $text): string {
  $text = trim($text);
  $text = preg_replace("/\r\n|\r/", "\n", $text);
  $text = mb_substr($text, 0, 800);
  return $text;
}

function safe_id($v): ?string {
  if (!is_string($v)) return null;
  $id = trim($v);
  if ($id === '') return null;
  // Allow UUIDs or hex strings (client-generated IDs).
  if (preg_match('/^[0-9a-f]{32}$/i', $id)) return $id;
  if (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $id)) return $id;
  return null;
}

function client_ip(): string {
  // NOTE: On shared hosting, REMOTE_ADDR is the safest. X-Forwarded-For can be spoofed.
  $ip = $_SERVER['REMOTE_ADDR'] ?? '';
  if (!is_string($ip) || $ip === '') $ip = '0.0.0.0';
  return $ip;
}

function data_dir(): string {
  $dir = realpath(__DIR__ . '/../_data');
  if ($dir === false) {
    // try to create
    $dir = __DIR__ . '/../_data';
    @mkdir($dir, 0755, true);
    $dir = realpath($dir);
  }
  if ($dir === false) respond(500, ['error' => 'data_dir_unavailable']);
  return $dir;
}

function chat_file(string $room): string {
  return data_dir() . '/chat-' . $room . '.jsonl';
}

function moderation_file(string $room): string {
  return data_dir() . '/chat-mod-' . $room . '.json';
}

function load_moderation(string $room): array {
  $file = moderation_file($room);
  $raw = @file_get_contents($file);
  $data = is_string($raw) ? json_decode($raw, true) : null;
  if (!is_array($data)) {
    $data = [
      'paused_until' => 0,
      'banned' => [],
      'muted' => [], // ip => until_ms
      'cleared_before_ts' => 0, // clear history signal for clients
      'deleted_ids' => [], // id => ts
    ];
  }

  $now = now_ms();
  if (!isset($data['paused_until']) || !is_int($data['paused_until'])) $data['paused_until'] = 0;
  if (!isset($data['banned']) || !is_array($data['banned'])) $data['banned'] = [];
  if (!isset($data['muted']) || !is_array($data['muted'])) $data['muted'] = [];
  if (!isset($data['cleared_before_ts']) || !is_int($data['cleared_before_ts'])) $data['cleared_before_ts'] = 0;
  if (!isset($data['deleted_ids']) || !is_array($data['deleted_ids'])) $data['deleted_ids'] = [];

  // Cleanup expired mutes
  foreach ($data['muted'] as $ip => $until) {
    if (!is_int($until) || $until <= $now) unset($data['muted'][$ip]);
  }
  if ($data['paused_until'] <= $now) $data['paused_until'] = 0;

  // Prune old deletions (keep 7 days)
  $cutoff = $now - 7 * 24 * 60 * 60 * 1000;
  foreach ($data['deleted_ids'] as $id => $ts) {
    if (!is_int($ts) || $ts < $cutoff) unset($data['deleted_ids'][$id]);
  }

  return $data;
}

function mod_payload(array $mod): array {
  return [
    'paused_until' => $mod['paused_until'],
    'cleared_before_ts' => $mod['cleared_before_ts'],
    'deleted_ids' => array_keys($mod['deleted_ids']),
  ];
}

function save_moderation(string $room, array $data): void {
  $file = moderation_file($room);
  $fp = @fopen($file, 'cb');
  if ($fp === false) respond(500, ['error' => 'moderation_open_failed']);
  try {
    if (!flock($fp, LOCK_EX)) respond(500, ['error' => 'moderation_lock_failed']);
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    fflush($fp);
    flock($fp, LOCK_UN);
  } finally {
    fclose($fp);
  }
}

function ip_is_banned(array $mod, string $ip): bool {
  return !empty($mod['banned'][$ip]);
}

function ip_is_muted(array $mod, string $ip): int {
  $until = $mod['muted'][$ip] ?? 0;
  return is_int($until) ? $until : 0;
}

function presence_file(string $room): string {
  return data_dir() . '/chat-pres-' . $room . '.json';
}

function load_presence(string $room): array {
  $file = presence_file($room);
  $raw = @file_get_contents($file);
  $data = is_string($raw) ? json_decode($raw, true) : null;
  if (!is_array($data)) $data = [];
  return $data;
}

function public_presence(string $room): array {
  $pres = load_presence($room);
  $out = [];
  foreach ($pres as $cid => $v) {
    if (!is_array($v)) continue;
    $out[] = [
      'cid' => (string)($v['cid'] ?? $cid),
      'name' => (string)($v['name'] ?? ''),
      'lastSeen' => intval($v['lastSeen'] ?? 0),
    ];
  }
  usort($out, function($a, $b) { return ($b['lastSeen'] ?? 0) <=> ($a['lastSeen'] ?? 0); });
  return $out;
}

function save_presence(string $room, array $data): void {
  $file = presence_file($room);
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

function update_presence(string $room, ?string $cid, string $name, string $ip, int $now): void {
  if (!$cid) return;
  $pres = load_presence($room);
  if (!is_array($pres)) $pres = [];
  $pres[$cid] = ['cid' => $cid, 'name' => $name, 'ip' => $ip, 'lastSeen' => $now];

  // prune old (60s)
  foreach ($pres as $k => $v) {
    $ls = is_array($v) && isset($v['lastSeen']) ? intval($v['lastSeen']) : 0;
    if ($ls < ($now - 60000)) unset($pres[$k]);
  }
  save_presence($room, $pres);
}

function append_message(string $file, array $msg): void {
  $fp = @fopen($file, 'ab');
  if ($fp === false) respond(500, ['error' => 'open_failed']);
  try {
    if (!flock($fp, LOCK_EX)) respond(500, ['error' => 'lock_failed']);
    $line = json_encode($msg, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
    fwrite($fp, $line);
    fflush($fp);
    flock($fp, LOCK_UN);
  } finally {
    fclose($fp);
  }
}

function read_messages_since(string $file, int $since_ms, bool $include_ip, int $limit = 50, ?string $request_cid = null): array {
  if (!file_exists($file)) return [];
  $fp = @fopen($file, 'rb');
  if ($fp === false) return [];
  $out = [];
  try {
    if (!flock($fp, LOCK_SH)) return [];
    // Read last ~256KB to avoid big files; sufficient for recent chat
    $size = filesize($file);
    $readBytes = 262144;
    if ($size !== false && $size > $readBytes) {
      fseek($fp, -$readBytes, SEEK_END);
      // discard partial line
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
      if ($ts > $since_ms) {
        $mine = $request_cid ? (($m['cid'] ?? '') === $request_cid) : false;
        if (!$include_ip) {
          unset($m['ip']);
          unset($m['cid']);
        }
        if ($mine) $m['mine'] = true;
        $out[] = $m;
        if (count($out) >= $limit) break;
      }
    }
    flock($fp, LOCK_UN);
  } finally {
    fclose($fp);
  }
  return $out;
}

function rewrite_chat(string $file, callable $keep_fn): int {
  if (!file_exists($file)) return 0;
  $tmp = $file . '.tmp';
  $in = @fopen($file, 'rb');
  if ($in === false) respond(500, ['error' => 'rewrite_open_failed']);
  $out = @fopen($tmp, 'wb');
  if ($out === false) respond(500, ['error' => 'rewrite_tmp_failed']);

  $kept = 0;
  try {
    if (!flock($in, LOCK_EX)) respond(500, ['error' => 'rewrite_lock_failed']);
    while (!feof($in)) {
      $line = fgets($in);
      if ($line === false) break;
      $trim = trim($line);
      if ($trim === '') continue;
      $m = json_decode($trim, true);
      if (!is_array($m)) continue;
      if ($keep_fn($m)) {
        fwrite($out, json_encode($m, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n");
        $kept++;
      }
    }
    fflush($out);
    flock($in, LOCK_UN);
  } finally {
    fclose($in);
    fclose($out);
  }

  @rename($tmp, $file);
  return $kept;
}

function rewrite_chat_collect(string $file, callable $keep_fn): array {
  if (!file_exists($file)) return ['kept' => 0, 'removed' => []];
  $tmp = $file . '.tmp';
  $in = @fopen($file, 'rb');
  if ($in === false) respond(500, ['error' => 'rewrite_open_failed']);
  $out = @fopen($tmp, 'wb');
  if ($out === false) respond(500, ['error' => 'rewrite_tmp_failed']);

  $kept = 0;
  $removed = [];
  try {
    if (!flock($in, LOCK_EX)) respond(500, ['error' => 'rewrite_lock_failed']);
    while (!feof($in)) {
      $line = fgets($in);
      if ($line === false) break;
      $trim = trim($line);
      if ($trim === '') continue;
      $m = json_decode($trim, true);
      if (!is_array($m)) continue;
      if ($keep_fn($m)) {
        fwrite($out, json_encode($m, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n");
        $kept++;
      } else {
        if (isset($m['id']) && is_string($m['id'])) $removed[] = $m['id'];
      }
    }
    fflush($out);
    flock($in, LOCK_UN);
  } finally {
    fclose($in);
    fclose($out);
  }
  @rename($tmp, $file);
  return ['kept' => $kept, 'removed' => $removed];
}

function now_ms(): int {
  return (int) round(microtime(true) * 1000);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'POST') {
  $body = read_json_body();
  $room = room_from($body['room'] ?? 'home');

  // Admin actions
  $action = isset($body['action']) && is_string($body['action']) ? $body['action'] : '';
  if ($action !== '') {
    if ($action === 'delete_own') {
      $room = room_from($body['room'] ?? 'home');
      $id = safe_id($body['id'] ?? null);
      $cid = safe_id($body['cid'] ?? null);
      if (!$id) respond(400, ['error' => 'missing_id']);
      if (!$cid) respond(400, ['error' => 'missing_cid']);
      $file = chat_file($room);
      $now = now_ms();
      $mod = load_moderation($room);
      $res = rewrite_chat_collect($file, function($m) use ($id, $cid) { return (($m['id'] ?? '') !== $id) || (($m['cid'] ?? '') !== $cid); });
      if (count($res['removed']) > 0) {
        $mod['deleted_ids'][$id] = $now;
        save_moderation($room, $mod);
      }
      respond(200, ['ok' => true, 'kept' => $res['kept'], 'removed' => count($res['removed']), 'mod' => mod_payload($mod)]);
    }

    if (!is_admin()) respond(403, ['error' => 'admin_required']);
    if (!csrf_ok($body['csrf'] ?? null)) respond(403, ['error' => 'bad_csrf']);

    $mod = load_moderation($room);
    $file = chat_file($room);
    $now = now_ms();

    if ($action === 'pause') {
      $seconds = isset($body['seconds']) ? intval($body['seconds']) : 0;
      $seconds = max(0, min(3600, $seconds));
      $mod['paused_until'] = $seconds > 0 ? ($now + $seconds * 1000) : 0;
      save_moderation($room, $mod);
      respond(200, ['ok' => true, 'mod' => mod_payload($mod)]);
    }
    if ($action === 'list_state') {
      $pres = load_presence($room);
      $out = [];
      foreach ($pres as $cid => $v) {
        if (!is_array($v)) continue;
        $out[] = [
          'cid' => (string)($v['cid'] ?? $cid),
          'name' => (string)($v['name'] ?? ''),
          'ip' => (string)($v['ip'] ?? ''),
          'lastSeen' => intval($v['lastSeen'] ?? 0),
        ];
      }
      usort($out, function($a, $b) { return ($b['lastSeen'] ?? 0) <=> ($a['lastSeen'] ?? 0); });
      respond(200, [
        'ok' => true,
        'now' => $now,
        'presence' => $out,
        'banned' => array_keys($mod['banned']),
        'muted' => $mod['muted'],
        'paused_until' => $mod['paused_until'],
      ]);
    }
    if ($action === 'ban') {
      $ip = isset($body['ip']) && is_string($body['ip']) ? trim($body['ip']) : '';
      if ($ip === '') respond(400, ['error' => 'missing_ip']);
      $mod['banned'][$ip] = true;
      unset($mod['muted'][$ip]);
      $res = rewrite_chat_collect($file, function($m) use ($ip) { return ($m['ip'] ?? '') !== $ip; });
      foreach ($res['removed'] as $rid) {
        if (is_string($rid) && $rid !== '') $mod['deleted_ids'][$rid] = $now;
      }
      save_moderation($room, $mod);
      respond(200, ['ok' => true, 'mod' => mod_payload($mod), 'kept' => $res['kept'], 'removed' => count($res['removed'])]);
    }
    if ($action === 'unban') {
      $ip = isset($body['ip']) && is_string($body['ip']) ? trim($body['ip']) : '';
      if ($ip === '') respond(400, ['error' => 'missing_ip']);
      unset($mod['banned'][$ip]);
      save_moderation($room, $mod);
      respond(200, ['ok' => true, 'mod' => mod_payload($mod)]);
    }
    if ($action === 'mute') {
      $ip = isset($body['ip']) && is_string($body['ip']) ? trim($body['ip']) : '';
      $minutes = isset($body['minutes']) ? intval($body['minutes']) : 10;
      $minutes = max(1, min(24 * 60, $minutes));
      if ($ip === '') respond(400, ['error' => 'missing_ip']);
      $mod['muted'][$ip] = $now + $minutes * 60 * 1000;
      save_moderation($room, $mod);
      respond(200, ['ok' => true, 'mod' => mod_payload($mod)]);
    }
    if ($action === 'unmute') {
      $ip = isset($body['ip']) && is_string($body['ip']) ? trim($body['ip']) : '';
      if ($ip === '') respond(400, ['error' => 'missing_ip']);
      unset($mod['muted'][$ip]);
      save_moderation($room, $mod);
      respond(200, ['ok' => true, 'mod' => mod_payload($mod)]);
    }
    if ($action === 'delete_message') {
      $id = safe_id($body['id'] ?? null);
      if (!$id) respond(400, ['error' => 'missing_id']);
      $mod['deleted_ids'][$id] = $now;
      save_moderation($room, $mod);
      $kept = rewrite_chat($file, function($m) use ($id) { return ($m['id'] ?? '') !== $id; });
      respond(200, ['ok' => true, 'kept' => $kept, 'mod' => mod_payload($mod)]);
    }
    if ($action === 'clear_history') {
      // Archive current file then start fresh.
      if (file_exists($file)) {
        $arch = data_dir() . '/chat-' . $room . '-' . date('Ymd-His') . '.jsonl';
        @rename($file, $arch);
      }
      $mod['cleared_before_ts'] = $now;
      $mod['deleted_ids'] = [];
      save_moderation($room, $mod);
      respond(200, ['ok' => true, 'mod' => mod_payload($mod)]);
    }
    if ($action === 'clear_by_ip') {
      $ip = isset($body['ip']) && is_string($body['ip']) ? trim($body['ip']) : '';
      if ($ip === '') respond(400, ['error' => 'missing_ip']);
      $res = rewrite_chat_collect($file, function($m) use ($ip) { return ($m['ip'] ?? '') !== $ip; });
      foreach ($res['removed'] as $rid) {
        if (is_string($rid) && $rid !== '') $mod['deleted_ids'][$rid] = $now;
      }
      save_moderation($room, $mod);
      respond(200, ['ok' => true, 'kept' => $res['kept'], 'removed' => count($res['removed']), 'mod' => mod_payload($mod)]);
    }
    if ($action === 'notice') {
      $text = safe_text((string)($body['text'] ?? ''));
      if ($text === '') respond(400, ['error' => 'empty_message']);
      $msg = [
        'id' => bin2hex(random_bytes(16)),
        'room' => $room,
        'name' => 'SYSTEM',
        'text' => $text,
        'ts' => $now,
        'ip' => client_ip(),
      ];
      append_message($file, $msg);
      respond(200, ['ok' => true, 'message' => $msg]);
    }

    respond(400, ['error' => 'unknown_action']);
  }

  $name = safe_name((string)($body['name'] ?? 'Anonymous'));
  $text = safe_text((string)($body['text'] ?? ''));
  if ($text === '') respond(400, ['error' => 'empty_message']);

  $clientId = safe_id($body['id'] ?? null);
  $ip = client_ip();
  $mod = load_moderation($room);
  $now = now_ms();

  $cid = safe_id($body['cid'] ?? null);
  update_presence($room, $cid, $name, $ip, $now);

  if (!empty($mod['paused_until']) && is_int($mod['paused_until']) && $mod['paused_until'] > $now) {
    respond(423, ['error' => 'paused', 'retryAfterMs' => $mod['paused_until'] - $now]);
  }
  if (ip_is_banned($mod, $ip)) {
    respond(403, ['error' => 'banned']);
  }
  $mutedUntil = ip_is_muted($mod, $ip);
  if ($mutedUntil > $now) {
    respond(403, ['error' => 'muted', 'retryAfterMs' => $mutedUntil - $now]);
  }

  $msg = [
    'id' => $clientId ?: bin2hex(random_bytes(16)),
    'room' => $room,
    'name' => $name,
    'text' => $text,
    'ts' => $now,
    'ip' => $ip,
  ];
  if ($cid) $msg['cid'] = $cid;

  append_message(chat_file($room), $msg);
  $admin = is_admin();
  if (!$admin) {
    unset($msg['ip']);
    unset($msg['cid']);
  }
  if ($cid) $msg['mine'] = true;
  respond(200, ['ok' => true, 'admin' => $admin, 'message' => $msg]);
}

// GET long-poll
$room = room_from($_GET['room'] ?? 'home');
$since = isset($_GET['since']) ? intval($_GET['since']) : 0;
$timeout = isset($_GET['timeout']) ? intval($_GET['timeout']) : 25;
$timeout = max(0, min(30, $timeout));

$start = time();
$file = chat_file($room);
$admin = is_admin();
$mod = load_moderation($room);
$modFile = moderation_file($room);
$modMtime = @filemtime($modFile);
if ($modMtime === false) $modMtime = 0;

// Presence updates from GET (best-effort)
$cid = safe_id($_GET['cid'] ?? null);
$name = safe_name((string)($_GET['name'] ?? 'Anonymous'));
update_presence($room, $cid, $name, client_ip(), now_ms());

if ($timeout === 0) {
  $mod = load_moderation($room);
  respond(200, [
    'ok' => true,
    'admin' => $admin,
    'room' => $room,
    'now' => now_ms(),
    'mod' => mod_payload($mod),
    'presence' => isset($_GET['presence']) ? public_presence($room) : null,
    'messages' => read_messages_since($file, $since, $admin, 50, $cid),
  ]);
}

if ($since === 0 && !file_exists($file)) {
  respond(200, [
    'ok' => true,
    'admin' => $admin,
    'room' => $room,
    'now' => now_ms(),
    'mod' => mod_payload($mod),
    'presence' => isset($_GET['presence']) ? public_presence($room) : null,
    'messages' => [],
  ]);
}

while (true) {
  $curMtime = @filemtime($modFile);
  if ($curMtime === false) $curMtime = 0;
  if ($curMtime !== $modMtime) {
    $modMtime = $curMtime;
    $mod = load_moderation($room);
    respond(200, [
      'ok' => true,
      'admin' => $admin,
      'room' => $room,
      'now' => now_ms(),
      'mod' => mod_payload($mod),
      'presence' => isset($_GET['presence']) ? public_presence($room) : null,
      'messages' => read_messages_since($file, $since, $admin, 50, $cid),
    ]);
  }

  $msgs = read_messages_since($file, $since, $admin, 50, $cid);
  if (count($msgs) > 0) {
    $mod = load_moderation($room);
    respond(200, [
      'ok' => true,
      'admin' => $admin,
      'room' => $room,
      'now' => now_ms(),
      'mod' => mod_payload($mod),
      'presence' => isset($_GET['presence']) ? public_presence($room) : null,
      'messages' => $msgs,
    ]);
  }
  if ((time() - $start) >= $timeout) {
    $mod = load_moderation($room);
    respond(200, [
      'ok' => true,
      'admin' => $admin,
      'room' => $room,
      'now' => now_ms(),
      'mod' => mod_payload($mod),
      'presence' => isset($_GET['presence']) ? public_presence($room) : null,
      'messages' => [],
    ]);
  }
  usleep(250000); // 250ms
}


