from lb_vorschau import *
R=json.load(open(OUT+'grenzen_klassifiziert.json'))['laeufe']
col={'hecke':(0,255,0),'mauer':(255,0,0),'zaun_vorschlag':(255,140,0)};wd={'hecke':5,'mauer':5,'zaun_vorschlag':2}
def render(e,n,name):
    im,r0,c0=base(e,n)
    for cl in('zaun_vorschlag','hecke','mauer'):
        for r in R:
            if r['klasse']==cl: draw_lines(im,r0,c0,[r['pts']],col[cl],wd[cl])
    im.save(PV+name)
for i,(e,n) in enumerate([(684270,5306390),(684400,5305450),(684700,5306000),(683800,5305100)]): render(e,n,f'grenzen_{i}.png')
