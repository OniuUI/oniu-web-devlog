<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function respond(int $status, array $payload): void {
  http_response_code($status);
  echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  exit;
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

function video_chunks_file(string $room): string {
  return data_dir() . '/video-chunks-' . $room . '.jsonl';
}

function safe_room($v): string {
  $room = is_string($v) ? trim($v) : '';
  if ($room === '' || !preg_match('/^[a-z0-9_-]{1,32}$/', $room)) return 'global';
  return $room;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
  $room = safe_room($_GET['room'] ?? 'global');
  $file = video_chunks_file($room);
  
  $chunks = [];
  if (file_exists($file)) {
    $fp = @fopen($file, 'rb');
    if ($fp !== false) {
      try {
        if (flock($fp, LOCK_SH)) {
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
            if (is_array($chunk)) {
              $chunks[] = $chunk;
            }
          }
          flock($fp, LOCK_UN);
        }
      } finally {
        fclose($fp);
      }
    }
  }
  
  $uploadDir = uploads_dir() . '/video/' . $room;
  $uploadDirExists = is_dir($uploadDir);
  $uploadDirWritable = $uploadDirExists && is_writable($uploadDir);
  
  $dataDir = data_dir();
  $dataDirWritable = is_writable($dataDir);
  
  respond(200, [
    'ok' => true,
    'room' => $room,
    'chunks_file' => $file,
    'chunks_file_exists' => file_exists($file),
    'chunks_file_size' => file_exists($file) ? filesize($file) : 0,
    'chunks_count' => count($chunks),
    'recent_chunks' => array_slice($chunks, -10),
    'uploads_dir' => $uploadDir,
    'uploads_dir_exists' => $uploadDirExists,
    'uploads_dir_writable' => $uploadDirWritable,
    'data_dir' => $dataDir,
    'data_dir_writable' => $dataDirWritable,
    'php_version' => PHP_VERSION,
    'memory_limit' => ini_get('memory_limit'),
    'max_execution_time' => ini_get('max_execution_time'),
  ]);
}

respond(405, ['error' => 'method_not_allowed']);
