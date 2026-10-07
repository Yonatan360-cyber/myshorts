"""MyShorts server - serves the site + pulls directly from YouTube (no dead middlemen)."""
import json, re, time, threading, urllib.request, urllib.parse, http.client
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from concurrent.futures import ThreadPoolExecutor
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get('PORT', 8099))
HOST = os.environ.get('HOST', '127.0.0.1')

UA = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
}

search_cache = {}
meta_cache = {}
video_cache = {}
short_cache = {}
lock = threading.Lock()


def yt_get(url, timeout=20):
    req = urllib.request.Request(url, headers=UA)
    return urllib.request.urlopen(req, timeout=timeout).read().decode('utf-8', errors='ignore')


def extract_ids(html, exclude=None):
    shorts = list(dict.fromkeys(re.findall(r'/shorts/([A-Za-z0-9_-]{11})', html)))
    others = [v for v in dict.fromkeys(re.findall(r'"videoId":"([A-Za-z0-9_-]{11})"', html)) if v not in shorts]
    ids = shorts + others
    if exclude:
        ids = [v for v in ids if v != exclude]
    return ids


def shorts_ids(html, exclude=None):
    """Only real Shorts - videos YouTube itself serves via /shorts/ URLs."""
    ids = list(dict.fromkeys(re.findall(r'/shorts/([A-Za-z0-9_-]{11})', html)))
    if exclude:
        ids = [v for v in ids if v != exclude]
    return ids


def is_short(vid):
    """Verify a single video is a real Short: /shorts/ID stays, regular videos redirect to /watch."""
    with lock:
        if vid in short_cache:
            return short_cache[vid]
    res = True
    try:
        c = http.client.HTTPSConnection('www.youtube.com', timeout=12)
        c.request('GET', '/shorts/' + vid, headers=UA)
        r = c.getresponse()
        loc = r.getheader('Location') or ''
        if r.status in (301, 302, 303, 307) and loc:
            final = loc if loc.startswith('http') else 'https://www.youtube.com' + loc
        else:
            final = 'https://www.youtube.com/shorts/' + vid
        c.close()
        if 'consent' in final:
            res = True
        else:
            res = ('/shorts/' in final) and ('watch' not in final)
    except Exception:
        res = True
    with lock:
        short_cache[vid] = res
    return res


def verify_many(ids):
    ids = list(dict.fromkeys(ids))[:30]
    with ThreadPoolExecutor(max_workers=10) as ex:
        flags = list(ex.map(is_short, ids))
    return [v for v, f in zip(ids, flags) if f]


def meta(vid):
    with lock:
        if vid in meta_cache:
            return meta_cache[vid]
    try:
        raw = yt_get('https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=' + vid + '&format=json', timeout=12)
        d = json.loads(raw)
        m = {'title': d.get('title') or ('Short ' + vid),
             'channel': '@' + re.sub(r'\s+', '', d.get('author_name') or 'youtube')}
    except Exception:
        m = {'title': 'Short ' + vid, 'channel': '@youtube'}
    with lock:
        meta_cache[vid] = m
    return m


def enrich(ids, limit=30):
    ids = ids[:limit]
    with ThreadPoolExecutor(max_workers=8) as ex:
        metas = list(ex.map(meta, ids))
    out = []
    for v, m in zip(ids, metas):
        out.append({'id': v, 'title': m['title'], 'channel': m['channel'], 'source': 'yt', 'fresh': True})
    return out


def video_details(vid):
    """Real per-video data scraped from the watch page: exact views, channel avatar, channel id."""
    with lock:
        if vid in video_cache:
            return video_cache[vid]
    d = {'id': vid, 'views': None, 'avatar': None, 'channelId': None, 'date': None, 'isShort': None}
    try:
        html = yt_get('https://www.youtube.com/watch?v=' + vid + '&hl=he&gl=IL')
        m = re.search(r'"viewCount":"(\d+)"', html)
        if m:
            d['views'] = int(m.group(1))
        m = re.search(r'"channelId":"(UC[A-Za-z0-9_-]{22})"', html)
        if m:
            d['channelId'] = m.group(1)
        m = re.search(r'"videoOwnerRenderer":\{"thumbnail":\{"thumbnails":\[{"url":"([^"]+)"', html)
        if m:
            d['avatar'] = m.group(1)
        m = re.search(r'"uploadDate":"([^"]+)"', html)
        if m:
            d['date'] = m.group(1)[:10]
    except Exception:
        pass
    with lock:
        video_cache[vid] = d
    d['isShort'] = is_short(vid)
    with lock:
        video_cache[vid] = d
    return d


class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, *a):
        pass

    def send_json(self, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        p = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(p.query)
        if p.path == '/api/trending':
            return self.serve_search('#shorts')
        if p.path == '/api/search':
            return self.serve_search(q.get('q', ['#shorts'])[0][:80])
        if p.path == '/api/related':
            vid = q.get('id', [''])[0]
            if not re.fullmatch(r'[A-Za-z0-9_-]{11}', vid or ''):
                return self.send_json([])
            try:
                html = yt_get('https://www.youtube.com/shorts/' + vid + '?hl=he&gl=IL')
                ids = shorts_ids(html, exclude=vid)
                if len(ids) < 8:
                    html2 = yt_get('https://www.youtube.com/watch?v=' + vid + '&hl=he&gl=IL')
                    extra = [v for v in extract_ids(html2, exclude=vid) if v not in ids]
                    ids += verify_many(extra)[:20]
                return self.send_json(enrich(ids[:30]))
            except Exception:
                return self.send_json([])
        if p.path == '/api/verify':
            raw = q.get('ids', [''])[0]
            ids = [v for v in raw.split(',') if re.fullmatch(r'[A-Za-z0-9_-]{11}', v)][:30]
            with ThreadPoolExecutor(max_workers=10) as ex:
                flags = list(ex.map(is_short, ids))
            return self.send_json({v: f for v, f in zip(ids, flags)})
        if p.path == '/api/video':
            vid = q.get('id', [''])[0]
            if not re.fullmatch(r'[A-Za-z0-9_-]{11}', vid or ''):
                return self.send_json({})
            return self.send_json(video_details(vid))
        return super().do_GET()

    def serve_search(self, query):
        now = time.time()
        with lock:
            hit = search_cache.get(query)
            if hit and now - hit[0] < 600:
                return self.send_json(hit[1])
        try:
            url = 'https://www.youtube.com/results?search_query=' + urllib.parse.quote(query) + '&hl=he&gl=IL'
            items = enrich(shorts_ids(yt_get(url)))
            with lock:
                search_cache[query] = (now, items)
            return self.send_json(items)
        except Exception:
            return self.send_json([])


if __name__ == '__main__':
    print('MyShorts on %s:%d' % (HOST, PORT), flush=True)
    ThreadingHTTPServer((HOST, PORT), H).serve_forever()
