from lb_common import *
from scipy import ndimage as ndi
import time;t=time.time()
par=np.array(load('par_schwarz'));haus=np.array(load('haus'))
# Gebaeudekontur (Haus-Rand +-0.6 m) entfernen
hd=ndi.binary_dilation(haus,iterations=3)
pm=par&~hd
pm=ndi.binary_closing(pm,structure=np.ones((3,3)))
lab,n=ndi.label(pm,structure=np.ones((3,3)))
sz=np.bincount(lab.ravel());keep=sz>=70;keep[0]=False
pm=keep[lab];del lab
print('masken',n,round(time.time()-t),flush=True)
# Zhang-Suen
def zs(img):
    img=img.copy()
    while True:
        ch=False
        for st in (0,1):
            p=np.pad(img,1)
            P2,P3,P4,P5,P6,P7,P8,P9=p[:-2,1:-1],p[:-2,2:],p[1:-1,2:],p[2:,2:],p[2:,1:-1],p[2:,:-2],p[1:-1,:-2],p[:-2,:-2]
            Bn=P2.astype(np.uint8)+P3+P4+P5+P6+P7+P8+P9
            seq=[P2,P3,P4,P5,P6,P7,P8,P9,P2]
            A=sum(((~seq[i])&seq[i+1]).astype(np.uint8) for i in range(8))
            if st==0: c=(P2&P4&P6)==0; c2=(P4&P6&P8)==0
            else: c=(P2&P4&P8)==0; c2=(P2&P6&P8)==0
            m=img&(Bn>=2)&(Bn<=6)&(A==1)&c&c2
            if m.any(): img[m]=False;ch=True
        if not ch: break
    return img
sk=zs(pm);np.save(NPY+'par_skel.npy',sk)
print('skel',int(sk.sum()),round(time.time()-t),flush=True)
ys,xs=np.nonzero(sk);S=set(zip(ys.tolist(),xs.tolist()))
N8=[(-1,0),(-1,1),(0,1),(1,1),(1,0),(1,-1),(0,-1),(-1,-1)]
def nb(p):
    return [(p[0]+a,p[1]+b) for a,b in N8 if (p[0]+a,p[1]+b) in S]
deg={p:len(nb(p)) for p in S}
nodes=[p for p in S if deg[p]!=2]
used=set();lines=[]
def walk(start,nxt):
    path=[start,nxt];prev=start;cur=nxt
    while True:
        if deg[cur]!=2 : break
        c=[q for q in nb(cur) if q!=prev and q not in path[-3:]]
        if not c: break
        prev,cur=cur,c[0];path.append(cur)
        if cur==start: break
    return path
edges=set()
for p in nodes:
    for q in nb(p):
        if (p,q) in edges: continue
        path=walk(p,q);edges.add((path[0],path[1]));edges.add((path[-1],path[-2]))
        used.update(path[1:-1]);lines.append(path)
rest=[p for p in S if p not in used and deg[p]==2 and p not in set(nodes)]
for p in rest:
    if p in used: continue
    q=nb(p)[0];path=walk(p,q);used.update(path);lines.append(path)
out=[]
for pth in lines:
    a=np.array(pth,float)
    pts=np.stack([c2e(a[:,1]),r2n(a[:,0])],1)
    L=np.hypot(*np.diff(pts,axis=0).T).sum()
    if L<3: continue
    s=dp(pts,0.3)
    out.append([[round(float(x),2),round(float(y),2)] for x,y in s])
json.dump({'info':'Flurstuecksgrenzen aus Parzellarkarte-PNG (schwarze Linien ohne Gebaeudekonturen/Text), UTM32 m, DP 0.3','linien':out},open(OUT+'parzellen.json','w'),separators=(',',':'))
print('linien',len(out),'punkte',sum(map(len,out)),round(time.time()-t))
