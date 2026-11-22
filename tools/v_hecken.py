from lb_vorschau import *
H_=json.load(open(OUT+'hecken.json'))['hecken'];P=json.load(open(OUT+'parzellen.json'))['linien']
for i,(e,n) in enumerate([(684400,5305450),(684700,5306000),(683800,5305100)]):
    im,r0,c0=base(e,n)
    draw_lines(im,r0,c0,P,(0,255,255),1)
    for h in H_:
        draw_lines(im,r0,c0,[h['pts']],(255,255,0) if h['an_grenze'] else (255,0,255),3)
    im.save(PV+f'hecken_{i}.png')
