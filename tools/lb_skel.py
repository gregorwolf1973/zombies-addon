from lb_common import *
from scipy import ndimage as ndi
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
N8=[(-1,0),(-1,1),(0,1),(1,1),(1,0),(1,-1),(0,-1),(-1,-1)]
def prune(sk,k):
    orig=sk.copy();cur=sk.copy()
    def endpoints(a):
        p=np.pad(a,1);n=sum(p[1+dy:p.shape[0]-1+dy,1+dx:p.shape[1]-1+dx].astype(np.uint8) for dy,dx in N8)
        return a&(n<=1)
    for _ in range(k): cur=cur&~endpoints(cur)
    ends=endpoints(cur)
    for _ in range(k):
        g=ndi.binary_dilation(ends,structure=np.ones((3,3)))&orig&~cur
        if not g.any(): break
        cur|=g;ends=g
    return cur
def trace(S_arr):
    ys,xs=np.nonzero(S_arr);S=set(zip(ys.tolist(),xs.tolist()))
    def nb(p): return [(p[0]+a,p[1]+b) for a,b in N8 if (p[0]+a,p[1]+b) in S]
    NB={p:nb(p) for p in S};deg={p:len(v) for p,v in NB.items()}
    nodes=[p for p in S if deg[p]!=2];nodeset=set(nodes)
    def walk(start,nxt):
        path=[start,nxt];prev=start;cur=nxt
        while deg[cur]==2:
            c=[q for q in NB[cur] if q!=prev and q not in path[-3:]]
            if not c: break
            prev,cur=cur,c[0];path.append(cur)
            if cur==start: break
        return path
    edges=set();used=set();lines=[]
    for p in nodes:
        for q in NB[p]:
            if (p,q) in edges: continue
            path=walk(p,q);edges.add((path[0],path[1]));edges.add((path[-1],path[-2]));used.update(path[1:-1]);lines.append(path)
    for p in S:
        if p in used or p in nodeset: continue
        path=walk(p,NB[p][0]);used.update(path);lines.append(path)
    return lines
