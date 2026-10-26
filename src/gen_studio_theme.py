"""Derive soft-light and light-mode versions of the Work OS Studio styles.

The Studio stylesheets (p07_style.css, p08_folders.css, p08_traction.css)
were written dark-only with literal colours. Rather than hand-edit ~900
colour literals, this reads every rule, and for each declaration that holds
a neutral colour (grey, white or black, any alpha) emits the same rule
under body.soft-light / body.light-mode with the colour moved to that
appearance. Coloured accents (the red delete, platform colours) are left
alone. Output: p08_studiotheme.css, which the injector puts on the page.

Light:  dark grounds and surfaces -> pale, elevated surfaces whiter
        light text and white pills -> near-black
        white lines / glass tints   -> the same alpha in ink
        white glows                 -> a soft charcoal glow
        inset white highlights      -> kept white (they are highlights)
        black shadows               -> soft cool shadows
Soft:   dark grounds lifted to mid-greys; text and white glass unchanged.
Run:    python3 gen_studio_theme.py   (before inject_p07.py)
"""
import os, re

SP = os.path.dirname(os.path.abspath(__file__))
SRC = ['p07_style.css', 'p08_folders.css', 'p08_traction.css']
OUT = os.path.join(SP, 'p08_studiotheme.css')

COL = re.compile(r'#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+\s*)?\)')
SHADOW_PROPS = ('box-shadow', 'text-shadow', 'filter', '-webkit-filter')


def parse_color(t):
    if t.startswith('#'):
        h = t[1:]
        if len(h) == 3:
            h = ''.join(c * 2 for c in h)
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        a = int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
        return r, g, b, a
    n = [float(x) for x in re.findall(r'[\d.]+', t)]
    return int(n[0]), int(n[1]), int(n[2]), (n[3] if len(n) > 3 else 1.0)


def fmt(r, g, b, a):
    r, g, b = (max(0, min(255, int(round(v)))) for v in (r, g, b))
    if a >= 0.999:
        return 'rgb(%d,%d,%d)' % (r, g, b)
    return 'rgba(%d,%d,%d,%s)' % (r, g, b, ('%.3f' % a).rstrip('0').rstrip('.'))


def grey(L):
    v = L * 255
    return v, v, v


def to_light(c, ctx):
    r, g, b, a = c
    if max(r, g, b) - min(r, g, b) > 18:
        return None                                   # a real colour: keep
    L = (r + g + b) / 765
    if ctx == 'radial':
        return None if L > 0.6 else (40, 44, 54, a * 0.4)
    if ctx == 'text' and L < 0.4:
        return None                                   # dark text on a surface that stays light
    if a >= 0.98:
        if L < 0.4:
            return (*grey(min(1.0, 0.935 + (L - 0.04) * 0.6)), 1)
        if L > 0.6:
            return (*grey(0.07 + (1 - L) * 0.9), 1)
        return (*grey(1 - L), 1)
    if L > 0.6:
        if ctx == 'inset':
            return 255, 255, 255, min(0.9, a * 5)
        if ctx == 'glow':
            return 24, 26, 30, a * 0.35
        if ctx == 'fill' and a >= 0.85:               # a white pill: it turns charcoal
            return (*grey(0.07 + (1 - L) * 0.9), a)
        if ctx == 'fill' and a >= 0.3:                # white glass: stays white glass
            return 255, 255, 255, min(1.0, a + 0.2)
        return 18, 20, 24, a                          # lines, faint tints, light text: ink
    if L < 0.4 and ctx == 'text-flip':
        return (*grey(min(1.0, 0.935 + (L - 0.04) * 0.6)), a)
    if L < 0.3:
        if ctx in ('glow', 'inset', 'shadow'):
            return 40, 44, 54, a * 0.4
        return (*grey(min(1.0, 0.935 + (L - 0.04) * 0.6)), a)
    return (*grey(1 - L), a)


def to_soft(c, ctx):
    r, g, b, a = c
    if max(r, g, b) - min(r, g, b) > 18:
        return None
    L = (r + g + b) / 765
    if ctx in ('text', 'text-flip') and L < 0.4:
        return None                                   # dark text sits on a white pill
    if ctx == 'radial':
        return None
    if a >= 0.98:
        if L < 0.4:
            return (*grey(0.25 + L * 0.85), 1)
        return None
    if L > 0.6:
        if ctx in ('glow', 'inset'):
            return None
        return r, g, b, min(1.0, a * 1.25)
    if L < 0.3:
        if ctx in ('glow', 'inset', 'shadow'):
            return r, g, b, a * 0.7
        return (*grey(0.25 + L * 0.85), a)
    return None


def split_top(s, sep):
    """split on sep outside (), '' and \"\" """
    out, depth, q, cur = [], 0, None, ''
    for ch in s:
        if q:
            cur += ch
            if ch == q:
                q = None
            continue
        if ch in '\'"':
            q = ch
        elif ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        if ch == sep and depth == 0:
            out.append(cur)
            cur = ''
        else:
            cur += ch
    out.append(cur)
    return out


def flips_dark(decls):
    """does this rule paint a light, near-opaque background (which light mode turns dark)?"""
    for prop, val in decls:
        if not prop.startswith('background'):
            continue
        if 'var(--ks-white)' in val:
            return True
        for m in COL.finditer(val):
            r, g, b, a = parse_color(m.group(0))
            if (r + g + b) / 765 > 0.6 and a >= 0.85 and max(r, g, b) - min(r, g, b) <= 18:
                return True
    return False


def transform_value(prop, val, fn, flip=False):
    shadowy = prop in SHADOW_PROPS or (prop.startswith('--') and re.search(r'\d+px\s+\d+px|0 0 \d', val) and 'gradient' not in val)
    layered = not shadowy and 'radial-gradient' in val
    segs = split_top(val, ',') if (shadowy or layered) else [val]
    changed = False
    out = []
    for seg in segs:
        if 'url(' in seg:
            out.append(seg)
            continue
        if shadowy:
            if 'inset' in seg:
                ctx = 'inset'
            else:
                nums = re.findall(r'(-?[\d.]+)(?:px)?(?=[\s,)]|$)', COL.sub(' ', seg))
                ox, oy = (float(nums[0]), float(nums[1])) if len(nums) >= 2 else (0, 0)
                blur = float(nums[2]) if len(nums) >= 3 else 0
                ctx = 'glow' if (ox == 0 and oy == 0 and blur > 0) or 'drop-shadow' in seg else 'shadow'
        elif layered and seg.strip().startswith('radial-gradient'):
            ctx = 'radial'                            # a soft highlight painted into a surface
        elif prop in ('color', 'caret-color', '-webkit-text-fill-color'):
            ctx = 'text-flip' if flip else 'text'     # text follows its own background
        elif prop.endswith('-ink'):
            ctx = 'text-flip'                         # --ks-ink pairs with --ks-white
        elif prop.startswith('--') and re.search(r'-(t\d|txt|text|fg)$', prop):
            ctx = 'text'                              # text colour tokens (--ks-t1 ... --ks-t4)
        else:
            ctx = 'fill'

        def sub(mo):
            nonlocal changed
            c = fn(parse_color(mo.group(0)), ctx)
            if c is None:
                return mo.group(0)
            # a light glow that ends up the same as a fill is still a change
            changed = True
            return fmt(*c)
        out.append(COL.sub(sub, seg))
    return (','.join(out) if (shadowy or layered) else out[0]), changed


def strip_comments(css):
    return re.sub(r'/\*.*?\*/', '', css, flags=re.S)


def blocks(css):
    """yield (prelude, body) for top-level blocks; nested at-rules recurse"""
    i, n = 0, len(css)
    while i < n:
        j = css.find('{', i)
        if j < 0:
            return
        prelude = css[i:j].strip()
        depth, k = 1, j + 1
        while k < n and depth:
            if css[k] == '{':
                depth += 1
            elif css[k] == '}':
                depth -= 1
            k += 1
        yield prelude, css[j + 1:k - 1]
        i = k


def prefix(sel, cls):
    parts = []
    for s in split_top(sel, ','):
        s = s.strip()
        if not s:
            continue
        if s.startswith('body'):
            parts.append('body.' + cls + s[4:])
        elif s.startswith('html') or s.startswith(':root'):
            return None
        else:
            parts.append('body.' + cls + ' ' + s)
    return ','.join(parts)


def theme(css, cls, fn):
    out = []
    for pre, body in blocks(css):
        if pre.startswith('@keyframes') or pre.startswith('@-webkit-keyframes') or pre.startswith('@font-face'):
            continue
        if pre.startswith('@'):
            inner = theme(body, cls, fn)
            if inner.strip():
                out.append(pre + '{\n' + inner + '}\n')
            continue
        decls = []
        pairs = [(d.split(':', 1)[0].strip().lower(), d.split(':', 1)[1].strip()) for d in split_top(body, ';') if ':' in d]
        flip = flips_dark(pairs)
        for prop, val in pairs:
            if not COL.search(val):
                continue
            nv, ch = transform_value(prop, val, fn, flip)
            if ch:
                decls.append(prop + ':' + nv)
        if decls:
            sel = prefix(pre, cls)
            if sel:
                out.append(sel + '{' + ';'.join(decls) + '}\n')
    return ''.join(out)


MANUAL = '''/* ---- by hand: pieces a colour formula cannot judge ---- */
/* the active prompt tab: a lit white card in light, a lifted grey in soft */
body.light-mode .ks-dt.on{background:linear-gradient(128deg,#FFFFFF 0%,#F1F2F4 55%,#E2E4E8 100%);border-color:rgba(18,20,24,.1);
  box-shadow:0 10px 26px rgba(40,44,54,.14),0 -4px 14px rgba(40,44,54,.06)}
body.light-mode .ks-dt.on .b{color:rgba(18,20,24,.55)}
body.light-mode .ks-dt.done .a::after{background:#1B1D21;box-shadow:none}
body.soft-light .ks-dt.on{background:linear-gradient(128deg,#6A6A70 0%,#8C8C93 48%,#BDBDC4 100%)}
/* the composer front: white glass in light */
body.light-mode .ks-front{background:
    radial-gradient(46% 78% at 50% 78%,rgba(255,255,255,.9),rgba(255,255,255,.4) 55%,transparent 78%),
    linear-gradient(180deg,rgba(255,255,255,.94),rgba(246,247,249,.94));
  border-color:rgba(18,20,24,.08);box-shadow:0 24px 60px rgba(40,44,54,.16),inset 0 1px 0 #fff}
/* the paper inside the account folders stays paper */
body.light-mode .kfm-paper{background:linear-gradient(180deg,#FFFFFF,#F1F2F4);box-shadow:0 1px 4px rgba(40,44,54,.16)}
body.light-mode .kfm-paper i{background:rgba(18,20,24,.14)}
/* every appearance: the drawer starts after the app's 56px icon rail
   instead of sliding underneath it (below 1000px wide, where it is a drawer) */
@media (max-width:999.98px){#s-workstudio .ks-panel{left:56px;width:min(372px,calc(100vw - 64px))}}
/* the Studio sits on the app's own ground in soft light and light glass */
body.soft-light #s-workstudio{background:radial-gradient(ellipse 135% 100% at 50% -8%,#5C5E66 0%,#4C4E55 40%,#414248 74%,#3A3B40 100%)}
body.light-mode #s-workstudio{background:radial-gradient(ellipse 140% 105% at 50% -10%,#EAE8E4 0%,#DFDDD8 44%,#D4D2CD 100%)}
body.soft-light .ks-grid-bg,body.light-mode .ks-grid-bg{background-color:transparent}
/* the one Kova orb moves up beside the Studio's top buttons, off the composer */
body.ks-on .ko{top:calc(env(safe-area-inset-top,0px) + 132px);bottom:auto;right:36px}
'''


def main():
    src = ''
    for f in SRC:
        p = os.path.join(SP, f)
        if os.path.exists(p):
            src += '\n' + strip_comments(open(p, encoding='utf-8').read())
    head = ('/* GENERATED by gen_studio_theme.py from ' + ', '.join(SRC) + ' - do not edit by hand.\n'
            '   The Work OS Studio in soft light and light mode. */\n')
    soft = theme(src, 'soft-light', to_soft)
    light = theme(src, 'light-mode', to_light)
    open(OUT, 'w', encoding='utf-8').write(head + '/* ---- soft light ---- */\n' + soft + '/* ---- light ---- */\n' + light + MANUAL)
    print('wrote', OUT, len(soft), 'soft +', len(light), 'light bytes;',
          soft.count('{'), 'soft rules,', light.count('{'), 'light rules')


if __name__ == '__main__':
    main()
