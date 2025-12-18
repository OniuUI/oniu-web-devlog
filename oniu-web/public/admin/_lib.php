<?php
declare(strict_types=1);

// Shared helpers for admin.

function data_dir(): string {
  $dir = __DIR__ . '/../_data';
  if (!is_dir($dir)) {
    @mkdir($dir, 0755, true);
  }
  return realpath($dir) ?: $dir;
}

function ensure_session(): void {
  if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
  }
}

function csrf_token(): string {
  ensure_session();
  if (!isset($_SESSION['csrf'])) {
    $_SESSION['csrf'] = bin2hex(random_bytes(16));
  }
  return (string)$_SESSION['csrf'];
}

function require_csrf(): void {
  ensure_session();
  $sent = $_POST['csrf'] ?? '';
  if (!is_string($sent) || $sent === '' || !hash_equals((string)($_SESSION['csrf'] ?? ''), $sent)) {
    http_response_code(403);
    echo "Bad CSRF token";
    exit;
  }
}

function config_file(): string {
  return data_dir() . '/admin-config.php';
}

function load_config(): array {
  $file = config_file();
  if (!file_exists($file)) {
    // default password: oniu-admin-test
    $hash = password_hash('oniu-admin-test', PASSWORD_DEFAULT);
    $cfg = [
      'password_hash' => $hash,
    ];
    file_put_contents($file, "<?php\nreturn " . var_export($cfg, true) . ";\n");
    return $cfg;
  }
  $cfg = require $file;
  return is_array($cfg) ? $cfg : [];
}

function set_password(string $newPassword): void {
  $newPassword = trim($newPassword);
  if ($newPassword === '' || strlen($newPassword) < 8) {
    throw new RuntimeException("Password must be at least 8 characters.");
  }
  $cfg = load_config();
  $cfg['password_hash'] = password_hash($newPassword, PASSWORD_DEFAULT);
  file_put_contents(config_file(), "<?php\nreturn " . var_export($cfg, true) . ";\n");
}

function is_logged_in(): bool {
  ensure_session();
  return !empty($_SESSION['admin_ok']);
}

function require_login(): void {
  if (!is_logged_in()) {
    header('Location: /admin/login.php');
    exit;
  }
}

function publications_path(): string {
  // Public file consumed by SPA:
  return realpath(__DIR__ . '/../publications.json') ?: (__DIR__ . '/../publications.json');
}

function publications_backup_path(): string {
  return data_dir() . '/publications.json.bak';
}

function read_publications(): array {
  $path = publications_path();
  if (!file_exists($path)) {
    return ['publications' => []];
  }
  $raw = file_get_contents($path);
  if ($raw === false) return ['publications' => []];
  $data = json_decode($raw, true);
  if (!is_array($data) || !isset($data['publications']) || !is_array($data['publications'])) {
    return ['publications' => []];
  }
  return $data;
}

function write_publications(array $data): void {
  if (!isset($data['publications']) || !is_array($data['publications'])) {
    throw new RuntimeException("Invalid publications format");
  }

  $json = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . "\n";
  $path = publications_path();

  // backup existing
  if (file_exists($path)) {
    @copy($path, publications_backup_path());
  }

  // atomic write
  $tmp = $path . '.tmp';
  file_put_contents($tmp, $json);
  rename($tmp, $path);
}

function uploads_dir(): string {
  $dir = __DIR__ . '/../uploads';
  if (!is_dir($dir)) {
    @mkdir($dir, 0755, true);
  }
  return realpath($dir) ?: $dir;
}

function safe_slug(string $s): string {
  $s = strtolower(trim($s));
  $s = preg_replace('/[^a-z0-9_-]+/', '-', $s);
  $s = trim((string)$s, '-');
  if ($s === '') $s = 'post';
  return substr($s, 0, 48);
}


