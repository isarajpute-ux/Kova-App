"""Builds recipes.json (the extra recipes Fuel > Recipes loads when opened).

Each recipe is written as ingredients with gram weights; calories and
macros are computed from table.py (USDA values), per serving, so the
numbers always match what is on the list. Run:

    python3 src/recipes/build.py

It refuses to write if an ingredient is unknown or a recipe's numbers
fall outside the range its category should be in."""
import json, os, re, sys, hashlib
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from table import T

CATS = [('breakfast', 'Breakfast'), ('lunch', 'Lunch'), ('dinner', 'Dinner'), ('snack', 'Snack'),
        ('pre', 'Pre-workout'), ('post', 'Post-workout'), ('bed', 'Before bed')]
# per-serving kcal a recipe in each category should land in
RANGE = {'Breakfast': (220, 750), 'Lunch': (300, 850), 'Dinner': (330, 900), 'Snack': (80, 420),
         'Pre-workout': (90, 520), 'Post-workout': (250, 800), 'Before bed': (80, 420)}
PALETTE = [('#D9B98C', '#8C5A3C', '#E8D5B0'), ('#F0C860', '#5A7A4A', '#F5F0E5'), ('#C87848', '#7A9A5A', '#E8C88C'),
           ('#E08868', '#7A9A5A', '#D9A860'), ('#8C5A3C', '#5A7A4A', '#E8D5B0'), ('#E8C0C8', '#8C3C5A', '#F5E8EC'),
           ('#B8D0E0', '#3C5A8C', '#E8F0F5'), ('#E8D070', '#C87848', '#F5EDD5'), ('#9AB87A', '#4A6A3A', '#E0EAD0'),
           ('#D8A0A8', '#A04858', '#F0DDE0'), ('#C8A888', '#6A4A3A', '#EDE0D0'), ('#F0A860', '#B85A30', '#F8E0C8')]

def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')[:40]

def fmt(g):
    return str(int(g)) if float(g).is_integer() else str(g)

def build():
    out, seen, bad = [], set(), []
    for mod, meal in CATS:
        R = __import__(mod).R
        for r in R:
            name, time, srv, tag, ing, steps = r[:6]
            tools = r[6] if len(r) > 6 else []
            note = r[7] if len(r) > 7 else ''
            k = p = c = f = 0.0
            lines = []
            for it in ing:
                key, g = it[0], it[1]
                if key not in T:
                    bad.append(f'{meal} / {name}: unknown ingredient {key}')
                    continue
                v = T[key]
                k += v[0] * g / 100; p += v[1] * g / 100; c += v[2] * g / 100; f += v[3] * g / 100
                txt = it[2] if len(it) > 2 and it[2] else f"{fmt(g)} g {key.replace('_', ' ')}"
                # a line without an amount gets its weight, so every recipe can be followed
                if g > 3 and not re.search(r'\d', txt):
                    txt = f"{txt} ({fmt(g)} g)"
                lines.append(txt)
            kcal, P, C, F = round(k / srv), round(p / srv), round(c / srv), round(f / srv)
            lo, hi = RANGE[meal]
            if not (lo <= kcal <= hi):
                bad.append(f'{meal} / {name}: {kcal} kcal per serving is outside {lo}-{hi}')
            rid = 'x-' + slug(meal) + '-' + slug(name)
            if rid in seen:
                bad.append(f'duplicate recipe {rid}')
            seen.add(rid)
            pal = PALETTE[int(hashlib.md5(name.encode()).hexdigest(), 16) % len(PALETTE)]
            out.append({'id': rid, 'meal': meal, 'n': name, 't': time, 'srv': srv, 'kcal': kcal, 'p': P, 'c': C, 'f': F,
                        'colors': list(pal), 'tag': tag, 'ing': lines, 'tools': tools, 'steps': steps, 'note': note, 'src': 'usda'})
    return out, bad

if __name__ == '__main__':
    out, bad = build()
    if bad:
        print('\n'.join(bad)); sys.exit(1)
    by = {}
    for r in out: by[r['meal']] = by.get(r['meal'], 0) + 1
    dest = os.path.join(HERE, '..', '..', 'recipes.json')
    text = json.dumps({'v': 1, 'recipes': out}, separators=(',', ':'), ensure_ascii=False)
    if '--check' in sys.argv:
        same = os.path.exists(dest) and open(dest, encoding='utf-8').read() == text
        print('recipes.json is up to date' if same else 'recipes.json is stale: run python3 src/recipes/build.py')
        sys.exit(0 if same else 1)
    with open(dest, 'w', encoding='utf-8') as fh:
        fh.write(text)
    print(len(out), 'recipes', by, os.path.getsize(dest), 'bytes')
