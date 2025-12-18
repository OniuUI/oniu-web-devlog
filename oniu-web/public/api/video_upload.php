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

function safe_room($v): string {
  $room = is_string($v) ? trim($v) : '';
  if ($room === '' || !preg_match('/^[a-z0-9_-]{1,32}$/', $room)) return 'global';
  return $room;
}

function safe_id($v): ?string {
  if (!is_string($v)) return null;
  $id = trim($v);
  if ($id === '') return null;
  if (preg_match('/^[0-9a-f]{32}$/i', $id)) return strtolower($id);
  if (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $id)) return strtolower($id);
  return null;
}

function uploads_dir(): string {
  $dir = realpath(__DIR__ . '/../uploads');
  if ($dir === false) {
    $dir = __DIR__ . '/../uploads';
    @mkdir($dir, 0755, true);
    $dir = realpath($dir);
  }
  if ($dir === false) respond(500, ['error' => 'uploads_dir_unavailable']);
  return $dir;
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

function video_chunks_file(string $room): string {
  return data_dir() . '/video-chunks-' . $room . '.jsonl';
}

function append_chunk(string $file, array $chunk): void {
  $fp = @fopen($file, 'ab');
  if ($fp === false) respond(500, ['error' => 'open_failed']);
  try {
    if (!flock($fp, LOCK_EX)) respond(500, ['error' => 'lock_failed']);
    $line = json_encode($chunk, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
    fwrite($fp, $line);
    fflush($fp);
    flock($fp, LOCK_UN);
  } finally {
    fclose($fp);
  }
}

function read_chunks_since(string $file, int $since_ms, int $limit = 100): array {
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
      $chunk = json_decode($line, true);
      if (!is_array($chunk)) continue;
      $ts = isset($chunk['ts']) ? intval($chunk['ts']) : 0;
      if ($ts > $since_ms) {
        $out[] = $chunk;
        if (count($out) >= $limit) break;
      }
    }
    flock($fp, LOCK_UN);
  } finally {
    fclose($fp);
  }
  return $out;
}

function now_ms(): int {
  return (int) round(microtime(true) * 1000);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'POST') {
  $body = read_json_body();
  $room = safe_room($body['room'] ?? 'global');
  $cid = safe_id($body['cid'] ?? null);
  if (!$cid) respond(400, ['error' => 'missing_cid']);
  
  $chunkData = $body['chunk'] ?? null;
  if (!is_string($chunkData)) respond(400, ['error' => 'missing_chunk']);
  
  $base64Data = preg_replace('/^data:video\/[^;]+;base64,/', '', $chunkData);
  $binaryData = @base64_decode($base64Data, true);
  if ($binaryData === false) respond(400, ['error' => 'invalid_base64']);
  
  $chunkId = bin2hex(random_bytes(8));
  $dir = uploads_dir() . '/video/' . $room . '/' . date('Y-m-d');
  if (!is_dir($dir)) @mkdir($dir, 0755, true);
  $filename = $chunkId . '.webm';
  $filepath = $dir . '/' . $filename;
  
  if (@file_put_contents($filepath, $binaryData) === false) {
    respond(500, ['error' => 'write_failed']);
  }
  
  $url = '/uploads/video/' . $room . '/' . date('Y-m-d') . '/' . $filename;
  $now = now_ms();
  
  $chunk = [
    'id' => $chunkId,
    'cid' => $cid,
    'room' => $room,
    'url' => $url,
    'ts' => $now,
  ];
  
  append_chunk(video_chunks_file($room), $chunk);
  respond(200, ['ok' => true, 'chunk' => $chunk]);
}

$room = safe_room($_GET['room'] ?? 'global');
$since = isset($_GET['since']) ? intval($_GET['since']) : 0;
$timeout = isset($_GET['timeout']) ? intval($_GET['timeout']) : 20;
$timeout = max(0, min(30, $timeout));

$start = time();
$file = video_chunks_file($room);
$fileMtime = @filemtime($file);
if ($fileMtime === false) $fileMtime = 0;

if ($timeout === 0) {
  respond(200, [
    'ok' => true,
    'room' => $room,
    'now' => now_ms(),
    'chunks' => read_chunks_since($file, $since, 100),
  ]);
}

while (true) {
  $curMtime = @filemtime($file);
  if ($curMtime === false) $curMtime = 0;
  if ($curMtime !== $fileMtime) {
    $fileMtime = $curMtime;
    respond(200, [
      'ok' => true,
      'room' => $room,
      'now' => now_ms(),
      'chunks' => read_chunks_since($file, $since, 100),
    ]);
  }
  
  $chunks = read_chunks_since($file, $since, 100);
  if (count($chunks) > 0) {
    respond(200, [
      'ok' => true,
      'room' => $room,
      'now' => now_ms(),
      'chunks' => $chunks,
    ]);
  }
  
  if ((time() - $start) >= $timeout) {
    respond(200, [
      'ok' => true,
      'room' => $room,
      'now' => now_ms(),
      'chunks' => [],
    ]);
  }
  usleep(250000);
}
