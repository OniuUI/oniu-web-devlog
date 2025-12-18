(function () {
  var cidKey = 'oniu.chat.cid'
  var cid = localStorage.getItem(cidKey) || ''
  var payload = {
    event: 'page_view',
    path: location.pathname + location.search + location.hash,
    ref: document.referrer || '',
    tz: (Intl && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : '') || '',
    lang: (navigator.language || '') + '',
    cid: cid,
    chat: false,
  }
  fetch('/api/track.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(function () {})
})()


