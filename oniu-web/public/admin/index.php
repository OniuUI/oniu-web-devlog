<?php
declare(strict_types=1);
require __DIR__ . '/_lib.php';

require_login();
ensure_session();

$error = null;
$ok = null;

function normalize_publications(array $data): array {
  if (!isset($data['publications']) || !is_array($data['publications'])) {
    $data['publications'] = [];
  }
  // ensure consistent shape
  $out = [];
  foreach ($data['publications'] as $p) {
    if (!is_array($p)) continue;
    $id = isset($p['id']) && is_string($p['id']) && $p['id'] !== '' ? $p['id'] : bin2hex(random_bytes(8));
    $out[] = [
      'id' => $id,
      'title' => is_string($p['title'] ?? null) ? $p['title'] : 'Untitled',
      'date' => is_string($p['date'] ?? null) ? $p['date'] : date('Y-m-d'),
      'body' => is_string($p['body'] ?? null) ? $p['body'] : '',
      'media' => is_array($p['media'] ?? null) ? $p['media'] : [],
    ];
  }
  $data['publications'] = $out;
  return $data;
}

function find_post(array $posts, string $id): ?array {
  foreach ($posts as $p) {
    if (is_array($p) && ($p['id'] ?? '') === $id) return $p;
  }
  return null;
}

function upsert_post(array $posts, array $post): array {
  $id = (string)($post['id'] ?? '');
  $out = [];
  $found = false;
  foreach ($posts as $p) {
    if (is_array($p) && ($p['id'] ?? '') === $id) {
      $out[] = $post;
      $found = true;
    } else {
      $out[] = $p;
    }
  }
  if (!$found) array_unshift($out, $post);
  return $out;
}

function delete_post_by_id(array $posts, string $id): array {
  $out = [];
  foreach ($posts as $p) {
    if (is_array($p) && ($p['id'] ?? '') === $id) continue;
    $out[] = $p;
  }
  return $out;
}

function safe_kind(string $k): string {
  $k = strtolower(trim($k));
  if (in_array($k, ['image','video','file'], true)) return $k;
  return 'image';
}

function media_from_post(): array {
  $kinds = $_POST['media_kind'] ?? [];
  $titles = $_POST['media_title'] ?? [];
  $srcs = $_POST['media_src'] ?? [];
  $hrefs = $_POST['media_href'] ?? [];
  $posters = $_POST['media_poster'] ?? [];

  if (!is_array($kinds)) $kinds = [];
  $media = [];
  $n = count($kinds);
  for ($i = 0; $i < $n; $i++) {
    $kind = safe_kind((string)($kinds[$i] ?? 'image'));
    $title = trim((string)($titles[$i] ?? ''));
    $src = trim((string)($srcs[$i] ?? ''));
    $href = trim((string)($hrefs[$i] ?? ''));
    $poster = trim((string)($posters[$i] ?? ''));

    if ($kind === 'file') {
      if ($href === '') continue;
      $m = ['kind' => 'file', 'href' => $href];
      if ($title !== '') $m['title'] = $title;
      $media[] = $m;
      continue;
    }
    if ($src === '') continue;
    $m = ['kind' => $kind, 'src' => $src];
    if ($title !== '') $m['title'] = $title;
    if ($kind === 'video' && $poster !== '') $m['poster'] = $poster;
    $media[] = $m;
  }
  return $media;
}

function handle_upload_to_url(): ?string {
  if (!isset($_FILES['upload_file'])) return null;
  $f = $_FILES['upload_file'];
  if (!is_array($f) || ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) return null;

  $tmp = (string)$f['tmp_name'];
  $orig = (string)$f['name'];
  $size = (int)($f['size'] ?? 0);
  if ($size <= 0 || $size > 25 * 1024 * 1024) throw new RuntimeException("File too large (max 25MB)");

  $ext = strtolower(pathinfo($orig, PATHINFO_EXTENSION));
  if (!preg_match('/^[a-z0-9]{1,8}$/', $ext)) $ext = 'bin';
  $deny = ['php','phtml','phar','cgi','pl','asp','aspx','jsp'];
  if (in_array($ext, $deny, true)) throw new RuntimeException("Disallowed file type");

  $slug = safe_slug(pathinfo($orig, PATHINFO_FILENAME));
  $dir = uploads_dir() . '/' . date('Y-m');
  if (!is_dir($dir)) @mkdir($dir, 0755, true);
  $fname = $slug . '-' . bin2hex(random_bytes(4)) . '.' . $ext;
  $dest = $dir . '/' . $fname;
  if (!move_uploaded_file($tmp, $dest)) throw new RuntimeException("Could not move uploaded file");
  return '/uploads/' . date('Y-m') . '/' . $fname;
}

// Handle actions
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
  require_csrf();
  $action = (string)($_POST['action'] ?? '');

  try {
    if ($action === 'save_post') {
      $pub = normalize_publications(read_publications());
      $posts = $pub['publications'];

      $id = trim((string)($_POST['id'] ?? ''));
      if ($id === '') $id = bin2hex(random_bytes(8));

      $title = trim((string)($_POST['title'] ?? 'Untitled'));
      if ($title === '') $title = 'Untitled';

      $date = trim((string)($_POST['date'] ?? date('Y-m-d')));
      if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) $date = date('Y-m-d');

      $body = (string)($_POST['body'] ?? '');
      $media = media_from_post();

      // Optional: upload a file and append it as a media item
      $uploadedUrl = handle_upload_to_url();
      if ($uploadedUrl) {
        $kind = safe_kind((string)($_POST['upload_kind'] ?? 'image'));
        $mtitle = trim((string)($_POST['upload_title'] ?? ''));
        if ($kind === 'file') {
          $m = ['kind' => 'file', 'href' => $uploadedUrl];
          if ($mtitle !== '') $m['title'] = $mtitle;
          $media[] = $m;
        } else {
          $m = ['kind' => $kind, 'src' => $uploadedUrl];
          if ($mtitle !== '') $m['title'] = $mtitle;
          $media[] = $m;
        }
        $ok = "Uploaded: " . $uploadedUrl;
      }

      $post = ['id' => $id, 'title' => $title, 'date' => $date, 'body' => $body, 'media' => $media];
      $pub['publications'] = upsert_post($posts, $post);
      write_publications($pub);
      header('Location: /admin/?id=' . urlencode($id) . '&ok=1');
      exit;
    } elseif ($action === 'new_post') {
      $pub = normalize_publications(read_publications());
      $id = bin2hex(random_bytes(8));
      $post = ['id' => $id, 'title' => 'New post', 'date' => date('Y-m-d'), 'body' => '', 'media' => []];
      $pub['publications'] = upsert_post($pub['publications'], $post);
      write_publications($pub);
      header('Location: /admin/?id=' . urlencode($id));
      exit;
    } elseif ($action === 'delete_post') {
      $pub = normalize_publications(read_publications());
      $id = trim((string)($_POST['id'] ?? ''));
      $pub['publications'] = delete_post_by_id($pub['publications'], $id);
      write_publications($pub);
      header('Location: /admin/?ok=1');
      exit;
    } elseif ($action === 'save_publications') {
      // Advanced JSON editor
      $raw = (string)($_POST['json'] ?? '');
      $data = json_decode($raw, true);
      if (!is_array($data)) throw new RuntimeException("Invalid JSON");
      $data = normalize_publications($data);
      write_publications($data);
      $ok = "Saved publications.json";
    } elseif ($action === 'change_password') {
      $p = (string)($_POST['new_password'] ?? '');
      set_password($p);
      $ok = "Password updated";
    }
  } catch (Throwable $e) {
    $error = $e->getMessage();
  }
}

$csrf = csrf_token();
$pub = normalize_publications(read_publications());
$posts = $pub['publications'];
$editId = isset($_GET['id']) ? (string)$_GET['id'] : '';
if ($editId === '' && count($posts) > 0) $editId = (string)($posts[0]['id'] ?? '');
$editing = $editId !== '' ? find_post($posts, $editId) : null;
if (!$editing) {
  $editing = ['id' => '', 'title' => '', 'date' => date('Y-m-d'), 'body' => '', 'media' => []];
}
$pubJson = json_encode($pub, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . "\n";

$trafficAgg = [];
$trafficAggFile = __DIR__ . '/../_data/track-agg.json';
$rawTraffic = @file_get_contents($trafficAggFile);
if (is_string($rawTraffic) && trim($rawTraffic) !== '') {
  $decodedTraffic = json_decode($rawTraffic, true);
  if (is_array($decodedTraffic)) $trafficAgg = $decodedTraffic;
}
$trafficCountry = isset($_GET['country']) ? strtoupper(trim((string)$_GET['country'])) : '';
if (!preg_match('/^[A-Z]{2}$/', $trafficCountry)) $trafficCountry = '';
$trafficPath = isset($_GET['tpath']) ? trim((string)$_GET['tpath']) : '';
$trafficChat = isset($_GET['chat']) ? (string)$_GET['chat'] : '';
$trafficUsers = [];
foreach ($trafficAgg as $k => $u) {
  if (!is_array($u)) continue;
  if ($trafficCountry !== '' && strtoupper((string)($u['country'] ?? '')) !== $trafficCountry) continue;
  if ($trafficChat === '1' && empty($u['chatEver'])) continue;
  if ($trafficChat === '0' && !empty($u['chatEver'])) continue;
  if ($trafficPath !== '') {
    $paths = isset($u['paths']) && is_array($u['paths']) ? $u['paths'] : [];
    if (!isset($paths[$trafficPath])) continue;
  }
  $trafficUsers[] = $u;
}
usort($trafficUsers, function($a, $b) { return intval($b['lastSeen'] ?? 0) <=> intval($a['lastSeen'] ?? 0); });
if (count($trafficUsers) > 400) $trafficUsers = array_slice($trafficUsers, 0, 400);

?><!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ONIU Admin</title>
  <style>
    body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#070a0f;color:#eef2ff}
    .bg{position:fixed;inset:0;pointer-events:none;filter:hue-rotate(0deg);animation:hue 10s ease-in-out infinite}
    @keyframes hue{0%{filter:hue-rotate(0deg)}50%{filter:hue-rotate(18deg)}100%{filter:hue-rotate(0deg)}}
    .blob{position:absolute;border-radius:999px;filter:blur(70px);opacity:.35}
    .b1{width:60rem;height:24rem;left:50%;top:-6rem;transform:translateX(-50%);background:#4f46e5}
    .b2{width:52rem;height:22rem;left:35%;top:10rem;transform:translateX(-50%);background:#0ea5e9}
    .b3{width:64rem;height:28rem;left:50%;bottom:-10rem;transform:translateX(-50%);background:#10b981}
    .wrap{position:relative;max-width:1200px;margin:0 auto;padding:24px}
    .card{background:rgba(3,7,18,.55);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:16px}
    .row{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}
    .btn{appearance:none;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#e5e7eb;border-radius:14px;padding:10px 14px;font-weight:700;cursor:pointer}
    .btn.primary{background:#fff;color:#0b1220;border-color:transparent}
    .btn.danger{background:rgba(244,63,94,.12);border-color:rgba(244,63,94,.35);color:#fecdd3}
    .muted{color:rgba(255,255,255,.65);font-size:12px}
    .small{font-size:13px}
    textarea{width:100%;min-height:420px;resize:vertical;padding:12px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.22);color:#fff;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;line-height:1.4}
    input{padding:12px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.22);color:#fff}
    select{padding:12px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.22);color:#fff}
    .msg{margin:14px 0;padding:10px 12px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);font-size:13px}
    .ok{border-color:rgba(16,185,129,.35);color:#d1fae5}
    .err{border-color:rgba(244,63,94,.35);color:#fecdd3}
    a{color:inherit;text-decoration:none}
    .grid{display:grid;grid-template-columns:1fr;gap:14px}
    @media (min-width: 980px){.grid{grid-template-columns:1fr 1fr}}
    code{color:#fff}
    .list{display:flex;flex-direction:column;gap:8px}
    .item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04)}
    .item a{display:block;flex:1}
    .pill{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:6px 10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);font-size:12px;color:rgba(255,255,255,.8)}
    .row2{display:grid;grid-template-columns:1fr;gap:10px}
    @media (min-width: 980px){.row2{grid-template-columns:1fr 1fr}}
    .label{display:block;margin:0 0 6px 0}
    details{border:1px solid rgba(255,255,255,.12);border-radius:14px;background:rgba(255,255,255,.04);padding:10px 12px}
    summary{cursor:pointer;font-weight:800}
    .brand{display:flex;gap:10px;align-items:center}
    .mark{position:relative;width:36px;height:36px;border-radius:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);display:grid;place-items:center;overflow:hidden;animation:float 3.6s ease-in-out infinite}
    .mark:before{content:"";position:absolute;inset:-6px;border-radius:14px;background:radial-gradient(circle at 30% 20%, rgba(165,180,252,.22), transparent 55%),radial-gradient(circle at 70% 70%, rgba(16,185,129,.16), transparent 55%),radial-gradient(circle at 70% 25%, rgba(14,165,233,.16), transparent 55%);filter:blur(10px);opacity:.9}
    .rot{position:relative;z-index:1;animation:spin 8s linear infinite}
    @keyframes float{0%{transform:translateY(0)}50%{transform:translateY(-2px)}100%{transform:translateY(0)}}
    @keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
    @media (prefers-reduced-motion: reduce){.mark,.rot{animation:none}}
  </style>
</head>
<body>
  <div class="bg">
    <div class="blob b1"></div>
    <div class="blob b2"></div>
    <div class="blob b3"></div>
  </div>

  <div class="wrap">
    <div class="row" style="margin-bottom:14px">
      <div>
        <div class="brand">
          <div class="mark" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <defs>
                <linearGradient id="oniu-grad" x1="8" y1="10" x2="56" y2="54" gradientUnits="userSpaceOnUse">
                  <stop stop-color="#A5B4FC">
                    <animate attributeName="stop-color" dur="6.5s" repeatCount="indefinite"
                      values="#A5B4FC;#7DD3FC;#A7F3D0;#A5B4FC"/>
                  </stop>
                  <stop offset="0.5" stop-color="#7DD3FC">
                    <animate attributeName="stop-color" dur="6.5s" repeatCount="indefinite"
                      values="#7DD3FC;#A7F3D0;#A5B4FC;#7DD3FC"/>
                  </stop>
                  <stop offset="1" stop-color="#A7F3D0">
                    <animate attributeName="stop-color" dur="6.5s" repeatCount="indefinite"
                      values="#A7F3D0;#A5B4FC;#7DD3FC;#A7F3D0"/>
                  </stop>
                </linearGradient>
                <linearGradient id="oniu-sheen" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                  <stop stop-color="rgba(255,255,255,0.0)"/>
                  <stop offset="0.35" stop-color="rgba(255,255,255,0.18)"/>
                  <stop offset="0.65" stop-color="rgba(255,255,255,0.0)"/>
                </linearGradient>
              </defs>
              <path d="M20 10H44C49.522 10 54 14.478 54 20C54 24 54 26 54 28C54 30 54 31.5 54 32C54 32.5 54 34 54 36C54 38 54 40 54 44C54 49.522 49.522 54 44 54H20C14.478 54 10 49.522 10 44C10 40 10 38 10 36C10 34 10 32.5 10 32C10 31.5 10 30 10 28C10 26 10 24 10 20C10 14.478 14.478 10 20 10Z" fill="url(#oniu-grad)">
                <animate attributeName="d" dur="4.2s" repeatCount="indefinite"
                  values="M20 10H44C49.522 10 54 14.478 54 20C54 24 54 26 54 28C54 30 54 31.5 54 32C54 32.5 54 34 54 36C54 38 54 40 54 44C54 49.522 49.522 54 44 54H20C14.478 54 10 49.522 10 44C10 40 10 38 10 36C10 34 10 32.5 10 32C10 31.5 10 30 10 28C10 26 10 24 10 20C10 14.478 14.478 10 20 10Z;
                          M20 10H44C49.522 10 54 14.478 54 20C54 24 54 26 54 28C54 30 54 31.5 54 32C54 32.5 54 34 54 36C54 38 54 40 54 44C54 49.522 49.522 54 44 54H20C14.478 54 10 49.522 10 44C10 40 10 38 10 36C10 34 10 32.5 10 32C10 31.5 10 30 10 28C10 26 10 24 10 20C10 14.478 14.478 10 20 10Z;
                          M20 10H44C49.522 10 54 14.478 54 20C54 24 54 26 54 28C54 30 50 31.5 46 32C50 32.5 54 34 54 36C54 38 54 40 54 44C54 49.522 49.522 54 44 54H20C14.478 54 10 49.522 10 44C10 40 10 38 10 36C10 34 14 32.5 18 32C14 31.5 10 30 10 28C10 26 10 24 10 20C10 14.478 14.478 10 20 10Z;
                          M20 10H44C49.522 10 54 14.478 54 20C54 24 54 26 54 28C54 30 54 31.5 54 32C54 32.5 54 34 54 36C54 38 54 40 54 44C54 49.522 49.522 54 44 54H20C14.478 54 10 49.522 10 44C10 40 10 38 10 36C10 34 10 32.5 10 32C10 31.5 10 30 10 28C10 26 10 24 10 20C10 14.478 14.478 10 20 10Z;
                          M20 10H44C49.522 10 54 14.478 54 20C54 24 54 26 54 28C54 30 54 31.5 54 32C54 32.5 54 34 54 36C54 38 54 40 54 44C54 49.522 49.522 54 44 54H20C14.478 54 10 49.522 10 44C10 40 10 38 10 36C10 34 10 32.5 10 32C10 31.5 10 30 10 28C10 26 10 24 10 20C10 14.478 14.478 10 20 10Z"
                  keyTimes="0;0.70;0.76;0.82;1" calcMode="spline"
                  keySplines="0.2 0.8 0.2 1; 0.2 0.8 0.2 1; 0.2 0.8 0.2 1; 0.2 0.8 0.2 1"/>
              </path>
              <path d="M20 10H44C49.522 10 54 14.478 54 20C54 24 54 26 54 28C54 30 54 31.5 54 32C54 32.5 54 34 54 36C54 38 54 40 54 44C54 49.522 49.522 54 44 54H20C14.478 54 10 49.522 10 44C10 40 10 38 10 36C10 34 10 32.5 10 32C10 31.5 10 30 10 28C10 26 10 24 10 20C10 14.478 14.478 10 20 10Z" fill="url(#oniu-sheen)" opacity="0.7"/>
              <path d="M20 10H44C49.522 10 54 14.478 54 20C54 24 54 26 54 28C54 30 54 31.5 54 32C54 32.5 54 34 54 36C54 38 54 40 54 44C54 49.522 49.522 54 44 54H20C14.478 54 10 49.522 10 44C10 40 10 38 10 36C10 34 10 32.5 10 32C10 31.5 10 30 10 28C10 26 10 24 10 20C10 14.478 14.478 10 20 10Z" fill="none" stroke="rgba(255,255,255,0.20)" stroke-width="1"/>
              <rect x="16" y="28.5" width="32" height="7" rx="3.5" fill="rgba(0,0,0,0.26)"/>
              <rect x="17" y="29.5" width="30" height="5" rx="2.5" fill="rgba(255,255,255,0.34)"/>
            </svg>
          </div>
          <div style="font-size:14px;font-weight:900;letter-spacing:.08em">ONIU</div>
        </div>
        <div class="muted" style="margin-top:6px">Admin • publishes directly to <code>/publications.json</code></div>
      </div>
      <div class="row">
        <a class="btn" href="/">View site</a>
        <a class="btn danger" href="/admin/logout.php">Logout</a>
      </div>
    </div>

    <?php if ($ok): ?><div class="msg ok"><?= htmlspecialchars($ok) ?></div><?php endif; ?>
    <?php if ($error): ?><div class="msg err"><?= htmlspecialchars($error) ?></div><?php endif; ?>

    <div class="grid">
      <div class="card">
        <div class="row" style="margin-bottom:10px">
          <div style="font-weight:800">Posts</div>
          <form method="post" style="margin:0">
            <input type="hidden" name="csrf" value="<?= htmlspecialchars($csrf) ?>" />
            <input type="hidden" name="action" value="new_post" />
            <button class="btn primary" type="submit">New post</button>
          </form>
        </div>

        <div class="list">
          <?php foreach ($posts as $p): ?>
            <div class="item">
              <a href="/admin/?id=<?= urlencode((string)$p['id']) ?>">
                <div style="font-weight:800"><?= htmlspecialchars((string)$p['title']) ?></div>
                <div class="muted"><?= htmlspecialchars((string)$p['date']) ?></div>
              </a>
              <span class="pill"><?= count((array)($p['media'] ?? [])) ?> media</span>
            </div>
          <?php endforeach; ?>
          <?php if (count($posts) === 0): ?>
            <div class="muted">No posts yet.</div>
          <?php endif; ?>
        </div>

        <details style="margin-top:14px">
          <summary>Advanced: edit JSON</summary>
          <div class="muted" style="margin:10px 0">Optional. Paste custom JSON if you want full control.</div>
          <form method="post">
            <input type="hidden" name="csrf" value="<?= htmlspecialchars($csrf) ?>" />
            <input type="hidden" name="action" value="save_publications" />
            <textarea name="json"><?= htmlspecialchars($pubJson) ?></textarea>
            <div class="row" style="margin-top:12px">
              <div class="muted">Tip: keep media as <code>/uploads/...</code> URLs.</div>
              <button class="btn" type="submit">Save JSON</button>
            </div>
          </form>
        </details>

        <details style="margin-top:14px" open>
          <summary>Monitoring</summary>
          <div class="muted" style="margin:10px 0">Server performance, resource usage, and diagnostics with historical trends.</div>
          <div style="margin:10px 0">
            <label class="muted">History: </label>
            <select id="history-hours" style="margin-left:8px">
              <option value="1">Last hour</option>
              <option value="6">Last 6 hours</option>
              <option value="24" selected>Last 24 hours</option>
              <option value="48">Last 48 hours</option>
              <option value="168">Last week</option>
            </select>
          </div>
          <div id="monitor-charts" style="margin:20px 0"></div>
          <div id="monitor-data" style="margin:10px 0">
            <div class="muted">Loading...</div>
          </div>
          <script src="/lib/highcharts/highcharts.js"></script>
          <script src="/lib/highcharts/drilldown.js"></script>
          <script>
            (function() {
              const el = document.getElementById('monitor-data');
              const chartsEl = document.getElementById('monitor-charts');
              const historySelect = document.getElementById('history-hours');
              let charts = {};
              
              function renderCharts(data) {
                if (!data.history || !Array.isArray(data.history) || data.history.length === 0) {
                  chartsEl.innerHTML = '<div class="muted" style="padding:20px;text-align:center">No historical data yet. Data will appear after a few minutes.</div>';
                  return;
                }
                
                const history = data.history;
                const hours = parseInt(historySelect.value) || 24;
                
                chartsEl.innerHTML = '<div id="memory-chart" style="height:300px;margin-bottom:20px"></div><div id="cpu-chart" style="height:300px;margin-bottom:20px"></div><div id="disk-chart" style="height:300px;margin-bottom:20px"></div><div id="load-chart" style="height:300px"></div>';
                
                const memData = history.map(h => [h.ts, h.memory ? (h.memory.used || 0) : null]).filter(d => d[1] !== null);
                const memPeak = history.map(h => [h.ts, h.memory ? (h.memory.peak || 0) : null]).filter(d => d[1] !== null);
                const memPercent = history.map(h => [h.ts, h.memory && h.memory.percent !== undefined ? h.memory.percent : null]).filter(d => d[1] !== null);
                const memLimit = history.map(h => [h.ts, h.memory ? (h.memory.limit || 0) : null]).filter(d => d[1] !== null && d[1] > 0);
                const memAvg = memData.length > 0 ? memData.reduce((sum, d) => sum + d[1], 0) / memData.length : 0;
                const memMax = memData.length > 0 ? Math.max(...memData.map(d => d[1])) : 0;
                
                if (memData.length > 0 && typeof Highcharts !== 'undefined') {
                  Highcharts.chart('memory-chart', {
                    title: { text: 'Memory Usage', style: { color: '#eef2ff', fontSize: '14px' } },
                    chart: { backgroundColor: 'rgba(3,7,18,.3)', height: 300 },
                    xAxis: { type: 'datetime', labels: { style: { color: '#9ca3af' } } },
                    yAxis: [
                      { title: { text: 'Bytes', style: { color: '#9ca3af' } }, labels: { style: { color: '#9ca3af' }, formatter: function() { return formatBytes(this.value); } }, opposite: false },
                      { title: { text: 'Percentage', style: { color: '#9ca3af' } }, labels: { style: { color: '#9ca3af' }, formatter: function() { return this.value + '%'; } }, min: 0, max: 100, opposite: true }
                    ],
                    legend: { itemStyle: { color: '#9ca3af' } },
                    tooltip: { 
                      backgroundColor: 'rgba(3,7,18,.9)', 
                      style: { color: '#eef2ff' }, 
                      shared: true,
                      formatter: function() {
                        let s = Highcharts.dateFormat('%Y-%m-%d %H:%M:%S', this.x) + '<br/>';
                        this.points.forEach(p => {
                          if (p.series.yAxis.options.title.text === 'Percentage') {
                            s += '<b>' + p.series.name + '</b>: ' + p.y.toFixed(1) + '%<br/>';
                          } else {
                            s += '<b>' + p.series.name + '</b>: ' + formatBytes(p.y) + '<br/>';
                          }
                        });
                        return s;
                      }
                    },
                    series: [
                      { name: 'Used', data: memData, color: '#10b981', type: 'line', yAxis: 0 },
                      { name: 'Peak', data: memPeak, color: '#f59e0b', type: 'line', dashStyle: 'dash', yAxis: 0 },
                      { name: 'Limit', data: memLimit, color: '#ef4444', type: 'line', dashStyle: 'dot', yAxis: 0 },
                      { name: 'Usage %', data: memPercent, color: '#3b82f6', type: 'line', yAxis: 1 },
                      { name: 'Avg Used', data: history.map(h => [h.ts, memAvg]), color: '#6366f1', type: 'line', dashStyle: 'dot', enableMouseTracking: false, yAxis: 0 }
                    ],
                    plotOptions: { series: { marker: { radius: 2 } } }
                  });
                }
                
                const cpuData = history.map(h => [h.ts, h.cpu && h.cpu.load_avg ? h.cpu.load_avg['1min'] : null]).filter(d => d[1] !== null);
                const cpuAvg = cpuData.length > 0 ? cpuData.reduce((sum, d) => sum + d[1], 0) / cpuData.length : 0;
                const cpuMax = cpuData.length > 0 ? Math.max(...cpuData.map(d => d[1])) : 0;
                
                if (cpuData.length > 0 && typeof Highcharts !== 'undefined') {
                  Highcharts.chart('cpu-chart', {
                    title: { text: 'CPU Load Average (1min)', style: { color: '#eef2ff', fontSize: '14px' } },
                    chart: { backgroundColor: 'rgba(3,7,18,.3)', height: 300 },
                    xAxis: { type: 'datetime', labels: { style: { color: '#9ca3af' } } },
                    yAxis: { title: { text: 'Load', style: { color: '#9ca3af' } }, labels: { style: { color: '#9ca3af' } } },
                    legend: { itemStyle: { color: '#9ca3af' } },
                    tooltip: { backgroundColor: 'rgba(3,7,18,.9)', style: { color: '#eef2ff' }, formatter: function() { return '<b>' + this.series.name + '</b><br/>' + Highcharts.dateFormat('%Y-%m-%d %H:%M:%S', this.x) + '<br/>' + this.y.toFixed(2); } },
                    series: [
                      { name: 'Load (1min)', data: cpuData, color: '#3b82f6', type: 'line' },
                      { name: 'Average', data: history.map(h => [h.ts, cpuAvg]), color: '#6366f1', type: 'line', dashStyle: 'dot', enableMouseTracking: false }
                    ],
                    plotOptions: { series: { marker: { radius: 2 } } }
                  });
                }
                
                const diskData = history.map(h => [h.ts, h.disk ? (h.disk.used || 0) : null]).filter(d => d[1] !== null);
                const diskAvg = diskData.length > 0 ? diskData.reduce((sum, d) => sum + d[1], 0) / diskData.length : 0;
                
                if (diskData.length > 0 && typeof Highcharts !== 'undefined') {
                  Highcharts.chart('disk-chart', {
                    title: { text: 'Disk Usage', style: { color: '#eef2ff', fontSize: '14px' } },
                    chart: { backgroundColor: 'rgba(3,7,18,.3)', height: 300 },
                    xAxis: { type: 'datetime', labels: { style: { color: '#9ca3af' } } },
                    yAxis: { title: { text: 'Bytes', style: { color: '#9ca3af' } }, labels: { style: { color: '#9ca3af' }, formatter: function() { return formatBytes(this.value); } } },
                    legend: { itemStyle: { color: '#9ca3af' } },
                    tooltip: { backgroundColor: 'rgba(3,7,18,.9)', style: { color: '#eef2ff' }, formatter: function() { return '<b>' + this.series.name + '</b><br/>' + Highcharts.dateFormat('%Y-%m-%d %H:%M:%S', this.x) + '<br/>' + formatBytes(this.y); } },
                    series: [
                      { name: 'Used', data: diskData, color: '#ef4444', type: 'line' },
                      { name: 'Average', data: history.map(h => [h.ts, diskAvg]), color: '#6366f1', type: 'line', dashStyle: 'dot', enableMouseTracking: false }
                    ],
                    plotOptions: { series: { marker: { radius: 2 } } }
                  });
                }
                
                const load1Data = history.map(h => [h.ts, h.load ? h.load['1min'] : null]).filter(d => d[1] !== null);
                const load5Data = history.map(h => [h.ts, h.load ? h.load['5min'] : null]).filter(d => d[1] !== null);
                const load15Data = history.map(h => [h.ts, h.load ? h.load['15min'] : null]).filter(d => d[1] !== null);
                
                if (load1Data.length > 0 && typeof Highcharts !== 'undefined') {
                  Highcharts.chart('load-chart', {
                    title: { text: 'System Load Average', style: { color: '#eef2ff', fontSize: '14px' } },
                    chart: { backgroundColor: 'rgba(3,7,18,.3)', height: 300 },
                    xAxis: { type: 'datetime', labels: { style: { color: '#9ca3af' } } },
                    yAxis: { title: { text: 'Load', style: { color: '#9ca3af' } }, labels: { style: { color: '#9ca3af' } } },
                    legend: { itemStyle: { color: '#9ca3af' } },
                    tooltip: { backgroundColor: 'rgba(3,7,18,.9)', style: { color: '#eef2ff' }, shared: true, formatter: function() { let s = Highcharts.dateFormat('%Y-%m-%d %H:%M:%S', this.x) + '<br/>'; this.points.forEach(p => { s += '<b>' + p.series.name + '</b>: ' + p.y.toFixed(2) + '<br/>'; }); return s; } },
                    series: [
                      { name: '1 min', data: load1Data, color: '#3b82f6', type: 'line' },
                      { name: '5 min', data: load5Data, color: '#10b981', type: 'line' },
                      { name: '15 min', data: load15Data, color: '#f59e0b', type: 'line' }
                    ],
                    plotOptions: { series: { marker: { radius: 2 } } }
                  });
                }
              }
              
              function formatBytes(bytes) {
                if (bytes === 0) return '0 B';
                const k = 1024;
                const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
                const i = Math.floor(Math.log(bytes) / Math.log(k));
                return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
              }
              
              function load() {
                const hours = historySelect.value || '24';
                fetch('/admin/monitor.php?history_hours=' + hours, { cache: 'no-store' })
                  .then(r => r.json())
                  .then(data => {
                    renderCharts(data);
                    if (!data.ok) {
                      el.innerHTML = '<div class="err">Failed to load monitoring data</div>';
                      return;
                    }
                    const m = data.memory || {};
                    const d = data.disk || {};
                    const s = data.system || {};
                    const n = data.network || {};
                    const f = data.files || {};
                    const errs = Array.isArray(data.errors) ? data.errors : [];
                    
                    let html = '<div style="display:grid;grid-template-columns:1fr;gap:10px;margin:10px 0">';
                    
                    const memPercent = m.percent || 0;
                    const memColor = memPercent > 90 ? 'rgba(244,63,94,.8)' : memPercent > 70 ? 'rgba(251,191,36,.8)' : 'rgba(16,185,129,.8)';
                    html += '<div class="item"><div><strong>Memory</strong><div class="muted">Used: ' + (m.used_formatted || 'N/A') + ' / ' + (m.limit_formatted || 'N/A') + ' (' + memPercent + '%)</div>';
                    html += '<div style="width:100%;height:6px;background:rgba(255,255,255,.1);border-radius:3px;margin:6px 0;overflow:hidden"><div style="width:' + memPercent + '%;height:100%;background:' + memColor + '"></div></div>';
                    html += '<div class="muted">Peak: ' + (m.peak_formatted || 'N/A') + '</div></div></div>';
                    
                    const diskPercent = d.percent || 0;
                    const diskColor = diskPercent > 90 ? 'rgba(244,63,94,.8)' : diskPercent > 70 ? 'rgba(251,191,36,.8)' : 'rgba(16,185,129,.8)';
                    html += '<div class="item"><div><strong>Disk</strong><div class="muted">Used: ' + (d.used_formatted || 'N/A') + ' / ' + (d.total_formatted || 'N/A') + ' (' + diskPercent + '%)</div>';
                    html += '<div style="width:100%;height:6px;background:rgba(255,255,255,.1);border-radius:3px;margin:6px 0;overflow:hidden"><div style="width:' + diskPercent + '%;height:100%;background:' + diskColor + '"></div></div>';
                    html += '<div class="muted">Free: ' + (d.free_formatted || 'N/A') + '</div><div class="muted">Data: ' + (d.data_size_formatted || 'N/A') + ' | Uploads: ' + (d.uploads_size_formatted || 'N/A') + '</div></div></div>';
                    
                    const cpu = data.cpu || {};
                    html += '<div class="item"><div><strong>CPU</strong>';
                    if (cpu.cores) {
                      html += '<div class="muted">Cores: ' + cpu.cores + '</div>';
                    }
                    if (cpu.model) {
                      html += '<div class="muted" style="font-size:11px;word-break:break-all">' + htmlspecialchars(cpu.model) + '</div>';
                    }
                    if (cpu.load_avg) {
                      const load1 = cpu.load_avg['1min'] || 0;
                      const load5 = cpu.load_avg['5min'] || 0;
                      const load15 = cpu.load_avg['15min'] || 0;
                      html += '<div class="muted">Load avg: ' + load1.toFixed(2) + ' / ' + load5.toFixed(2) + ' / ' + load15.toFixed(2) + '</div>';
                      if (cpu.load_percent !== null && cpu.load_percent !== undefined) {
                        const loadColor = cpu.load_percent > 90 ? 'rgba(244,63,94,.8)' : cpu.load_percent > 70 ? 'rgba(251,191,36,.8)' : 'rgba(16,185,129,.8)';
                        html += '<div class="muted">CPU usage: ' + cpu.load_percent + '%</div>';
                        html += '<div style="width:100%;height:6px;background:rgba(255,255,255,.1);border-radius:3px;margin:6px 0;overflow:hidden"><div style="width:' + Math.min(cpu.load_percent, 100) + '%;height:100%;background:' + loadColor + '"></div></div>';
                      }
                    } else if (data.load) {
                      html += '<div class="muted">Load avg: ' + (data.load['1min'] || 0).toFixed(2) + ' / ' + (data.load['5min'] || 0).toFixed(2) + ' / ' + (data.load['15min'] || 0).toFixed(2) + '</div>';
                    } else if (s.load_average) {
                      html += '<div class="muted">Load: ' + s.load_average.map(v => v.toFixed(2)).join(', ') + '</div>';
                    }
                    if (!cpu.cores && !cpu.load_avg && !data.load && !s.load_average) {
                      html += '<div class="muted">CPU info not available</div>';
                    }
                    html += '</div></div>';
                    
                    html += '<div class="item"><div><strong>System</strong><div class="muted">PHP: ' + (s.php_version || 'N/A') + '</div><div class="muted">Server: ' + (s.server_software || 'N/A') + '</div><div class="muted">Max execution: ' + (s.max_execution_time || 'N/A') + 's</div><div class="muted">Max upload: ' + (s.max_upload_size || 'N/A') + '</div><div class="muted">Post max: ' + (s.post_max_size || 'N/A') + '</div><div class="muted">Timezone: ' + (s.timezone || 'N/A') + '</div></div></div>';
                    
                    html += '<div class="item"><div><strong>Network</strong><div class="muted">Hostname: ' + (n.hostname || 'N/A') + '</div><div class="muted">Server IP: ' + (n.server_addr || 'N/A') + '</div><div class="muted">Your IP: ' + (n.remote_addr || 'N/A') + '</div></div></div>';
                    
                    html += '<div class="item"><div><strong>Files</strong><div class="muted">Data files: ' + (f.data_files || 0) + ' in ' + (f.data_dirs || 0) + ' dirs</div><div class="muted">Upload files: ' + (f.upload_files || 0) + ' in ' + (f.upload_dirs || 0) + ' dirs</div></div></div>';
                    
                    if (errs.length > 0) {
                      html += '<details style="margin-top:10px"><summary style="cursor:pointer;font-weight:800"><strong>Error Logs (' + errs.length + ')</strong></summary>';
                      html += '<div style="max-height:400px;overflow:auto;margin-top:10px;padding:12px;background:rgba(0,0,0,.4);border-radius:8px;border:1px solid rgba(255,255,255,.1);font-family:ui-monospace,monospace;font-size:11px;line-height:1.6">';
                      errs.slice(0, 100).forEach(e => {
                        const isError = e && (e.indexOf('[ERROR]') >= 0 || e.indexOf('error') >= 0 || e.indexOf('Error') >= 0);
                        const color = isError ? 'rgba(244,63,94,.8)' : 'rgba(255,255,255,.65)';
                        html += '<div style="margin-bottom:6px;color:' + color + ';word-break:break-all">' + (e ? htmlspecialchars(e) : '') + '</div>';
                      });
                      html += '</div></details>';
                    } else {
                      html += '<div class="item"><div><strong>Error Logs</strong><div class="muted" style="color:rgba(16,185,129,.8)">No recent errors</div></div></div>';
                    }
                    
                    html += '</div>';
                    html += '<div class="muted" style="margin-top:10px;text-align:right">Last updated: ' + new Date().toLocaleTimeString() + '</div>';
                    el.innerHTML = html;
                  })
                  .catch(e => {
                    el.innerHTML = '<div class="err">Error loading monitoring data: ' + e.message + '</div>';
                  });
              }
              load();
              historySelect.addEventListener('change', load);
              setInterval(load, 10000);
            })();
            function htmlspecialchars(str) {
              const div = document.createElement('div');
              div.textContent = str;
              return div.innerHTML;
            }
          </script>
        </details>

        <details style="margin-top:14px">
          <summary>Traffic</summary>
          <div class="muted" style="margin:10px 0">Latest unique visitors. Country is only available if the host provides it (e.g. Cloudflare).</div>

          <form method="get" class="row" style="justify-content:flex-start;gap:10px;margin:10px 0">
            <label class="muted">Country</label>
            <input name="country" value="<?= htmlspecialchars($trafficCountry) ?>" placeholder="SE" style="width:80px" />
            <label class="muted">Path</label>
            <input name="tpath" value="<?= htmlspecialchars($trafficPath) ?>" placeholder="/#publications" style="width:min(360px,70vw)" />
            <label class="muted">Chat</label>
            <select name="chat">
              <option value="" <?= $trafficChat===''?'selected':'' ?>>any</option>
              <option value="1" <?= $trafficChat==='1'?'selected':'' ?>>used chat</option>
              <option value="0" <?= $trafficChat==='0'?'selected':'' ?>>no chat</option>
            </select>
            <button class="btn" type="submit">Filter</button>
            <a class="btn" href="/admin/">Reset</a>
          </form>

          <div style="max-height:420px;overflow:auto;border:1px solid rgba(255,255,255,.12);border-radius:14px">
            <table style="width:100%;border-collapse:collapse;font-size:12px">
              <thead>
                <tr style="position:sticky;top:0;background:rgba(3,7,18,.85);backdrop-filter:blur(8px)">
                  <th style="text-align:left;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.10)">Last seen</th>
                  <th style="text-align:left;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.10)">IP</th>
                  <th style="text-align:left;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.10)">Country</th>
                  <th style="text-align:left;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.10)">Visits</th>
                  <th style="text-align:left;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.10)">Chat</th>
                  <th style="text-align:left;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.10)">User agent</th>
                </tr>
              </thead>
              <tbody>
                <?php if (count($trafficUsers) === 0): ?>
                  <tr><td colspan="6" class="muted" style="padding:12px">No tracked visitors yet.</td></tr>
                <?php endif; ?>
                <?php foreach ($trafficUsers as $u): ?>
                  <?php
                    $ls = intval($u['lastSeen'] ?? 0);
                    $lsTxt = $ls > 0 ? date('Y-m-d H:i:s', (int) floor($ls / 1000)) : '';
                    $ip = (string)($u['ip'] ?? '');
                    $cc = (string)($u['country'] ?? '');
                    $cnt = intval($u['count'] ?? 0);
                    $chatEver = !empty($u['chatEver']);
                    $ua = (string)($u['ua'] ?? '');
                  ?>
                  <tr>
                    <td style="padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.06)"><?= htmlspecialchars($lsTxt) ?></td>
                    <td style="padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.06);font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace"><?= htmlspecialchars($ip) ?></td>
                    <td style="padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.06)"><?= htmlspecialchars($cc) ?></td>
                    <td style="padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.06)"><?= htmlspecialchars((string)$cnt) ?></td>
                    <td style="padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.06)"><?= $chatEver ? 'yes' : 'no' ?></td>
                    <td style="padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.06);color:rgba(255,255,255,.65)"><?= htmlspecialchars($ua) ?></td>
                  </tr>
                <?php endforeach; ?>
              </tbody>
            </table>
          </div>
        </details>
      </div>

      <div class="card">
        <div class="row" style="margin-bottom:10px">
          <div style="font-weight:800">Edit post</div>
          <form method="post" style="margin:0" onsubmit="return confirm('Delete this post?')">
            <input type="hidden" name="csrf" value="<?= htmlspecialchars($csrf) ?>" />
            <input type="hidden" name="action" value="delete_post" />
            <input type="hidden" name="id" value="<?= htmlspecialchars((string)$editing['id']) ?>" />
            <button class="btn danger" type="submit" <?= $editing['id'] === '' ? 'disabled' : '' ?>>Delete</button>
          </form>
        </div>

        <form method="post" enctype="multipart/form-data">
          <input type="hidden" name="csrf" value="<?= htmlspecialchars($csrf) ?>" />
          <input type="hidden" name="action" value="save_post" />
          <input type="hidden" name="id" value="<?= htmlspecialchars((string)$editing['id']) ?>" />

          <div class="row2">
            <div>
              <label class="label muted">Title</label>
              <input name="title" style="width:100%" value="<?= htmlspecialchars((string)$editing['title']) ?>" />
            </div>
            <div>
              <label class="label muted">Date</label>
              <input name="date" type="date" style="width:100%" value="<?= htmlspecialchars((string)$editing['date']) ?>" />
            </div>
          </div>

          <div style="margin-top:10px">
            <label class="label muted">Body</label>
            <textarea name="body" style="min-height:220px"><?= htmlspecialchars((string)$editing['body']) ?></textarea>
          </div>

          <div style="margin-top:10px">
            <div style="font-weight:800;margin-bottom:8px">Media</div>
            <div class="muted" style="margin-bottom:10px">Add anything: images, videos, or files. All optional.</div>

            <?php $media = is_array($editing['media'] ?? null) ? $editing['media'] : []; ?>
            <?php foreach ($media as $i => $m): ?>
              <?php
                $kind = is_string($m['kind'] ?? null) ? $m['kind'] : 'image';
                $title = is_string($m['title'] ?? null) ? $m['title'] : '';
                $src = is_string($m['src'] ?? null) ? $m['src'] : '';
                $href = is_string($m['href'] ?? null) ? $m['href'] : '';
                $poster = is_string($m['poster'] ?? null) ? $m['poster'] : '';
              ?>
              <div class="item" style="align-items:flex-start">
                <div style="flex:1">
                  <div class="row2">
                    <div>
                      <label class="label muted">Kind</label>
                      <select name="media_kind[]">
                        <option value="image" <?= $kind==='image'?'selected':'' ?>>image</option>
                        <option value="video" <?= $kind==='video'?'selected':'' ?>>video</option>
                        <option value="file" <?= $kind==='file'?'selected':'' ?>>file</option>
                      </select>
                    </div>
                    <div>
                      <label class="label muted">Title (optional)</label>
                      <input name="media_title[]" style="width:100%" value="<?= htmlspecialchars($title) ?>" />
                    </div>
                  </div>
                  <div class="row2" style="margin-top:10px">
                    <div>
                      <label class="label muted">src (for image/video)</label>
                      <input name="media_src[]" style="width:100%" value="<?= htmlspecialchars($src) ?>" />
                    </div>
                    <div>
                      <label class="label muted">href (for file)</label>
                      <input name="media_href[]" style="width:100%" value="<?= htmlspecialchars($href) ?>" />
                    </div>
                  </div>
                  <div style="margin-top:10px">
                    <label class="label muted">poster (optional, for video)</label>
                    <input name="media_poster[]" style="width:100%" value="<?= htmlspecialchars($poster) ?>" />
                  </div>
                </div>
              </div>
            <?php endforeach; ?>

            <!-- Empty row to add a new media link manually -->
            <details style="margin-top:10px">
              <summary>Add media by URL</summary>
              <div class="row2" style="margin-top:10px">
                <div>
                  <label class="label muted">Kind</label>
                  <select name="media_kind[]">
                    <option value="image">image</option>
                    <option value="video">video</option>
                    <option value="file">file</option>
                  </select>
                </div>
                <div>
                  <label class="label muted">Title (optional)</label>
                  <input name="media_title[]" style="width:100%" />
                </div>
              </div>
              <div class="row2" style="margin-top:10px">
                <div>
                  <label class="label muted">src (image/video)</label>
                  <input name="media_src[]" style="width:100%" placeholder="/uploads/..." />
                </div>
                <div>
                  <label class="label muted">href (file)</label>
                  <input name="media_href[]" style="width:100%" placeholder="/uploads/..." />
                </div>
              </div>
              <div style="margin-top:10px">
                <label class="label muted">poster (optional, video)</label>
                <input name="media_poster[]" style="width:100%" />
              </div>
            </details>

            <details style="margin-top:10px">
              <summary>Upload media</summary>
              <div class="muted" style="margin-top:8px">Uploads to <code>/uploads/YYYY-MM/</code> and auto-attaches to this post on save.</div>
              <div class="row2" style="margin-top:10px">
                <div>
                  <label class="label muted">Upload kind</label>
                  <select name="upload_kind">
                    <option value="image">image</option>
                    <option value="video">video</option>
                    <option value="file">file</option>
                  </select>
                </div>
                <div>
                  <label class="label muted">Title (optional)</label>
                  <input name="upload_title" style="width:100%" />
                </div>
              </div>
              <div style="margin-top:10px">
                <input type="file" name="upload_file" />
              </div>
            </details>
          </div>

          <div class="row" style="margin-top:12px">
            <div class="muted">Saved to <code>/publications.json</code></div>
            <button class="btn primary" type="submit">Save post</button>
          </div>
        </form>

        <hr style="border:0;border-top:1px solid rgba(255,255,255,.10);margin:16px 0" />

        <div style="font-weight:800;margin-bottom:8px">Change password</div>
        <form method="post">
          <input type="hidden" name="csrf" value="<?= htmlspecialchars($csrf) ?>" />
          <input type="hidden" name="action" value="change_password" />
          <input type="password" name="new_password" placeholder="New password (min 8 chars)" style="width:100%" />
          <div style="margin-top:10px">
            <button class="btn" type="submit">Update password</button>
          </div>
        </form>
      </div>
    </div>

    <div class="muted" style="margin-top:14px">
      Tip: If you want to attach an existing URL, use “Add media by URL”. Uploads are stored under <code>/uploads</code>.
    </div>
  </div>
</body>
</html>


