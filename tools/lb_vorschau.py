from lb_common import *
import os, tempfile
PV = os.environ.get('VORSCHAU_DIR', os.path.join(tempfile.gettempdir(), 'raster_vorschau')) + '/'
def crop(e,n,size=150):
    c0=int(e2c(e));r0=int(n2r(n+size));s=int(size/RES);return r0,c0,s
def base(e,n,size=150,layer='rgb'):
    r0,c0,s=crop(e,n,size)
    if layer=='rgb': im=np.array(load('rgb')[r0:r0+s,c0:c0+s])
    elif layer=='ndom':
        v=np.clip(np.array(load('ndom')[r0:r0+s,c0:c0+s])/25,0,1);im=(np.stack([v]*3,-1)*255).astype(np.uint8)
    return Image.fromarray(im),r0,c0
def draw_lines(im,r0,c0,lines,col=(255,0,0),w=2):
    d=ImageDraw.Draw(im)
    for l in lines:
        l=np.asarray(l);pts=list(zip(e2c(l[:,0])-c0,n2r(l[:,1])-r0))
        if len(pts)>1: d.line(pts,fill=col,width=w)
