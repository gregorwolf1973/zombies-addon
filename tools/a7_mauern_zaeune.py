from lb_skel import *
import time;t=time.time()
ndvi=np.array(load('ndvi')).astype(np.float32)/127.5-1;ndom=np.array(load('ndom'));haus=np.array(load('haus'))
tn=np.array(load('tn'));code=json.load(open(NPY+'tn_codes.json'))
veg=ndvi>0.06
# ---- Mauern
cand=(~veg)&(ndom>=0.8)&(ndom<=2.5)&~ndi.binary_dilation(haus,iterations=10)
cand&=~(tn==code['Straßenverkehr'])&~(tn==code['Platz'])&~(tn==code['Bahnverkehr'])
tallnear=ndi.binary_dilation(veg&(ndom>0.8),iterations=2)
cand&=~tallnear
cand=ndi.binary_opening(cand,structure=np.ones((2,2)))
edt=ndi.distance_transform_edt(cand)
core=edt>=4.0   # >0.8 m Halbbreite = zu breit
thick=ndi.distance_transform_edt(~core)<=4.0
thin=cand&~thick;thin=ndi.binary_opening(thin,structure=np.ones((2,2)))
edt2=ndi.distance_transform_edt(thin)
sk=prune(zs(thin),4)
out=[]
for pth in trace(sk):
    a=np.array(pth,float)
    if len(a)<2: continue
    pts=np.stack([c2e(a[:,1]),r2n(a[:,0])],1);L=float(np.hypot(*np.diff(pts,axis=0).T).sum())
    if L<4: continue
    ri=a[:,0].astype(int);ci=a[:,1].astype(int)
    wd=float(np.median(2*edt2[ri,ci]*RES));hh=ndom[ri,ci];s=dp(pts,0.3)
    chord=float(np.hypot(*(pts[-1]-pts[0])));gerade=chord/L
    if wd>1.4: continue
    hs=float(hh.std())
    # Zuverlaessigkeit
    sc=0
    sc+= 1 if gerade>0.8 else 0
    sc+= 1 if hs<0.25 else 0
    sc+= 1 if L>=8 else 0
    sc+= 1 if 0.25<=wd<=1.0 else 0
    z='mittel' if sc>=4 else ('niedrig' if sc>=2 else 'sehr_niedrig')
    out.append({'pts':[[round(float(x),2),round(float(y),2)] for x,y in s],'laenge':round(L,1),'breite':round(wd,2),'hoehe':round(float(hh.mean()),2),'hoehe_std':round(hs,2),'zuverlaessigkeit':z})
json.dump({'info':'Mauer-/Wand-Kandidaten: nicht-Vegetation (NDVI<=0.06), nDOM 0.8-2.5 m, schmal (<=1.4 m), >=4 m lang, >=2 m von Hausumringen, nicht auf Strasse/Platz. Zuverlaessigkeit hoechstens mittel: Autos, Container, Gartenhaeuschen, Carports, Gebaeudekanten koennen enthalten sein; Zaeune im DOM kaum sichtbar.','mauern':out},open(OUT+'mauern_kandidaten.json','w'),separators=(',',':'))
import collections;print('mauern',len(out),collections.Counter(o['zuverlaessigkeit'] for o in out),'Laenge m',round(sum(o['laenge'] for o in out)),round(time.time()-t),flush=True)
# ---- Zaun-Vorschlag aus Flurstuecksgrenzen
P=json.load(open(OUT+'parzellen.json'))['linien']
hm=np.array(load('hecke_mask'));hmd=ndi.binary_dilation(hm,iterations=5)
hd=ndi.binary_dilation(haus,iterations=5)
vb=ndi.binary_dilation(veg&(ndom>=0.8),iterations=3)
M=[o['pts'] for o in out]
mk=np.zeros((H,W),bool)
from PIL import ImageDraw as ID
im=Image.new('L',(W,H),0);dr=ID.Draw(im)
for m in M: dr.line(list(zip(e2c(np.array(m)[:,0]),n2r(np.array(m)[:,1]))),fill=255,width=6)
mk=np.array(im)>0
WO=np.isin(tn,[code['Wohnbaufläche'],code['Fläche gemischter Nutzung']])
STR=np.isin(tn,[code['Straßenverkehr'],code['Weg'],code['Platz']])
def at(arr,p): 
    c=np.floor(e2c(p[:,0])).astype(int);r=np.floor(n2r(p[:,1])).astype(int);ok=(c>=0)&(c<W)&(r>=0)&(r<H);v=np.zeros(len(p),arr.dtype);v[ok]=arr[r[ok],c[ok]];return v
segs=[]
for l in P:
    l=np.array(l)
    d=np.hypot(*np.diff(l,axis=0).T);s=np.r_[0,np.cumsum(d)]
    if s[-1]<3: continue
    ss=np.arange(0,s[-1],0.5);x=np.interp(ss,s,l[:,0]);y=np.interp(ss,s,l[:,1]);p=np.stack([x,y],1)
    tg=np.gradient(p,axis=0);nn=np.hypot(*tg.T);nn[nn==0]=1;tg/=nn[:,None];nr=np.stack([-tg[:,1],tg[:,0]],1)
    A=p+nr*1.2;Bp=p-nr*1.2
    wa,wb=at(WO,A),at(WO,Bp);sa,sb=at(STR,A),at(STR,Bp)
    wohn=wa|wb
    typ=np.where(sa|sb,1,2)   # 1 Strasse, 2 Nachbar
    blocked=at(hmd,p)|at(hd,p)|at(vb,p)|at(mk,p)
    okp=wohn&~blocked&~(wa&wb&False)
    # Strassenseite: Wohn auf einer Seite UND Strasse auf der anderen ODER Wohn beide Seiten (Nachbar)
    okp&=((wa|wb)&(sa|sb))|(wa&wb)
    i=0;n=len(p)
    while i<n:
        if not okp[i]: i+=1;continue
        j=i
        while j+1<n and okp[j+1]: j+=1
        seg=p[i:j+1]
        if (j-i)*0.5>=2.0:
            segs.append({'pts':[[round(float(a),2),round(float(b),2)] for a,b in dp(seg,0.2)],'laenge':round((j-i)*0.5,1),'art':'zur_strasse' if typ[i:j+1].mean()<1.5 else 'zum_nachbarn'})
        i=j+1
json.dump({'info':'Zaun-Vorschlaege: Flurstuecksgrenzen (Parzellarkarte) zwischen TN Wohnbauflaeche/gemischte Nutzung und Strasse bzw. Nachbar-Wohngrundstueck; ohne Stellen mit Hecke, Gebaeude (<1 m), Gehoelz >0.8 m (<0.6 m) oder Mauer-Kandidat. Reine Vorschlaege, nicht im DOM belegt.','zaeune':segs},open(OUT+'zaun_vorschlag.json','w'),separators=(',',':'))
print('zaeune',len(segs),collections.Counter(s['art'] for s in segs),'Laenge m',round(sum(s['laenge'] for s in segs)),round(time.time()-t))
