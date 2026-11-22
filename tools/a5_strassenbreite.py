from lb_dlm import *
from scipy import ndimage as ndi
import time;t=time.time()
rgb=load('rgb');ndvi=load('ndvi');ndom=load('ndom')
tn=np.array(load('tn'));code=json.load(open(NPY+'tn_codes.json'))
sv=(tn==code['Straßenverkehr'])|(tn==code['Platz'])
# Strassen-Pixel Maske
mx=rgb[...,:].max(-1).astype(np.int16);mn=rgb[...,:].min(-1).astype(np.int16)
near_tn=ndi.binary_dilation(sv|(tn==code['Weg']),iterations=10)
road=(ndvi[:]<130)&(np.abs(ndom[:])<0.6)&((mx-mn)<35)&near_tn   # ndvi<0.06
road=ndi.binary_closing(road,structure=np.ones((3,3)))  # kleine Luecken
np.save(NPY+'asphalt.npy',road)
print('mask',round(time.time()-t),flush=True)
gray=np.array(rgb.mean(-1),np.uint8) if False else (rgb[...,:].astype(np.uint16).sum(-1)//3).astype(np.uint8)
def sample(m,E,N):
    c=np.floor(e2c(E)).astype(int);r=np.floor(n2r(N)).astype(int)
    ok=(c>=0)&(c<W)&(r>=0)&(r<H)
    v=np.zeros(E.shape,bool);v[ok]=m[r[ok],c[ok]];return v
def resample(pts,step):
    d=np.hypot(*np.diff(pts,axis=0).T);s=np.r_[0,np.cumsum(d)];L=s[-1]
    if L<1: return np.zeros((0,2)),np.zeros((0,2))
    ss=np.arange(step/2,L,step) if L>step else np.array([L/2])
    x=np.interp(ss,s,pts[:,0]);y=np.interp(ss,s,pts[:,1])
    tx=np.interp(ss+0.5,s,pts[:,0])-np.interp(ss-0.5,s,pts[:,0]);ty=np.interp(ss+0.5,s,pts[:,1])-np.interp(ss-0.5,s,pts[:,1])
    nn=np.hypot(tx,ty);nn[nn==0]=1
    return np.stack([x,y],1),np.stack([tx/nn,ty/nn],1)
offs=np.arange(-10,10.01,0.2);ci=len(offs)//2
def width_at(p,tg):
    nx,ny=-tg[1],tg[0]
    E=p[0]+nx*offs;N=p[1]+ny*offs
    rd=sample(road,E,N);sv_=sample(sv,E,N)
    cc=np.clip(np.floor(e2c(E)).astype(int),0,W-1);rr=np.clip(np.floor(n2r(N)).astype(int),0,H-1)
    lum=gray[rr,cc].astype(np.int16)
    ref=np.median(lum[ci-5:ci+6][rd[ci-5:ci+6]]) if rd[ci-5:ci+6].any() else None
    if ref is not None: rd=rd&(np.abs(lum-ref)<=28)
    # Luecken <=0.8 m ueberbruecken
    gap=4
    f=ndi.binary_closing(np.pad(rd,gap),structure=np.ones(gap+1))[gap:-gap]
    # Mitte suchen: naechstes True innerhalb +-2 m
    c=None
    for d in range(0,11):
        for s in ([0] if d==0 else [-d,d]):
            if f[ci+s]: c=ci+s;break
        if c is not None: break
    if c is None: return None
    l=c
    while l>0 and f[l-1]: l-=1
    r=c
    while r<len(f)-1 and f[r+1]: r+=1
    if l==0 or r==len(f)-1: return None   # laeuft aus dem Fenster -> Platz o.ae.
    # TN-Strassenflaeche Breite
    return (r-l+1)*0.2, f[l:r+1].mean(), int(sv_[l:r+1].mean()>0.5)
res=[]
for typ in ['AX_Strassenachse','AX_Fahrbahnachse','AX_Fahrwegachse','AX_WegPfadSteig']:
    for gid,v,a in read_gml(typ):
        P,T=resample(v,10.0)
        ws=[]
        for p,tg in zip(P,T):
            w=width_at(p,tg)
            if w and w[1]>0.8: ws.append(w[0])
        br=a.get('breiteDerFahrbahn') or a.get('breiteDesVerkehrsweges')
        e={'id':gid,'typ':typ,'bekannt_m':float(br) if br else None,'n_quer':len(P),'n_ok':len(ws)}
        if ws:
            ws=np.array(ws);e.update(median=round(float(np.median(ws)),1),std=round(float(ws.std()),2),p10=round(float(np.percentile(ws,10)),1),p90=round(float(np.percentile(ws,90)),1))
        else: e.update(median=None,std=None)
        e['bedeutung']=a.get('besondereVerkehrsbedeutung')
        e['pts']=[[round(float(x),1),round(float(y),1)] for x,y in dp(v,0.5)]
        res.append(e)
json.dump({'info':'Fahrbahnbreite aus DOP20-Querschnitten alle 10 m (grau/NDVI niedrig/nDOM~0, Luecken<=0.8 m ueberbrueckt), m. Asphalt-/Pflasterflaechen gleicher Farbe (Gehweg, Parkstreifen) koennen die Breite zu gross machen; bekannt_m = Basis-DLM-Wert falls vorhanden.','achsen':res},open(OUT+'strassenbreite.json','w'),separators=(',',':'))
k=[e for e in res if e['median'] is not None];kb=[e for e in k if e['bekannt_m']]
print(len(res),'mit Schaetzung',len(k),'ohne',len(res)-len(k))
d=np.array([e['median']-e['bekannt_m'] for e in kb]);print('Vergleich mit bekannt (n=%d): Differenz med %.2f MAE %.2f'%(len(kb),np.median(d),np.abs(d).mean()))
for e in kb[:15]:print(e['typ'][3:12],e['bekannt_m'],e['median'],e['std'])
print(round(time.time()-t))
