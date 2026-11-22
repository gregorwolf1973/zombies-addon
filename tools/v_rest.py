from lb_vorschau import *
Z=json.load(open(OUT+'zaun_vorschlag.json'))['zaeune'];Mau=json.load(open(OUT+'mauern_kandidaten.json'))['mauern']
Ba=json.load(open(OUT+'baeume.json'))['baeume'];S=json.load(open(OUT+'strassenbreite.json'))['achsen'];HK=json.load(open(OUT+'hecken.json'))['hecken']
def circ(im,r0,c0,e,n,sz):
    d=ImageDraw.Draw(im)
    for x,y,h,D in Ba:
        if e<=x<=e+sz and n<=y<=n+sz:
            cx=e2c(x)-c0;cy=n2r(y)-r0;rr=D/2/RES;d.ellipse([cx-rr,cy-rr,cx+rr,cy+rr],outline=(255,255,0),width=2)
e,n=684270,5306390
im,r0,c0=base(e,n);draw_lines(im,r0,c0,[z['pts'] for z in Z if z['art']=='zur_strasse'],(255,128,0),2);draw_lines(im,r0,c0,[z['pts'] for z in Z if z['art']!='zur_strasse'],(0,255,255),2)
draw_lines(im,r0,c0,[m['pts'] for m in Mau],(255,0,0),4);draw_lines(im,r0,c0,[h['pts'] for h in HK],(255,0,255),3);im.save(PV+'zaun_mauer.png')
e,n=684200,5305400
im,r0,c0=base(e,n);circ(im,r0,c0,e,n,150);im.save(PV+'baeume_a.png')
e,n=684700,5306000
im,r0,c0=base(e,n);circ(im,r0,c0,e,n,150);im.save(PV+'baeume_b.png')
e,n=684400,5305450
im,r0,c0=base(e,n)
d=ImageDraw.Draw(im)
for a in S:
    if a['median'] is None: continue
    l=np.array(a['pts']);pts=list(zip(e2c(l[:,0])-c0,n2r(l[:,1])-r0))
    d.line(pts,fill=(255,0,0),width=max(1,int(a['median']/RES)))
im.save(PV+'strassenbreite.png')
