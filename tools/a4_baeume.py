from lb_common import *
from scipy import ndimage as ndi
import time;t=time.time()
T=np.array(json.load(open(BAUM_JSON)),float) # fid,x,y,dgm,h
ndvi=np.array(load('ndvi')).astype(np.float32)/127.5-1;ndom=np.array(load('ndom'))
r=np.floor(n2r(T[:,2])).astype(int);c=np.floor(e2c(T[:,1])).astype(int)
ok=(r>=0)&(r<H)&(c>=0)&(c<W);T=T[ok];r=r[ok];c=c[ok];n=len(T);print(n)
seeds=np.zeros((H,W),np.int32);seeds[r,c]=np.arange(1,n+1)
# doppelte Pixel: letzter gewinnt, selten
_,idx=ndi.distance_transform_edt(seeds==0,return_indices=True)
own=seeds[idx[0],idx[1]]-1;del idx
M=(ndvi>0.0)&(ndom>2.0)
thr=0.5*T[own,4].astype(np.float32)
dist_ok=ndi.distance_transform_edt(seeds==0)*RES<=16
sel=M&(ndom>=thr)&dist_ok;del dist_ok
lab,_=ndi.label(sel,structure=np.ones((3,3)))
seedlab=np.zeros(n,np.int64);fb=0
for i in range(n):
    r0,c0=max(r[i]-7,0),max(c[i]-7,0)
    w=np.where(sel[r0:r[i]+8,c0:c[i]+8],ndom[r0:r[i]+8,c0:c[i]+8],-1)
    if w.max()<0: continue
    k=np.unravel_index(w.argmax(),w.shape);seedlab[i]=lab[r0+k[0],c0+k[1]]
m=sel&(lab==seedlab[own])&(seedlab[own]>0)
area=np.bincount(own[m],minlength=n)*RES*RES
D=2*np.sqrt(area/np.pi)
out=[];nofb=0
for i in range(n):
    h=T[i,4]
    if seedlab[i]==0 or area[i]<1: d=min(0.28*h+1.0,12);nofb+=1  # Ersatz: Faustformel
    else: d=D[i]
    d=float(np.clip(d,1.0,min(0.9*h+2,20)))
    out.append([round(T[i,1],1),round(T[i,2],1),round(h,1),round(d,1)])
sub=[o for o in out if KERN[0]<=o[0]<=KERN[2] and KERN[1]<=o[1]<=KERN[3]]
json.dump({'info':'Einzelbaeume [x,y,hoehe,kronenD] UTM32 m; kronenD aus nDOM (Nachbar-Watershed-light, >=50% Hoehe, NDVI>0); Ersatz Faustformel bei fehlender Spitze','baeume':sub},open(OUT+'baeume.json','w'),separators=(',',':'))
d=np.array([o[3] for o in sub]);h=np.array([o[2] for o in sub])
print(len(sub),'Ersatz',nofb,'D perc',np.percentile(d,[5,25,50,75,95]),'D/h',np.median(d/h),round(time.time()-t))
