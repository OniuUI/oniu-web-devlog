<?php
declare(strict_types=1);
require __DIR__ . '/_lib.php';

require_login();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
echo json_encode(['csrf' => csrf_token()], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);


