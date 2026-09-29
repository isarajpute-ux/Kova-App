"""Put the Studio files (p07_logic.js + p07_ui.js, p07_style.css) and any
extra blocks into index.html, and make sure the screen hooks are wired."""
import sys, os
SP=os.path.dirname(os.path.abspath(__file__))
page=sys.argv[1]
h=open(page,encoding='utf-8').read()
def put(open_tag,close_tag,body):
    global h
    i=h.find(open_tag); assert i>=0, open_tag
    i+=len(open_tag); j=h.find(close_tag,i); assert j>=0
    h=h[:i]+body+h[j:]
lg=open(SP+'/p07_logic.js').read(); ui=open(SP+'/p07_ui.js').read(); css=open(SP+'/p07_style.css').read()
for name,t in [('logic',lg),('ui',ui)]:
    assert '</script' not in t.lower(), name
assert '</style' not in css.lower()
put('<script id="p07-studio-js">','</script>','\n'+lg+'\n'+ui+'\n')
put('<style id="p07-studio">','</style>','\n'+css+'\n')
hook="  if(window.KovaWorkTour) try{ KovaWorkTour.onScreen(id); }catch(e){}\n"
add ="  if(window.KovaScreenTour) try{ KovaScreenTour.onScreen(id); }catch(e){}\n"
if add not in h:
    assert h.count(hook)==1; h=h.replace(hook,hook+add)
# the server's wellness rules, shared with the page (the agent pop-up runs them on-device)
FN=os.path.join(os.path.dirname(os.path.abspath(page)),'functions','wellness.js')
if os.path.exists(FN):
    code=open(FN).read(); assert '</script' not in code.lower()
    o,c='<script id="p08-wellness">','</script>'
    if o not in h: h=h.replace('</body>',o+'\n'+c+'\n</body>',1)
    put(o,c,'\n(function(){\nvar module={exports:{}};\n'+code+'\nwindow.KovaWellness=module.exports;\n})();\n')
# optional extra blocks: p08_*.js / p08_*.css become their own tags before </body>
for fn in sorted(os.listdir(SP)):
    if not fn.startswith('p08_'): continue
    body=open(os.path.join(SP,fn)).read(); key=fn.rsplit('.',1)[0].replace('_','-')
    if fn.endswith('.js'):
        o,c='<script id="%s">'%key,'</script>'
        if o not in h: h=h.replace('</body>',o+'\n'+c+'\n</body>',1)
        put(o,c,'\n'+body+'\n')
    elif fn.endswith('.css'):
        o,c='<style id="%s">'%key,'</style>'
        if o not in h: h=h.replace('</head>',o+'\n'+c+'\n</head>',1)
        put(o,c,'\n'+body+'\n')
open(page,'w',encoding='utf-8').write(h)
print('injected', len(h))
