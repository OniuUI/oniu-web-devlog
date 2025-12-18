<?php
declare(strict_types=1);

ignore_user_abort(true);
@set_time_limit(0);

header('Cache-Control: no-store');

function respond(int $status, string $body = ''): void {
  http_response_code($status);
  if ($body !== '') echo $body;
  exit;
}

function data_dir(): string {
  $dir = realpath(__DIR__ . '/../_data');
  if ($dir === false) {
    $dir = __DIR__ . '/../_data';
    @mkdir($dir, 0755, true);
    $dir = realpath($dir);
  }
  if ($dir === false) respond(500);
  return $dir;
}

function cache_dir(): string {
  $dir = realpath(__DIR__ . '/../_media_cache');
  if ($dir === false) {
    $dir = __DIR__ . '/../_media_cache';
    @mkdir($dir, 0755, true);
    $dir = realpath($dir);
  }
  if ($dir === false) respond(500);
  return $dir;
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
  if ($ext === 'png') return 'image/png';
  if ($ext === 'gif') return 'image/gif';
  if ($ext === 'webp') return 'image/webp';
  if ($ext === 'jpg' || $ext === 'jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

function etag_for(string $path): string {
  $st = @stat($path);
  if ($st === false) return '"' . md5($path) . '"';
  return '"' . md5($path . '|' . ($st['mtime'] ?? 0) . '|' . ($st['size'] ?? 0)) . '"';
}

function send_file(string $path, string $mime, string $etag): void {
  header('Content-Type: ' . $mime);
  header('ETag: ' . $etag);
  header('Cache-Control: public, max-age=31536000, immutable');
  $ifNone = $_SERVER['HTTP_IF_NONE_MATCH'] ?? '';
  if (is_string($ifNone) && $ifNone !== '' && trim($ifNone) === $etag) {
    http_response_code(304);
    exit;
  }
  $size = @filesize($path);
  if ($size !== false) header('Content-Length: ' . (string)$size);
  readfile($path);
  exit;
}

$src = safe_src((string)($_GET['src'] ?? ''));
if ($src === '') respond(400, 'bad_src');

$w = isset($_GET['w']) ? max(0, min(3840, intval($_GET['w']))) : 0;
$q = isset($_GET['q']) ? max(40, min(95, intval($_GET['q']))) : 80;
$fmt = strtolower((string)($_GET['fmt'] ?? ''));
if (!in_array($fmt, ['', 'jpg', 'jpeg', 'png', 'webp'], true)) $fmt = '';

$orig = resolve_upload_path($src);
if ($orig === null || !is_file($orig)) respond(404);

$origMime = mime_from_ext($orig);
$wantFmt = $fmt !== '' ? $fmt : strtolower(pathinfo($orig, PATHINFO_EXTENSION));
if ($wantFmt === 'jpeg') $wantFmt = 'jpg';

$cacheKey = hash('sha256', $src . '|w=' . $w . '|q=' . $q . '|fmt=' . $wantFmt);
$cachePath = cache_dir() . '/img-' . $cacheKey . '.' . $wantFmt;

if (is_file($cachePath)) {
  send_file($cachePath, mime_from_ext($cachePath), etag_for($cachePath));
}

$canGd = extension_loaded('gd') && function_exists('imagecreatetruecolor');
if (!$canGd || $w <= 0) {
  copy($orig, $cachePath);
  send_file($cachePath, $origMime, etag_for($cachePath));
}

$ext = strtolower(pathinfo($orig, PATHINFO_EXTENSION));
if ($ext === 'jpeg') $ext = 'jpg';

$img = null;
if ($ext === 'jpg' && function_exists('imagecreatefromjpeg')) $img = @imagecreatefromjpeg($orig);
if ($ext === 'png' && function_exists('imagecreatefrompng')) $img = @imagecreatefrompng($orig);
if ($ext === 'gif' && function_exists('imagecreatefromgif')) $img = @imagecreatefromgif($orig);
if ($ext === 'webp' && function_exists('imagecreatefromwebp')) $img = @imagecreatefromwebp($orig);
if (!$img) {
  copy($orig, $cachePath);
  send_file($cachePath, $origMime, etag_for($cachePath));
}

$ow = imagesx($img);
$oh = imagesy($img);
if ($ow <= 0 || $oh <= 0) {
  imagedestroy($img);
  respond(500);
}

if ($w >= $ow) {
  $w = $ow;
}
$h = (int) round(($oh * $w) / $ow);
$dst = imagecreatetruecolor($w, $h);
imagealphablending($dst, false);
imagesavealpha($dst, true);
imagecopyresampled($dst, $img, 0, 0, 0, 0, $w, $h, $ow, $oh);
imagedestroy($img);

if ($wantFmt === 'png' && function_exists('imagepng')) {
  imagepng($dst, $cachePath);
} elseif ($wantFmt === 'webp' && function_exists('imagewebp')) {
  imagewebp($dst, $cachePath, $q);
} else {
  imagejpeg($dst, $cachePath, $q);
}
imagedestroy($dst);

send_file($cachePath, mime_from_ext($cachePath), etag_for($cachePath));


