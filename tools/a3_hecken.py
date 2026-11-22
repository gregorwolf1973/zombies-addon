from lb_skel import *
import time;t=time.time()
ndvi=np.array(load('ndvi')).astype(np.float32)/127.5-1;ndom=np.array(load('ndom'));haus=np.array(load('haus'))
tn=np.array(load('tn'));code=json.load(open(NPY+'tn_codes.json'))
veg=ndvi>0.06
tall=ndom>4.0
# Kronenrand-Ring um hohe Vegetation meiden: 1.0 m Abstand zu >4 m Vegetation
tallveg=tall&veg
near_tall=ndi.distance_transform_edt(~tallveg)<3.0
cand=veg&(ndom>=0.8)&(ndom<=3.5)&~ndi.binary_dilation(haus,iterations=3)&~near_tall
# Strassen/Gewaesser/Bahn ausschliessen
for k in ['Straßenverkehr','Fließgewässer','Bahnverkehr']: cand&=~(tn==code[k])
cand=ndi.binary_opening(cand,structure=np.ones((3,3)))
print('cand',int(cand.sum()),round(time.time()-t),flush=True)
# breite Anteile (Durchmesser > 2.8 m) abziehen
edt=ndi.distance_transform_edt(cand)
core=edt>=8.0
thick=ndi.distance_transform_edt(~core)<=8.0
thin=cand&~thick
thin=ndi.binary_opening(thin,structure=np.ones((3,3)))
edt2=ndi.distance_transform_edt(thin)
sk=zs(thin);sk=prune(sk,6)
print('skel',int(sk.sum()),round(time.time()-t),flush=True)
np.save(NPY+'hecke_mask.npy',thin)
lines=trace(sk)
# Parzellen-Abstand
pk=np.array(load('par_skel'));dpar=ndi.distance_transform_edt(~pk)*RES
out=[]
for pth in lines:
    a=np.array(pth,float)
    if len(a)<2: continue
    pts=np.stack([c2e(a[:,1]),r2n(a[:,0])],1)
    L=float(np.hypot(*np.diff(pts,axis=0).T).sum())
    if L<4.0: continue
    ri=a[:,0].astype(int);ci=a[:,1].astype(int)
    breite=float(np.median(2*edt2[ri,ci]*RES));
    if breite>3.0: continue
    hoehe=float(ndom[ri,ci].mean());dist=dpar[ri,ci]
    frac=float((dist<=1.5).mean())
    s=dp(pts,0.3)
    out.append({'pts':[[round(float(x),2),round(float(y),2)] for x,y in s],'laenge':round(L,1),'breite':round(breite,2),'hoehe':round(hoehe,2),
      'an_grenze':bool(frac>=0.5),'grenzanteil':round(frac,2),'abstand_grenze_med':round(float(np.median(dist)),2)})
json.dump({'info':'Hecken-Mittellinien, UTM32 m; breite/hoehe m; an_grenze = >=50% der Linie <=1.5 m von Flurstuecksgrenze. NDVI>0.10, nDOM 0.8-3.5','hecken':out},open(OUT+'hecken.json','w'),separators=(',',':'))
print('hecken',len(out),'an Grenze',sum(h['an_grenze'] for h in out),'Gesamtlaenge m',round(sum(h['laenge'] for h in out)),round(time.time()-t))
