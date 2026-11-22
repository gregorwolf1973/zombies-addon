from lb_common import *
import time;t=time.time()
bbox=(683600,5304800,685400,5306900)
tn=read_shp(B+'tn/shp/Nutzung',bbox);print(len(tn),round(time.time()-t))
names=sorted({a['nutzart'] for _,_,a in tn});print(names)
code={n:i+1 for i,n in enumerate(names)}
json.dump(code,open(NPY+'tn_codes.json','w'),ensure_ascii=False)
img=Image.new('L',(W,H),0);d=ImageDraw.Draw(img)
def area(r): x=r[:,0];y=r[:,1];return 0.5*np.sum(x[:-1]*y[1:]-x[1:]*y[:-1])
for bb,rings,a in tn:
    for r in rings:
        pts=list(zip(e2c(r[:,0]),n2r(r[:,1])))
        d.polygon(pts,fill=(code[a['nutzart']] if area(r)<0 else 0))  # CW=aussen (negative Fläche)
tnr=np.array(img);np.save(NPY+'tn.npy',tnr)
# Wohn-/Gemischt-Grundstuecke separat
hs=json.load(open(B+'hausumringe/hausumringe_gebiet.json'))
img=Image.new('L',(W,H),0);d=ImageDraw.Draw(img)
for o in hs:
    for r in o['ringe']:
        d.polygon(list(zip(e2c(np.array(r)[:,0]),n2r(np.array(r)[:,1]))),fill=255)
np.save(NPY+'haus.npy',np.array(img)>0)
print({n:int((tnr==c).sum()) for n,c in code.items()},round(time.time()-t))
