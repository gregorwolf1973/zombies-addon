import sys,os,json,struct
sys.path.insert(0,os.path.join(os.path.dirname(os.path.abspath(__file__)),'.pylib'))
import numpy as np
from PIL import Image,ImageDraw
Image.MAX_IMAGE_PIXELS=None
B=os.path.join(os.path.dirname(os.path.abspath(__file__)),'luftbild/cache/bayern/')
OUT=B+'auswertung/'
NPY=OUT+'_npy/'
X0,Y1=683670.0,5306840.0
RES=0.2
W,H=8150,9750   # x 683670..685300, y 5304890..5306840
def e2c(x): return (np.asarray(x)-X0)/RES
def n2r(y): return (Y1-np.asarray(y))/RES
def c2e(c): return X0+(np.asarray(c)+0.5)*RES
def r2n(r): return Y1-(np.asarray(r)+0.5)*RES
def load(n): return np.load(NPY+n+'.npy',mmap_mode='r')
def read_shp(path,bbox):
    """liefert [(bbox,[ringe als np (n,2)], attrs)] im bbox"""
    shp=open(path+'.shp','rb').read()
    dbf=open(path+'.dbf','rb').read()
    nrec,hl,rl=struct.unpack('<IHH',dbf[4:12])
    fields=[];o=32
    while dbf[o]!=0x0D:
        nm=dbf[o:o+11].split(b'\0')[0].decode();ln=dbf[o+16];fields.append((nm,ln));o+=32
    res=[];p=100;i=0
    while p<len(shp):
        cl=struct.unpack('>2i',shp[p:p+8])[1]*2;rec=shp[p+8:p+8+cl];p+=8+cl
        st=struct.unpack('<i',rec[:4])[0]
        if st==5:
            bb=struct.unpack('<4d',rec[4:36])
            if not(bb[2]<bbox[0] or bb[0]>bbox[2] or bb[3]<bbox[1] or bb[1]>bbox[3]):
                npart,npt=struct.unpack('<2i',rec[36:44])
                parts=list(struct.unpack('<%di'%npart,rec[44:44+4*npart]))+[npt]
                pts=np.frombuffer(rec,'<f8',npt*2,44+4*npart).reshape(-1,2)
                rings=[pts[parts[k]:parts[k+1]] for k in range(npart)]
                r=dbf[hl+i*rl+1:hl+(i+1)*rl];a={};q=0
                for nm,ln in fields:
                    a[nm]=r[q:q+ln].decode('utf8','replace').strip();q+=ln
                res.append((bb,rings,a))
        i+=1
    return res
def dp(pts,eps):
    pts=np.asarray(pts,float)
    if len(pts)<3: return pts
    keep=np.zeros(len(pts),bool);keep[0]=keep[-1]=True
    st=[(0,len(pts)-1)]
    while st:
        a,b=st.pop()
        if b<=a+1: continue
        d=pts[b]-pts[a];n=np.hypot(*d)
        seg=pts[a+1:b]-pts[a]
        dist=np.abs(seg[:,0]*d[1]-seg[:,1]*d[0])/n if n>0 else np.hypot(seg[:,0],seg[:,1])
        k=dist.argmax()
        if dist[k]>eps:
            keep[a+1+k]=True;st+= [(a,a+1+k),(a+1+k,b)]
    return pts[keep]
