<?php
declare(strict_types=1);

function error_log_file(): string {
  $dir = realpath(__DIR__ . '/../_data');
  if ($dir === false) {
    $dir = __DIR__ . '/../_data';
    @mkdir($dir, 0755, true);
    $dir = realpath($dir);
  }
  if ($dir === false) return __DIR__ . '/../_data/error.log';
  return $dir . '/error.log';
}

function app_log(string $message, string $level = 'INFO'): void {
  $file = error_log_file();
  $timestamp = date('Y-m-d H:i:s');
  $line = "[$timestamp] [$level] $message\n";
  @file_put_contents($file, $line, FILE_APPEND | LOCK_EX);
  
  if (filesize($file) > 10 * 1024 * 1024) {
    $lines = file($file);
    if ($lines !== false && count($lines) > 1000) {
      $keep = array_slice($lines, -500);
      @file_put_contents($file, implode('', $keep), LOCK_EX);
    }
  }
}

function app_log_error(string $message): void {
  app_log($message, 'ERROR');
}

function app_log_warning(string $message): void {
  app_log($message, 'WARNING');
}

function app_log_info(string $message): void {
  app_log($message, 'INFO');
}
