<?php
declare(strict_types=1);

ignore_user_abort(true);
@set_time_limit(0);

function respond(int $status): void {
  http_response_code($status);
  exit;
}

function safe_src(string $src): string {
  $src = trim($src);
  if ($src === '') return '';
  if (str_contains($src, '://')) return '';
  if ($src[0] !== '/') $src = '/' . $src;
  if (!preg_match('#^/uploads/[a-z0-9/_\\-\\.]+$#i', $src)) return '';
  return $src;
}

function resolve_upload_path(string $src): ?string {
  $base = realpath(__DIR__ . '/../uploads');
  if ($base === false) return null;
  $abs = realpath(__DIR__ . '/..' . $src);
  if ($abs === false) return null;
  $baseNorm = rtrim(str_replace('\\', '/', $base), '/');
  $absNorm = str_replace('\\', '/', $abs);
  if (!str_starts_with($absNorm, $baseNorm . '/')) return null;
  return $abs;
}

function mime_from_ext(string $path): string {
  $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
  if ($ext === 'mp4') return 'video/mp4';
  if ($ext === 'webm') return 'video/webm';
  if ($ext === 'mov') return 'video/quicktime';
  if ($ext === 'm4v') return 'video/x-m4v';
  return 'application/octet-stream';
}

$src = safe_src((string)($_GET['src'] ?? ''));
if ($src === '') respond(400);
$path = resolve_upload_path($src);
if ($path === null || !is_file($path)) respond(404);

$size = @filesize($path);
if ($size === false) respond(500);

$mime = mime_from_ext($path);
header('Content-Type: ' . $mime);
header('Accept-Ranges: bytes');
header('Cache-Control: public, max-age=31536000, immutable');

$range = $_SERVER['HTTP_RANGE'] ?? '';
if (!is_string($range) || $range === '') {
  header('Content-Length: ' . (string)$size);
  readfile($path);
  exit;
}

if (!preg_match('/^bytes=(\d*)-(\d*)$/', trim($range), $m)) {
  header('Content-Length: ' . (string)$size);
  readfile($path);
  exit;
}

$start = $m[1] !== '' ? intval($m[1]) : 0;
$end = $m[2] !== '' ? intval($m[2]) : ($size - 1);
if ($start < 0) $start = 0;
if ($end >= $size) $end = $size - 1;
if ($end < $start) respond(416);

$length = ($end - $start) + 1;
http_response_code(206);
header('Content-Length: ' . (string)$length);
header('Content-Range: bytes ' . $start . '-' . $end . '/' . $size);

$fp = @fopen($path, 'rb');
if ($fp === false) respond(500);
fseek($fp, $start);
$chunk = 8192;
$remaining = $length;
while ($remaining > 0 && !feof($fp)) {
  $read = $remaining > $chunk ? $chunk : $remaining;
  $buf = fread($fp, $read);
  if ($buf === false || $buf === '') break;
  echo $buf;
  $remaining -= strlen($buf);
  @flush();
}
fclose($fp);
exit;


