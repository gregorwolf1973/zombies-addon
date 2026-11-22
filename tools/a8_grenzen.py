from lb_common import *
from scipy import ndimage as ndi
import time,collections;t=time.time()
ndvi=np.array(load('ndvi'));ndom=np.array(load('ndom'));haus=np.array(load('haus'))
tn=np.array(load('tn'));code=json.load(open(NPY+'tn_codes.json'));asph=np.array(load('asphalt'))
veg=ndvi>(0.06+1)*127.5
hd=ndi.binary_dilation(haus,iterations=3)
WO=np.isin(tn,[code['Wohnbaufläche'],code['Fläche gemischter Nutzung']])
STR=np.isin(tn,[code['Straßenverkehr'],code['Weg']])
pk=np.array(load('par_skel'));dpar=ndi.distance_transform_edt(~pk)*RES
def at(arr,E,N,fill=False):
    c=np.floor(e2c(E)).astype(int);r=np.floor(n2r(N)).astype(int)
    ok=(c>=0)&(c<W)&(r>=0)&(r<H);v=np.full(E.shape,fill,arr.dtype);v[ok]=arr[r[ok],c[ok]];return v
# ---- Grenzlinien
lines=[l for l in json.load(open(OUT+'parzellen.json'))['linien']]
shp=read_shp(B+'tn/shp/Nutzung',(683600,5304800,685400,5306900))
extra=[]
for bb,rings,a in shp:
    if a['nutzart'] not in('Wohnbaufläche','Fläche gemischter Nutzung'): continue
    for r in rings:
        d=np.hypot(*np.diff(r,axis=0).T);s=np.r_[0,np.cumsum(d)]
        if s[-1]<3: continue
        ss=np.arange(0,s[-1],0.5);p=np.stack([np.interp(ss,s,r[:,0]),np.interp(ss,s,r[:,1])],1)
        tg=np.gradient(p,axis=0);n=np.hypot(*tg.T);n[n==0]=1;tg/=n[:,None];nr=np.stack([-tg[:,1],tg[:,0]],1)
        # Strasse auf einer Seite, keine Parzellengrenze in 1.5 m
        sa=at(STR,*(p+nr*1.5).T)|at(STR,*(p-nr*1.5).T);far=at(dpar,*p.T,fill=0.0)>1.5
        ok=sa&far&(at(dpar,*p.T,fill=0.0)>0)
        i=0
        while i<len(p):
            if not ok[i]: i+=1;continue
            j=i
            while j+1<len(p) and ok[j+1]: j+=1
            if j-i>=4: extra.append(p[i:j+1].tolist())
            i=j+1
print('Linien',len(lines),'TN-Zusatz',len(extra),round(time.time()-t),flush=True)
lines=[np.array(l) for l in lines]+[np.array(l) for l in extra]
OFF=np.arange(-3,3.01,0.2);NO=len(OFF);c0=NO//2;band=np.abs(OFF)<=1.0+1e-6
def runs_idx(m,gap=1):
    """zusammenhaengende Laeufe (Luecke<=gap) -> Liste (a,b)"""
    idx=np.nonzero(m)[0];res=[]
    if len(idx)==0: return res
    s=idx[0];p=idx[0]
    for i in idx[1:]:
        if i-p>gap+1: res.append((s,p));s=i
        p=i
    res.append((s,p));return res
allruns=[];stat=collections.Counter()
for li,l in enumerate(lines):
    d=np.hypot(*np.diff(l,axis=0).T);s=np.r_[0,np.cumsum(d)];L=s[-1]
    if L<2: continue
    n=max(int(round(L)),2);ss=(np.arange(n)+0.5)*L/n
    p=np.stack([np.interp(ss,s,l[:,0]),np.interp(ss,s,l[:,1])],1)
    q=np.stack([np.interp(ss+0.5,s,l[:,0])-np.interp(ss-0.5,s,l[:,0]),np.interp(ss+0.5,s,l[:,1])-np.interp(ss-0.5,s,l[:,1])],1)
    nn=np.hypot(*q.T);nn[nn==0]=1;tg=q/nn[:,None];nr=np.stack([-tg[:,1],tg[:,0]],1)
    # Profile: [n, NO] mit 3 Laengs-Stuetzstellen
    def prof(arr,agg):
        acc=[]
        for t_ in(-0.4,0,0.4):
            E=p[:,0,None]+tg[:,0,None]*t_+nr[:,0,None]*OFF;N=p[:,1,None]+tg[:,1,None]*t_+nr[:,1,None]*OFF
            acc.append(at(arr,E,N))
        acc=np.stack(acc);return acc
    ndm=prof(ndom,0);vg=prof(veg,0);hs=prof(hd,0)
    V=vg&(ndm>=0.6);T=vg&(ndm>4.0);VL=V&~T
    Mw=(~vg)&(ndm>=0.6)&(ndm<=2.5)&~hs
    maj=lambda a:a.sum(0)>=2
    V,T,VL,Mw,HS=maj(V),maj(T),maj(VL),maj(Mw),maj(hs)
    ndmed=np.median(ndm,0)
    # Seiten
    E=p[:,0,None]+nr[:,0,None]*np.array([-1.5,1.5]);N=p[:,1,None]+nr[:,1,None]*np.array([-1.5,1.5])
    wo=at(WO,E,N);st=at(STR,E,N)
    # Zufahrt/Zugang: Pflaster/Asphalt nach innen (zur Wohnseite) bis 6 m, Streifen +-0.6 m
    inward=np.where(wo[:,0:1]&~wo[:,1:2],-1.0,np.where(wo[:,1:2]&~wo[:,0:1],1.0,0.0))[:,0]
    paved=np.zeros(n,bool)
    for k in range(n):
        if inward[k]==0: continue
        dd=np.arange(1.0,6.01,0.5)[:,None];ww=np.array([-0.6,0,0.6])[None,:]
        EE=p[k,0]+nr[k,0]*inward[k]*dd+tg[k,0]*ww;NN=p[k,1]+nr[k,1]*inward[k]*dd+tg[k,1]*ww
        a=at(asph,EE,NN);paved[k]=a.mean()>0.75
    cls=np.array(['offen']*n,object);breite=np.zeros(n);hoehe=np.zeros(n);vm=np.zeros(n)
    for k in range(n):
        if HS[k][band].mean()>=0.3: cls[k]='haus';continue
        b=np.nonzero(band&V[k])[0]
        if len(b)>=4 and (band&V[k]).sum()/band.sum()>=0.35:
            if (band&T[k]).sum()/band.sum()>=0.3:
                rr=[r for r in runs_idx(V[k]) if r[0]<=b[-1] and r[1]>=b[0]]
                if rr:
                    a_,b_=max(rr,key=lambda r:(V[k][r[0]:r[1]+1]&band[r[0]:r[1]+1]).sum());w=(b_-a_+1)*0.2
                    if w<=4.4 and np.median(ndmed[k][a_:b_+1])<=7.5:
                        cls[k]='hecke';breite[k]=w;hoehe[k]=ndmed[k][a_:b_+1].mean();vm[k]=OFF[a_:b_+1].mean();continue
                cls[k]='baum';continue
            rr=[r for r in runs_idx(VL[k]) if r[0]<=b[-1] and r[1]>=b[0]]
            if rr:
                a_,b_=max(rr,key=lambda r:(VL[k][r[0]:r[1]+1]&band[r[0]:r[1]+1]).sum());w=(b_-a_+1)*0.2
                if w<=5.0 and (band[a_:b_+1]&T[k][a_:b_+1]).sum()==0:
                    cls[k]='hecke';breite[k]=w;hoehe[k]=ndmed[k][a_:b_+1].mean();vm[k]=OFF[a_:b_+1].mean();continue
            cls[k]='baum';continue
        bm=np.nonzero(band&Mw[k])[0]
        if len(bm)>=1:
            rr=[r for r in runs_idx(Mw[k],0) if r[0]<=bm[-1] and r[1]>=bm[0]]
            if rr:
                a_,b_=rr[0];w=(b_-a_+1)*0.2
                if w<=0.8: cls[k]='mauer';breite[k]=w;hoehe[k]=ndmed[k][a_:b_+1].mean();vm[k]=OFF[a_:b_+1].mean();continue
    # Zaun-Vorschlag: offen an Wohn/Mischflaeche
    zs_=np.zeros(n,bool);seite=np.where(st.any(1),'strasse','nachbar')
    for k in range(n):
        if cls[k]!='offen': continue
        if wo[k].all(): zs_[k]=True                      # Garten|Garten (Nachbar)
        elif wo[k].any() and st[k].any() and not paved[k]: zs_[k]=True
    # Luecken <=2 m ueberbruecken (gleiche Klasse beidseitig)
    lab=cls.copy();lab[zs_]='zaun_vorschlag'
    for cl in('hecke','mauer','zaun_vorschlag'):
        for a_,b_ in runs_idx(lab==cl,2):
            lab[a_:b_+1][(lab[a_:b_+1]=='offen')]=cl
    for cl,minL in(('hecke',3),('mauer',2),('zaun_vorschlag',2)):
        i=0
        while i<n:
            if lab[i]!=cl: i+=1;continue
            j=i
            while j+1<n and lab[j+1]==cl: j+=1
            Lr=(j-i+1)*L/n
            seg=slice(i,j+1)
            if Lr>=minL and not(cl=='mauer' and Lr<5 and st[seg].any(1).mean()>0.5):
                P=p[seg].copy()
                if cl in('hecke','mauer'):
                    off=vm[seg].copy();off[off==0]=np.nan
                    if np.all(np.isnan(off)): off=np.zeros(len(P))
                    off=np.where(np.isnan(off),np.nanmedian(off),off)
                    if len(off)>=5: off=ndi.uniform_filter1d(off,5,mode='nearest')
                    P=P+nr[seg]*off[:,None]
                P=dp(P,0.3)
                for _ in range(2):  # Chaikin
                    if len(P)<3: break
                    Q=[P[0]]
                    for a,b in zip(P[:-1],P[1:]): Q+= [0.75*a+0.25*b,0.25*a+0.75*b]
                    Q.append(P[-1]);P=np.array(Q)
                m=lab[seg]==cl
                allruns.append({'klasse':cl,'pts':[[round(float(x),2),round(float(y),2)] for x,y in P],'laenge':round(Lr,1),
                  'breite':round(float(np.median(breite[seg][breite[seg]>0])),2) if (breite[seg]>0).any() else None,
                  'hoehe':round(float(np.mean(hoehe[seg][breite[seg]>0])),2) if (breite[seg]>0).any() else None,
                  'seite':'strasse' if st[seg].any(1).mean()>0.5 else 'nachbar'})
            i=j+1
    stat.update(cls.tolist())
print('Sektionen',dict(stat),round(time.time()-t))
cnt=collections.Counter(r['klasse'] for r in allruns);ln=collections.defaultdict(float)
for r in allruns: ln[r['klasse']]+=r['laenge']
json.dump({'info':'Grenzen abgetastet (Parzellengrenzen + TN-Grenzen Wohn/Misch zu Strasse/Weg), Abschnitte ~1 m, Querband +-1 m. klasse hecke|mauer|zaun_vorschlag; Luecken = offen (Zufahrt/Zugang/Gebaeude/Baum nicht ausgegeben). seite=strasse|nachbar. UTM32 m.','laeufe':allruns},open(OUT+'grenzen_klassifiziert.json','w'),separators=(',',':'))
print(dict(cnt),{k:round(v) for k,v in ln.items()},round(time.time()-t))
