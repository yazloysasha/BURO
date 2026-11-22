#!/usr/bin/env python3
"""Collects ~1000 real cat sounds (meows, kitten mews, trills, purrs, hisses) from Freesound.

Only CC0 and CC BY (3.0/4.0) sounds are taken — no NonCommercial, no Sampling+.
Long recordings are split on silence into separate vocalisations, everything is
normalised, trimmed, converted to small mono mp3 and written to assets/cats/ with an
index (assets/cats/index.json) and an attribution list (assets/cats/CREDITS.md).

Usage:
    FREESOUND_API_KEY=xxxx python3 tools/prep/fetch_cat_sfx.py [--target 1000] [--work /tmp/cats]
    python3 tools/prep/fetch_cat_sfx.py --web    # no key: reads the public search pages, slowly and politely
(free API key: https://freesound.org/apiv2/apply)
Then: npm run build   (regenerates the precache manifest)

Requires ffmpeg in PATH. Re-running is safe: downloads are cached in --work.
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets' / 'cats'
API = 'https://freesound.org/apiv2/'

# group -> (queries,  [specific groups first: a sound found by several queries goes to the first]
#           max source duration, clip min/max length, clips per source, share of target)
GROUPS = {
    'kitten': (['kitten', 'kitten meow', 'kitten mew', 'kitten crying'], 40, (0.15, 2.0), 5, 0.14),
    'trill': (['cat trill', 'cat chirp', 'cat chirrup', 'cat chatter', 'cat chattering', 'cat brrr'], 40, (0.15, 2.2), 5, 0.05),
    'purr': (['purr', 'cat purr', 'cat purring', 'purring'], 300, (1.5, 3.2), 3, 0.18),
    'hiss': (['cat hiss', 'cat hissing', 'cat growl', 'angry cat', 'cat fight', 'cat yowl', 'cat scream'], 60, (0.25, 2.4), 4, 0.14),
    'meow': (['meow', 'cat meow', 'cat meowing', 'miaow', 'cat mew', 'cat calling', 'cat vocalization'], 40, (0.25, 2.6), 5, 0.49),
}

# sounds made by people, toys, synths or other animals
BAD_WORDS = re.compile(
    r'\b(human|voice|vocal|imitat\w*|impression|mouth|man|woman|girl|boy|child|kid|baby|toy|synth\w*|'
    r'music|song|beat|dog|bark|bird|engine|motor|car|cartoon|game|8bit|chiptune|robot|lion|tiger|'
    r'cougar|leopard|panther|cheetah|meme|remix|speech|talk\w*|says?|singing|sing|whistl\w*)\b',
    re.I,
)
BAD_PURR = re.compile(r'\b(engine|motor|car|vehicle|machine|fan|generator)\b', re.I)
MAX_PER_USER = 70  # keep many different cats and microphones


def api(path, key, **params):
    params['token'] = key
    url = API + path + '?' + urllib.parse.urlencode(params)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'buro-sfx-prep'}), timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise
            if e.code == 429:
                time.sleep(10 * (attempt + 1))
                continue
            if attempt == 4:
                raise
        except Exception:
            if attempt == 4:
                raise
        time.sleep(2 * (attempt + 1))


def license_ok(lic):
    lic = lic.lower()
    if 'publicdomain/zero' in lic:
        return 'CC0'
    m = re.search(r'/licenses/by/(\d\.\d)', lic)
    if m:
        return 'CC BY ' + m.group(1)
    return None


def search(key, group, queries, max_dur):
    found = {}
    fields = 'id,name,username,license,duration,tags,description,previews,num_downloads,avg_rating,url'
    endpoint = 'search/text/'
    for q in queries:
        for page in range(1, 11):
            params = dict(query=q, filter=f'duration:[0.15 TO {max_dur}]', fields=fields, page_size=150, page=page, sort='score')
            try:
                d = api(endpoint, key, **params)
            except urllib.error.HTTPError as e:
                if e.code == 404 and endpoint == 'search/text/':  # newer API versions renamed the endpoint
                    endpoint = 'search/'
                    d = api(endpoint, key, **params)
                elif e.code == 404:
                    break
                else:
                    raise
            for s in d.get('results', []):
                lic = license_ok(s.get('license', ''))
                if not lic:
                    continue
                text = ' '.join([s.get('name', ''), ' '.join(s.get('tags', []))])
                if not re.search(r'cat|kitt|meow|miaow|mew|purr|hiss|feline|chat|gato|katze|кот|кош', text, re.I):
                    continue
                if BAD_WORDS.search(text) or (group == 'purr' and BAD_PURR.search(text)):
                    continue
                s['lic'] = lic
                found[s['id']] = s
            print(f'  {group}: "{q}" p{page} -> {len(found)}', file=sys.stderr)
            if not d.get('next'):
                break
    return found


WEB_LICENSES = {'Creative Commons 0': 'CC0', 'Attribution': 'CC BY'}
HUMAN_DESC = re.compile(r'\b(me meowing|my voice|imitat\w*|impression of|human|by mouth|i meow)\b', re.I)


def unescape(t):
    import html
    return html.unescape(t)


def search_web(group, queries, max_dur, work, delay=1.5):
    """Same result shape as the API search, read from freesound.org/search pages (15 per page)."""
    found = {}
    cache_dir = work / 'pages'
    cache_dir.mkdir(parents=True, exist_ok=True)
    for q in queries:
        for lic_name, lic in WEB_LICENSES.items():
            for page in range(1, 41):
                f = f'duration:[0.15 TO {max_dur}] license:"{lic_name}"'
                url = 'https://freesound.org/search/?' + urllib.parse.urlencode({'q': q, 'f': f, 'page': page})
                cp = cache_dir / (re.sub(r'\W+', '_', f'{q}_{lic}_{max_dur}_{page}') + '.html')
                if cp.exists():
                    html = cp.read_text()
                else:
                    html = None
                    for attempt in range(4):
                        try:
                            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (buro-sfx-prep)'})
                            with urllib.request.urlopen(req, timeout=40) as r:
                                html = r.read().decode('utf-8', 'replace')
                            break
                        except urllib.error.HTTPError as e:
                            if e.code == 404:
                                break
                            time.sleep(15 * (attempt + 1) if e.code == 429 else 3)
                        except Exception:
                            time.sleep(3 * (attempt + 1))
                    if html is None:
                        break
                    cp.write_text(html)
                    time.sleep(delay)
                blocks = re.split(r'class="bw-player"\s+data-sound-id="', html)[1:]
                for b in blocks:
                    def attr(name):
                        m = re.search(r'data-' + name + r'="([^"]*)"', b)
                        return unescape(m.group(1)) if m else ''
                    sid = int(b[: b.index('"')])
                    title_lic = re.search(r'title="License:\s*([^"]+?)\s*"', b)
                    if not title_lic or title_lic.group(1) not in WEB_LICENSES:
                        continue
                    desc = re.search(r'overflow-hidden v-spacing-1"\s+title="([^"]*)"', b)
                    desc = unescape(desc.group(1)) if desc else ''
                    tags = re.findall(r'/browse/tags/([^/"]+)/', b)
                    name, user = attr('title'), attr('username')
                    text = name + ' ' + ' '.join(tags)
                    if not re.search(r'cat|kitt|meow|miaow|mew|purr|hiss|feline|chat|gato|katze', text, re.I):
                        continue
                    if BAD_WORDS.search(text) or HUMAN_DESC.search(desc) or (group == 'purr' and BAD_PURR.search(text + ' ' + desc)):
                        continue
                    found[sid] = {
                        'id': sid, 'name': name, 'username': user, 'lic': WEB_LICENSES[title_lic.group(1)],
                        'duration': float(attr('duration') or 0), 'num_downloads': int(attr('num-downloads') or 0),
                        'avg_rating': 0, 'url': f'https://freesound.org/people/{user}/sounds/{sid}/',
                        'previews': {'preview-hq-mp3': attr('mp3').replace('-lq.mp3', '-hq.mp3'), 'preview-lq-mp3': attr('mp3')},
                    }
                print(f'  {group}: "{q}" {lic} p{page} -> {len(found)}', file=sys.stderr)
                if len(blocks) < 15 or f'page={page + 1}' not in html:
                    break
    return found


def resolve_by_version(s, work):
    """Search pages only say "Attribution": read the sound page once for 3.0 vs 4.0."""
    cp = work / 'pages' / f"sound_{s['id']}.html"
    if not cp.exists():
        try:
            req = urllib.request.Request(s['url'], headers={'User-Agent': 'Mozilla/5.0 (buro-sfx-prep)'})
            with urllib.request.urlopen(req, timeout=40) as r:
                cp.write_text(r.read().decode('utf-8', 'replace'))
            time.sleep(1.0)
        except Exception:
            return s['lic']
    m = re.search(r'creativecommons\.org/licenses/by/(\d\.\d)', cp.read_text())
    return 'CC BY ' + m.group(1) if m else s['lic']


def download(s, work):
    p = work / 'raw' / f"{s['id']}.mp3"
    if p.exists() and p.stat().st_size > 0:
        return p
    url = s['previews'].get('preview-hq-mp3') or s['previews'].get('preview-lq-mp3')
    p.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'buro-sfx-prep'}), timeout=60) as r:
                p.write_bytes(r.read())
            return p
        except Exception:
            time.sleep(2 * (attempt + 1))
    return None


def ff(*args):
    return subprocess.run(['ffmpeg', '-hide_banner', '-nostats', *args], capture_output=True, text=True)


def segments(src, dur, lo, hi, group):
    """Non-silent stretches of a recording, each lo..hi seconds long."""
    if group == 'purr':
        # purrs are continuous: take evenly spaced chunks away from the edges
        n = max(1, min(6, int((dur - 0.6) // hi)))  # spare chunks: render() rejects the impure ones
        if dur < lo:
            return []
        if n == 1:
            start = max(0.0, (dur - hi) / 2)
            return [(start, min(hi, dur))]
        step = (dur - 0.6 - hi) / (n - 1)
        return [(0.3 + i * step, hi) for i in range(n)]
    r = ff('-i', str(src), '-af', 'highpass=f=120,silencedetect=noise=-38dB:d=0.12', '-f', 'null', '-')
    starts = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', r.stderr)]
    ends = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', r.stderr)]
    # sound = gaps between silences
    edges = [0.0] + ends
    stops = starts + [dur]
    segs = []
    for a, b in zip(edges, stops):
        a, b = max(0.0, a - 0.04), min(dur, b + 0.08)
        if b - a < lo:
            continue
        if b - a > hi:
            if b - a > hi * 1.6:
                continue  # a long unbroken noise, likely not one vocalisation
            b = a + hi
        segs.append((a, b - a))
    return segs


def render(src, start, length, dst, group):
    fade_out = 0.35 if group == 'purr' else 0.06
    fade_in = 0.12 if group == 'purr' else 0.005
    base = f'atrim=start={start:.3f}:duration={length:.3f},asetpts=PTS-STARTPTS,highpass=f=70,lowpass=f=15000'
    r = ff('-i', str(src), '-af', base + ',volumedetect', '-f', 'null', '-')
    mean = re.search(r'mean_volume: (-?[\d.]+)', r.stderr)
    peak = re.search(r'max_volume: (-?[\d.]+)', r.stderr)
    if not mean or not peak:
        return None
    mean, peak = float(mean.group(1)), float(peak.group(1))
    if peak < -45 or mean < -60:
        return None  # basically silence
    if group == 'purr':
        # a purr is low and steady: reject chunks with a meow/noise on top (too much energy above ~1 kHz)
        # or with gaps (the cat stopped purring)
        r = ff('-i', str(src), '-af', base + ',highpass=f=900,highpass=f=900,volumedetect', '-f', 'null', '-')
        hi_band = re.search(r'mean_volume: (-?[\d.]+)', r.stderr)
        if not hi_band or float(hi_band.group(1)) - mean > -12:
            return None
        r = ff('-i', str(src), '-af', f'{base},silencedetect=noise={mean - 22:.1f}dB:d=0.25', '-f', 'null', '-')
        if 'silence_start' in r.stderr:
            return None
    target = -24.0 if group == 'purr' else -19.0
    gain = min(target - mean, -1.0 - peak)
    af = (f'{base},volume={gain:.2f}dB,afade=t=in:d={fade_in},'
          f'afade=t=out:st={max(0, length - fade_out):.3f}:d={fade_out}')
    r = ff('-y', '-i', str(src), '-af', af, '-ac', '1', '-ar', '32000', '-c:a', 'libmp3lame', '-b:a', '48k', str(dst))
    return round(length, 2) if r.returncode == 0 and dst.exists() else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--target', type=int, default=1000)
    ap.add_argument('--work', default=str(Path(os.environ.get('TMPDIR', '/tmp')) / 'buro-cats'))
    ap.add_argument('--web', action='store_true', help='no API key: read the public search pages')
    ap.add_argument('--core', type=int, default=10, help='clips per group precached for offline play')
    a = ap.parse_args()
    key = os.environ.get('FREESOUND_API_KEY')
    if not key and not a.web:
        sys.exit('Set FREESOUND_API_KEY (free: https://freesound.org/apiv2/apply)')
    if not shutil.which('ffmpeg'):
        sys.exit('ffmpeg not found')
    work = Path(a.work)
    work.mkdir(parents=True, exist_ok=True)

    # 1. search (cached so re-runs don't hammer the API)
    cache = work / 'search.json'
    if cache.exists():
        found = {g: {int(k): v for k, v in d.items()} for g, d in json.loads(cache.read_text()).items()}
    else:
        found, seen = {}, set()
        for g, (queries, max_dur, *_rest) in GROUPS.items():
            res = search_web(g, queries, max_dur, work) if a.web else search(key, g, queries, max_dur)
            found[g] = {i: s for i, s in res.items() if i not in seen}
            seen |= set(found[g])
        cache.write_text(json.dumps(found))

    # 2. pick sources per group: popular/rated first, capped per author
    plan = {}
    for g, (_q, _d, (lo, hi), per_src, share) in GROUPS.items():
        want = round(a.target * share)
        pool = sorted(found[g].values(), key=lambda s: (-(s.get('avg_rating') or 0) * min(s.get('num_downloads', 0), 200), -s.get('num_downloads', 0)))
        users, picked = {}, []
        for s in pool:
            if users.get(s['username'], 0) >= MAX_PER_USER // 2 and len(pool) > want:
                continue
            users[s['username']] = users.get(s['username'], 0) + 1
            picked.append(s)
        plan[g] = (picked, want, lo, hi, per_src)
        print(f'{g}: {len(found[g])} found, {len(picked)} candidate sources, want {want} clips', file=sys.stderr)

    # 3. download previews in parallel
    allsrc = {s['id']: s for picked, *_ in plan.values() for s in picked}
    with ThreadPoolExecutor(8) as ex:
        paths = dict(zip(allsrc, ex.map(lambda s: download(s, work), allsrc.values())))

    # 4. cut, normalise, encode
    index, credits = {'groups': {}, 'core': a.core}, {}
    for g, (picked, want, lo, hi, per_src) in plan.items():
        group_dir = OUT / g
        if group_dir.exists():
            shutil.rmtree(group_dir)
        group_dir.mkdir(parents=True)
        clips, n = [], 0
        for s in picked:
            if len(clips) >= want:
                break
            src = paths.get(s['id'])
            if not src:
                continue
            per = per_src if len(picked) * 1.5 < want else max(1, per_src // 2)
            took = 0
            for start, length in segments(src, float(s['duration']), lo, hi, g):
                if len(clips) >= want or took >= per:
                    break
                n += 1
                name = f'{g}/{n:04d}.mp3'
                d = render(src, start, length, OUT / name, g)
                if d:
                    took += 1
                    clips.append([name, d])
                    credits[s['id']] = s
            print(f'  {g}: {len(clips)}/{want}', end='\r', file=sys.stderr)
        print(f'  {g}: {len(clips)} clips', file=sys.stderr)
        index['groups'][g] = clips

    for s in credits.values():
        if s['lic'] == 'CC BY':
            s['lic'] = resolve_by_version(s, work)
    # shown on the in-game credits screen (CC BY requires title, author, licence, link)
    index['credits'] = [[s['name'], s['username'], s['lic'], s['url']] for s in sorted(credits.values(), key=lambda s: (s['username'].lower(), s['id']))]
    (OUT / 'index.json').write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')))
    lines = [
        '# Звуки кошек',
        '',
        'Собраны с [Freesound](https://freesound.org) скриптом `tools/prep/fetch_cat_sfx.py`: нарезаны, нормализованы, перекодированы в mp3.',
        'Только CC0 и CC BY — текст лицензий в `LICENSES/`.',
        '',
        '| Звук | Автор | Лицензия |',
        '|---|---|---|',
    ]
    for s in sorted(credits.values(), key=lambda s: (s['username'].lower(), s['id'])):
        name = s['name'].replace('|', '/')
        lines.append(f"| [{name}]({s['url']}) | {s['username']} | {s['lic']} |")
    (OUT / 'CREDITS.md').write_text('\n'.join(lines) + '\n')
    total = sum(len(v) for v in index['groups'].values())
    size = sum(f.stat().st_size for f in OUT.rglob('*.mp3'))
    print(f'done: {total} clips from {len(credits)} recordings, {size / 1e6:.1f} MB -> {OUT}', file=sys.stderr)
    if size > 13e6:
        print('WARNING: the repo has a 25 MB budget (tests/project.test.mjs); try --target 800', file=sys.stderr)


if __name__ == '__main__':
    main()
