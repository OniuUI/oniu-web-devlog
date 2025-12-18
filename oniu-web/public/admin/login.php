<?php
declare(strict_types=1);
require __DIR__ . '/_lib.php';

ensure_session();
$cfg = load_config();
$error = null;

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
  require_csrf();
  $password = (string)($_POST['password'] ?? '');
  $hash = (string)($cfg['password_hash'] ?? '');
  if ($hash && password_verify($password, $hash)) {
    $_SESSION['admin_ok'] = true;
    header('Location: /admin/');
    exit;
  }
  $error = "Wrong password.";
}

$csrf = csrf_token();
?><!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Admin Login</title>
  <style>
    body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#070a0f;color:#eef2ff}
    .bg{position:fixed;inset:0;pointer-events:none;filter:hue-rotate(0deg);animation:hue 10s ease-in-out infinite}
    @keyframes hue{0%{filter:hue-rotate(0deg)}50%{filter:hue-rotate(18deg)}100%{filter:hue-rotate(0deg)}}
    .blob{position:absolute;border-radius:999px;filter:blur(70px);opacity:.35}
    .b1{width:60rem;height:24rem;left:50%;top:-6rem;transform:translateX(-50%);background:#4f46e5}
    .b2{width:52rem;height:22rem;left:35%;top:10rem;transform:translateX(-50%);background:#0ea5e9}
    .b3{width:64rem;height:28rem;left:50%;bottom:-10rem;transform:translateX(-50%);background:#10b981}
    .wrap{position:relative;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{width:min(420px,92vw);background:rgba(3,7,18,.55);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:18px}
    .row{display:flex;gap:10px;align-items:center;justify-content:space-between}
    .btn{appearance:none;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#e5e7eb;border-radius:14px;padding:10px 14px;font-weight:600;cursor:pointer}
    .btn.primary{background:#fff;color:#0b1220;border-color:transparent}
    input{width:100%;padding:12px 12px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.22);color:#fff}
    .muted{color:rgba(255,255,255,.65);font-size:12px}
    .err{margin-top:10px;color:#fda4af;font-size:13px}
    a{color:inherit;text-decoration:none}
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
    <div class="card">
      <div class="row">
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
            <div style="font-size:14px;font-weight:800;letter-spacing:.08em">ONIU</div>
          </div>
          <div class="muted" style="margin-top:6px">Admin login</div>
        </div>
        <a class="btn" href="/">Back</a>
      </div>

      <form method="post" style="margin-top:14px">
        <input type="hidden" name="csrf" value="<?= htmlspecialchars($csrf) ?>" />
        <label class="muted">Password</label>
        <input type="password" name="password" placeholder="Password" autocomplete="current-password" />
        <div class="row" style="margin-top:12px">
          <div class="muted"></div>
          <button class="btn primary" type="submit">Login</button>
        </div>
        <?php if ($error): ?>
          <div class="err"><?= htmlspecialchars($error) ?></div>
        <?php endif; ?>
      </form>
    </div>
  </div>
</body>
</html>


