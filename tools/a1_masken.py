from lb_common import *
import time;t=time.time()
tn=read_shp(TNSHP,BBOX);print(len(tn),round(time.time()-t))
# feste Codes 1..15 (wie geretsried2; amtlich.py rechnet mit ihnen), weitere Nutzungsarten dieser Karte (Friedhof, Flugverkehr, Moor …) danach
FEST=['Bahnverkehr','Fließgewässer','Fläche besonderer funktionaler Prägung','Fläche gemischter Nutzung','Gehölz','Industrie- und Gewerbefläche','Landwirtschaft','Platz','Sport-, Freizeit- und Erholungsfläche','Stehendes Gewässer','Straßenverkehr','Unland/Vegetationslose Fläche','Wald','Weg','Wohnbaufläche']
names=FEST+sorted({a['nutzart'] for _,_,a in tn}-set(FEST));print(names)
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
hs=json.load(open(HAUS_JSON))
img=Image.new('L',(W,H),0);d=ImageDraw.Draw(img)
for o in hs:
    for r in o['ringe']:
        d.polygon(list(zip(e2c(np.array(r)[:,0]),n2r(np.array(r)[:,1]))),fill=255)
np.save(NPY+'haus.npy',np.array(img)>0)
print({n:int((tnr==c).sum()) for n,c in code.items()},round(time.time()-t))
