from lb_dlm import *
from scipy import ndimage as ndi
import time;t=time.time()
rgb=load('rgb');tn=np.array(load('tn'));code=json.load(open(NPY+'tn_codes.json'))
g=(rgb[...,:].astype(np.uint16).sum(-1)//3).astype(np.float32)
mn=rgb.min(-1).astype(np.int16);mx=rgb.max(-1).astype(np.int16)
roadz=(tn==code['Straßenverkehr'])|(tn==code['Platz'])|(tn==code['Weg'])
roadz=ndi.binary_dilation(roadz,iterations=5)
loc=ndi.uniform_filter(g,size=21)
white=(g>loc+35)&(g>130)&((mx-mn)<45)&roadz&~np.array(load('haus'))&(np.array(load('ndom'))<1.0)
white=ndi.binary_opening(white,structure=np.ones((2,2)))
lab,n=ndi.label(white,structure=np.ones((3,3)));print('white comps',n,round(time.time()-t),flush=True)
objs=ndi.find_objects(lab);bars=[]
for i,sl in enumerate(objs,1):
    h=sl[0].stop-sl[0].start;w=sl[1].stop-sl[1].start
    if max(h,w)<12 or max(h,w)>55: continue   # 2.4..11 m
    ys,xs=np.nonzero(lab[sl]==i)
    if len(ys)<20: continue
    X=np.stack([xs+sl[1].start,-(ys+sl[0].start)],1).astype(float)  # x=Ost, y=Nord (in px)
    m=X.mean(0);C=np.cov((X-m).T);ev,evec=np.linalg.eigh(C)
    L=4*np.sqrt(ev[1])*RES*0.87;Wd=4*np.sqrt(max(ev[0],1e-6))*RES*0.87   # Rechteck: Seite = sqrt(12 var)
    L=np.sqrt(12*ev[1])*RES;Wd=np.sqrt(12*max(ev[0],1e-6))*RES
    fill=len(ys)*RES*RES/(L*Wd)
    if not(0.25<=Wd<=1.0 and 2.5<=L<=9 and fill>0.6 and L/Wd>3): continue
    d=evec[:,1];bars.append((m[0]*RES+X0,m[1]*RES+Y1,d[0],d[1],L,Wd))
bars=np.array(bars);print('Balken',len(bars),round(time.time()-t),flush=True)
from scipy.spatial import cKDTree
tr=cKDTree(bars[:,:2]);par=list(range(len(bars)))
def f(a):
    while par[a]!=a: par[a]=par[par[a]];a=par[a]
    return a
for i,j in tr.query_pairs(2.2):
    d1=bars[i,2:4];d2=bars[j,2:4]
    if abs(d1@d2)<0.93: continue
    off=bars[j,:2]-bars[i,:2];dist=np.hypot(*off)
    if abs(off@d1)/dist>0.5 or dist<0.45: continue   # Versatz quer zur Balkenachse (=laengs der Strasse)
    if abs(bars[i,4]-bars[j,4])>1.5: continue
    par[f(i)]=f(j)
cl={}
for i in range(len(bars)): cl.setdefault(f(i),[]).append(i)
out=[]
for k,m in cl.items():
    if len(m)<2: continue
    B_=bars[m];d=B_[:,2:4].mean(0);d/=np.hypot(*d)
    c=B_[:,:2].mean(0);nrm=np.array([-d[1],d[0]]);q=(B_[:,:2]-c)@nrm
    ext=q.max()-q.min()+B_[:,5].mean()
    out.append({'x':round(float(c[0]),1),'y':round(float(c[1]),1),'richtung':[round(float(d[0]),3),round(float(d[1]),3)],'laenge':round(float(np.median(B_[:,4])),1),'breite':round(float(ext),1),'balken':len(m),'sicher':len(m)>=3,'balkenbreite':round(float(B_[:,5].mean()),2)})
json.dump({'info':'Zebrastreifen aus DOP20-RGB: weisse Balken in Strassenflaechen, 2 (unsicher) oder >=3 parallele Balken. richtung = Einheitsvektor in Querungsrichtung (Balkenlaengsachse, Ost/Nord), laenge = Balkenlaenge (Querungslaenge), breite = Ausdehnung laengs der Strasse. Kein OSM-Abgleich.','zebra':out},open(OUT+'zebra.json','w'),separators=(',',':'))
print('zebra',len(out),[o['balken'] for o in out],round(time.time()-t))
