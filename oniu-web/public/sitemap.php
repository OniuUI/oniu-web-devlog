<?php
declare(strict_types=1);

header('Content-Type: application/xml; charset=utf-8');
header('Cache-Control: no-store');

$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'] ?? '';
$base = $host !== '' ? ($scheme . '://' . $host) : '';

$pages = [
  ['loc' => '/', 'changefreq' => 'weekly', 'priority' => '1.0'],
  ['loc' => '/services', 'changefreq' => 'monthly', 'priority' => '0.8'],
];

echo "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n";
echo "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n";
foreach ($pages as $p) {
  $loc = $base . $p['loc'];
  $lastmod = date('Y-m-d');
  echo "  <url>\n";
  echo "    <loc>" . htmlspecialchars($loc, ENT_QUOTES) . "</loc>\n";
  echo "    <lastmod>" . $lastmod . "</lastmod>\n";
  echo "    <changefreq>" . $p['changefreq'] . "</changefreq>\n";
  echo "    <priority>" . $p['priority'] . "</priority>\n";
  echo "  </url>\n";
}
echo "</urlset>\n";


