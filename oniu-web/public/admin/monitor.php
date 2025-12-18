<?php
declare(strict_types=1);

require __DIR__ . '/_lib.php';
require_login();
ensure_session();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function monitor_history_file(): string {
  $dir = data_dir();
  return $dir . '/monitor-history.jsonl';
}

function save_monitor_snapshot(array $data): void {
  $file = monitor_history_file();
  $snapshot = [
    'ts' => time() * 1000,
    'memory' => $data['memory'] ?? null,
    'cpu' => $data['cpu'] ?? null,
    'disk' => $data['disk'] ?? null,
    'load' => $data['load'] ?? null,
  ];
  $line = json_encode($snapshot, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
  @file_put_contents($file, $line, FILE_APPEND | LOCK_EX);
  
  $maxSize = 5 * 1024 * 1024;
  if (filesize($file) > $maxSize) {
    $lines = file($file);
    if ($lines !== false && count($lines) > 1000) {
      $keep = array_slice($lines, -500);
      @file_put_contents($file, implode('', $keep), LOCK_EX);
    }
  }
}

function load_monitor_history(int $hours = 24): array {
  $file = monitor_history_file();
  if (!is_file($file) || !is_readable($file)) {
    return [];
  }
  
  $lines = file($file);
  if ($lines === false) return [];
  
  $cutoff = (time() - ($hours * 3600)) * 1000;
  $history = [];
  
  foreach ($lines as $line) {
    $trimmed = trim($line);
    if ($trimmed === '') continue;
    $snapshot = json_decode($trimmed, true);
    if (!is_array($snapshot)) continue;
    $ts = intval($snapshot['ts'] ?? 0);
    if ($ts < $cutoff) continue;
    $history[] = $snapshot;
  }
  
  return $history;
}

function respond(array $data): void {
  echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  exit;
}

function format_bytes(int $bytes): string {
  $units = ['B', 'KB', 'MB', 'GB', 'TB'];
  $i = 0;
  while ($bytes >= 1024 && $i < count($units) - 1) {
    $bytes /= 1024;
    $i++;
  }
  return round($bytes, 2) . ' ' . $units[$i];
}

function get_memory_usage(): array {
  $used = memory_get_usage(true);
  $peak = memory_get_peak_usage(true);
  $limit = ini_get('memory_limit');
  $limitBytes = 0;
  if (preg_match('/^(\d+)(.)$/', $limit, $m)) {
    $num = intval($m[1]);
    $unit = strtoupper($m[2]);
    $multiplier = ['K' => 1024, 'M' => 1024 * 1024, 'G' => 1024 * 1024 * 1024];
    $limitBytes = $num * ($multiplier[$unit] ?? 1);
  }
  return [
    'used' => $used,
    'used_formatted' => format_bytes($used),
    'peak' => $peak,
    'peak_formatted' => format_bytes($peak),
    'limit' => $limitBytes,
    'limit_formatted' => $limit,
    'percent' => $limitBytes > 0 ? round(($used / $limitBytes) * 100, 1) : 0,
  ];
}

function get_disk_usage(): array {
  $dataDir = realpath(__DIR__ . '/../_data');
  $uploadsDir = realpath(__DIR__ . '/../uploads');
  $total = 0;
  $free = 0;
  
  if ($dataDir !== false && function_exists('disk_total_space') && function_exists('disk_free_space')) {
    $total = @disk_total_space($dataDir);
    $free = @disk_free_space($dataDir);
    if ($total === false) $total = 0;
    if ($free === false) $free = 0;
  }
  
  $used = $total > 0 ? ($total - $free) : 0;
  
  $dataSize = 0;
  if ($dataDir !== false && is_dir($dataDir)) {
    try {
      $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dataDir, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::LEAVES_ONLY
      );
      foreach ($iterator as $file) {
        if ($file->isFile()) {
          $dataSize += $file->getSize();
        }
      }
    } catch (Throwable $e) {
    }
  }
  
  $uploadsSize = 0;
  if ($uploadsDir !== false && is_dir($uploadsDir)) {
    try {
      $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($uploadsDir, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::LEAVES_ONLY
      );
      foreach ($iterator as $file) {
        if ($file->isFile()) {
          $uploadsSize += $file->getSize();
        }
      }
    } catch (Throwable $e) {
    }
  }
  
  return [
    'total' => $total,
    'total_formatted' => format_bytes($total),
    'used' => $used,
    'used_formatted' => format_bytes($used),
    'free' => $free,
    'free_formatted' => format_bytes($free),
    'percent' => $total > 0 ? round(($used / $total) * 100, 1) : 0,
    'data_size' => $dataSize,
    'data_size_formatted' => format_bytes($dataSize),
    'uploads_size' => $uploadsSize,
    'uploads_size_formatted' => format_bytes($uploadsSize),
  ];
}

function get_cpu_info(): array {
  $cpu = [
    'cores' => null,
    'model' => null,
    'load_avg' => null,
    'load_percent' => null,
  ];
  
  if (function_exists('sys_getloadavg')) {
    $load = @sys_getloadavg();
    if ($load !== false && is_array($load) && count($load) >= 3) {
      $cpu['load_avg'] = [
        '1min' => round($load[0], 2),
        '5min' => round($load[1], 2),
        '15min' => round($load[2], 2),
      ];
    }
  }
  
  $cpuCount = null;
  if (function_exists('sysconf') && defined('_SC_NPROCESSORS_ONLN')) {
    $cpuCount = @sysconf(_SC_NPROCESSORS_ONLN);
  } elseif (function_exists('shell_exec') && !empty(shell_exec('echo 1'))) {
    $output = @shell_exec('nproc 2>/dev/null');
    if ($output !== null) {
      $cpuCount = (int)trim($output);
    }
  }
  
  if ($cpuCount === null || $cpuCount <= 0) {
    if (is_readable('/proc/cpuinfo')) {
      $cpuinfo = @file_get_contents('/proc/cpuinfo');
      if ($cpuinfo !== false) {
        preg_match_all('/^processor\s*:/m', $cpuinfo, $matches);
        $cpuCount = count($matches[0]);
        if ($cpuCount === 0) {
          preg_match_all('/^physical id\s*:/m', $cpuinfo, $matches);
          $cpuCount = count(array_unique($matches[0]));
        }
        if ($cpuCount > 0) {
          preg_match('/model name\s*:\s*(.+)/', $cpuinfo, $modelMatch);
          if (!empty($modelMatch[1])) {
            $cpu['model'] = trim($modelMatch[1]);
          }
        }
      }
    }
  }
  
  if ($cpuCount !== null && $cpuCount > 0) {
    $cpu['cores'] = $cpuCount;
    if ($cpu['load_avg'] && isset($cpu['load_avg']['1min'])) {
      $cpu['load_percent'] = round(($cpu['load_avg']['1min'] / $cpuCount) * 100, 1);
    }
  }
  
  return $cpu;
}

function get_system_info(): array {
  $info = [
    'php_version' => PHP_VERSION,
    'server_software' => $_SERVER['SERVER_SOFTWARE'] ?? 'Unknown',
    'server_name' => $_SERVER['SERVER_NAME'] ?? 'Unknown',
    'document_root' => $_SERVER['DOCUMENT_ROOT'] ?? 'Unknown',
    'max_execution_time' => ini_get('max_execution_time'),
    'max_upload_size' => ini_get('upload_max_filesize'),
    'post_max_size' => ini_get('post_max_size'),
    'timezone' => date_default_timezone_get(),
    'current_time' => date('Y-m-d H:i:s'),
    'uptime' => null,
  ];
  
  if (function_exists('sys_getloadavg')) {
    $load = @sys_getloadavg();
    if ($load !== false) {
      $info['load_average'] = $load;
    }
  }
  
  return $info;
}

function get_error_logs(int $limit = 100): array {
  $logs = [];
  
  $appLogFile = __DIR__ . '/../_data/error.log';
  if (is_file($appLogFile) && is_readable($appLogFile)) {
    $lines = file($appLogFile);
    if ($lines !== false) {
      $lines = array_slice($lines, -$limit);
      foreach ($lines as $line) {
        $trimmed = trim($line);
        if ($trimmed !== '') {
          $logs[] = $trimmed;
        }
      }
    }
  }
  
  $phpErrorLog = ini_get('error_log');
  if ($phpErrorLog && is_file($phpErrorLog) && is_readable($phpErrorLog) && $phpErrorLog !== $appLogFile) {
    $lines = file($phpErrorLog);
    if ($lines !== false) {
      $lines = array_slice($lines, -$limit);
      foreach ($lines as $line) {
        $trimmed = trim($line);
        if ($trimmed !== '') {
          $logs[] = '[PHP] ' . $trimmed;
        }
      }
    }
  }
  
  return array_slice(array_reverse($logs), 0, $limit);
}

function get_network_info(): array {
  $info = [
    'hostname' => function_exists('gethostname') ? @gethostname() : 'Unknown',
    'server_addr' => $_SERVER['SERVER_ADDR'] ?? 'Unknown',
    'remote_addr' => $_SERVER['REMOTE_ADDR'] ?? 'Unknown',
  ];
  
  if (function_exists('getrusage')) {
    $usage = @getrusage();
    if ($usage !== false && is_array($usage)) {
      $info['network_stats'] = [
        'involuntary_context_switches' => $usage['ru_nivcsw'] ?? 0,
        'voluntary_context_switches' => $usage['ru_nvcsw'] ?? 0,
      ];
    }
  }
  
  return $info;
}

function get_file_counts(): array {
  $dataDir = realpath(__DIR__ . '/../_data');
  $uploadsDir = realpath(__DIR__ . '/../uploads');
  
  $counts = [
    'data_files' => 0,
    'upload_files' => 0,
    'data_dirs' => 0,
    'upload_dirs' => 0,
  ];
  
  if ($dataDir !== false && is_dir($dataDir)) {
    try {
      $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dataDir, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
      );
      foreach ($iterator as $file) {
        if ($file->isFile()) {
          $counts['data_files']++;
        } elseif ($file->isDir()) {
          $counts['data_dirs']++;
        }
      }
    } catch (Throwable $e) {
    }
  }
  
  if ($uploadsDir !== false && is_dir($uploadsDir)) {
    try {
      $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($uploadsDir, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
      );
      foreach ($iterator as $file) {
        if ($file->isFile()) {
          $counts['upload_files']++;
        } elseif ($file->isDir()) {
          $counts['upload_dirs']++;
        }
      }
    } catch (Throwable $e) {
    }
  }
  
  return $counts;
}

$memory = get_memory_usage();
$disk = get_disk_usage();
$system = get_system_info();
$network = get_network_info();
$cpu = get_cpu_info();
$errors = get_error_logs(100);
$files = get_file_counts();

$load = null;
if (function_exists('sys_getloadavg')) {
  $load = sys_getloadavg();
}

$response = [
  'ok' => true,
  'timestamp' => time(),
  'memory' => $memory,
  'disk' => $disk,
  'system' => $system,
  'network' => $network,
  'cpu' => $cpu,
  'errors' => $errors,
  'files' => $files,
];

if ($load !== null) {
  $response['load'] = [
    '1min' => $load[0] ?? 0,
    '5min' => $load[1] ?? 0,
    '15min' => $load[2] ?? 0,
  ];
}

$snapshotData = [
  'memory' => $memory,
  'cpu' => $cpu,
  'disk' => $disk,
  'load' => $response['load'] ?? null,
];
save_monitor_snapshot($snapshotData);

$historyHours = isset($_GET['history_hours']) ? (int)$_GET['history_hours'] : 24;
if ($historyHours < 1) $historyHours = 1;
if ($historyHours > 168) $historyHours = 168;
$response['history'] = load_monitor_history($historyHours);

respond($response);
