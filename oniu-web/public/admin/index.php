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


