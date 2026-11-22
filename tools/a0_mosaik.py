from lb_common import *
from scipy.ndimage import map_coordinates
import time
t=time.time()
dom=np.full((H,W),np.nan,np.float32);rgb=np.zeros((H,W,3),np.uint8);ndvi=np.zeros((H,W),np.uint8);par=np.zeros((H,W),bool)
dgm=np.full((1950+2,1630+2),np.nan,np.float32) # x 683669..685301 ,y 5306841..5304889 (1m)
def paste(dst,src,e0,n1):  # e0 W-Rand, n1 N-Rand der Kachel
    c0=int(round((e0-X0)/RES));r0=int(round((Y1-n1)/RES));h,w=src.shape[:2]
    rs=max(r0,0);cs=max(c0,0);re=min(r0+h,H);ce=min(c0+w,W)
    if re<=rs or ce<=cs: return
    dst[rs:re,cs:ce]=src[rs-r0:re-r0,cs-c0:ce-c0]
for kx in (683,684,685):
  for ky in (4,5,6):
    ky=5300+ky;e0=kx*1000;n1=(ky+1)*1000
    paste(dom,np.array(Image.open(B+f'dom20/32{kx}_{ky}_20_DOM.tif')),e0,n1)
    paste(rgb,np.array(Image.open(B+f'dop20rgb/32{kx}_{ky}.tif')),e0,n1)
    c=np.array(Image.open(B+f'dop20cir/{kx}000_{ky}000.tiff')).astype(np.float32)
    nir,red=c[...,0],c[...,1]
    v=(nir-red)/np.maximum(nir+red,1)
    paste(ndvi,np.clip((v+1)*127.5,0,255).astype(np.uint8),e0,n1)
    p=np.array(Image.open(B+f'parzellar/{kx}000_{ky}000.png'))
    paste(par,(p[...,0]<40)&(p[...,1]<40)&(p[...,2]<40),e0,n1)
    g=np.array(Image.open(B+f'dgm1/{kx}_{ky}.tif'))
    # dgm-Raster: Zelle (j,i) -> E=683669+j+.5
    j0=kx*1000-683669;i0=int(5306841-n1)
    for (a,b,dj,di) in [(0,0,0,0)]:
        rs=max(i0,0);cs=max(j0,0);re=min(i0+1000,dgm.shape[0]);ce=min(j0+1000,dgm.shape[1])
        if re>rs and ce>cs: dgm[rs:re,cs:ce]=g[rs-i0:re-i0,cs-j0:ce-j0]
    print(kx,ky,round(time.time()-t),flush=True)
dgm[dgm<-1000]=np.nan
# DGM -> 0,2 m bilinear (Zellmitte (j+.5, i+.5))
ndom=np.empty((H,W),np.float32)
cc=(c2e(np.arange(W))-683669)-0.5
for r0 in range(0,H,500):
    rr=(5306841-r2n(np.arange(r0,min(r0+500,H))))-0.5
    R,C=np.meshgrid(rr,cc,indexing='ij')
    z=map_coordinates(np.nan_to_num(dgm,nan=np.nanmedian(dgm)),[R,C],order=1,mode='nearest')
    ndom[r0:r0+500]=dom[r0:r0+500]-z
ndom[np.isnan(ndom)]=0
np.save(NPY+'ndom.npy',ndom);np.save(NPY+'dom.npy',dom);np.save(NPY+'rgb.npy',rgb);np.save(NPY+'ndvi.npy',ndvi);np.save(NPY+'par_schwarz.npy',par)
print('ndom',np.percentile(ndom,[1,50,99,99.9]),'fertig',round(time.time()-t))
