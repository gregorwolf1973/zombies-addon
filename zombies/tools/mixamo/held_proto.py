#!/usr/bin/env python3
"""Helden-Prototyp-Seite (eine HTML-Datei, alles eingebettet): Matrix Figur x Aktion (animiert, Wiese, Schatten) + Kreis-Szene mit Zombies.
Farbstil C = aufgehellt (Gamma 0,72), ohne Kontur. Eingabe: Ordner von held_streifen.py (<fig>_<auftrag>_streifen.png/_meta.json) und Ordner mit Zombie-Streifen (<figur>_walk_streifen.png, 16 Bilder à 160 px).
PYTHONPATH=<pil> python3 held_proto.py <heldenordner> <zombieordner> <ausgabe.html>"""
import sys, io, base64, json, random
from PIL import Image, ImageFilter
H, Z, OUT = sys.argv[1] + '/', sys.argv[2] + '/', sys.argv[3]
FIG = [('jennifer', 'Jennifer'), ('swatguy', 'SWAT Guy')]
SPALTEN = [('stehen', 'stehen (ohne Waffe)'), ('gehen', 'gehen'), ('rennen', 'rennen'), ('pistole_gehen', 'Pistole gehen'), ('pistole_schiessen', 'Pistole schießen'),
           ('gewehr_gehen', 'Gewehr gehen'), ('gewehr_schiessen', 'Gewehr schießen'), ('schrot_gehen', 'Schrotflinte gehen (Zusatz)'), ('schrot_schiessen', 'Schrotflinte schießen (Zusatz)'), ('messer_stechen', 'Messer stechen'),
           ('schlaeger_schlagen', 'Schläger schlagen'), ('tod', 'Tod')]
ZOMB = ['warzombie', 'copzombie', 'zombiegirl', 'yaku', 'romero']
def hell(s):
    a = s.split()[3]; r = s.convert('RGB').point([round(255 * (v / 255) ** 0.72) for v in range(256)] * 3).convert('RGBA'); r.putalpha(a); return r
def schatten(s):
    a = s.split()[3].point(lambda v: int(v * 0.42)); w = s.width // 16   # strip aus 16 Bildern: je Bild weichzeichnen
    out = Image.new('RGBA', s.size, (0, 0, 0, 0)); f = s.height
    for i in range(s.width // f):
        c = a.crop((i * f, 0, (i + 1) * f, f)).filter(ImageFilter.GaussianBlur(f / 32)); sh = Image.new('RGBA', (f, f), (20, 30, 10, 0)); sh.putalpha(c); out.paste(sh, (i * f, 0))
    return out
def webp(im, q=92):
    b = io.BytesIO(); im.save(b, 'WEBP', quality=q, method=3); return 'data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode()
def png(im):
    b = io.BytesIO(); im.save(b, 'PNG', optimize=True); return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()
def strip(pfad, **kw):
    s = Image.open(pfad).convert('RGBA'); return {'img': webp(hell(s)), 'sh': webp(schatten(s), 80), **kw}
D = {'held': {}, 'zomb': {}}
hm_held = {f: json.load(open(f'{H}{f}_stehen_meta.json'))['hoehe_m'] for f, _ in FIG}   # gerenderte Körperhöhe (m, Übergröße 2x)
HM_Z = {'warzombie': 3.84, 'copzombie': 3.61, 'zombiegirl': 3.75, 'yaku': 3.77, 'romero': 3.27}   # gemessen in Leerlauf-Clip
for f, _ in FIG:
    D['held'][f] = {}
    for c, _ in SPALTEN:
        m = json.load(open(f'{H}{f}_{c}_meta.json')); N = m['N']
        mu = m.get('muendung') or []; schuss = []
        if c.endswith('schiessen') and mu:   # Schussbild = Bild mit dem stärksten Rückstoß (Mündung wandert am schnellsten entgegen der Laufrichtung) -> Schuss in Bild davor
            import math
            sp = [e['x'] * math.cos(math.radians(e['a'])) + e['y'] * math.sin(math.radians(e['a'])) for e in mu]; k = max(range(N), key=lambda i: sp[i - 1] - sp[i]); schuss = [(k - 1) % N]
        D['held'][f][c] = strip(f'{H}{f}_{c}_streifen.png', f=m['f'], N=N, ms=round(1000 * m['dauer'] / (N - 1 if m['einmal'] else N)), einmal=m['einmal'], feld=m['feld_m'], mu=mu, schuss=schuss, hm=hm_held[f])
for z in ZOMB: D['zomb'][z] = strip(f'{Z}{z}_walk_streifen.png', f=160, N=16, ms=90, einmal=0, feld=4, mu=[], schuss=[], hm=HM_Z[z])
random.seed(4); px = Image.new('RGBA', (256, 256)); p = px.load()
for y in range(256):
    for x in range(256):
        n = random.randint(-5, 5); p[x, y] = (104 + n, 146 + n + 2, 70 + n // 2, 255)
json.dump({f: {c: {'feld_m': D['held'][f][c]['feld'], 'bildpx': D['held'][f][c]['f'], 'schussbild': D['held'][f][c]['schuss'], 'muendung_je_bild': D['held'][f][c]['mu']} for c in D['held'][f] if D['held'][f][c]['mu']} for f in D['held']}, open(OUT.rsplit('.', 1)[0] + '_muendung.json', 'w'), indent=1)
gras = png(px.filter(ImageFilter.GaussianBlur(0.7)))
html = '''<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Helden-Prototyp</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>:root{--bg:#1c1f1a;--fg:#e8ead8;--mut:#9aa08a}body{margin:0;padding:14px 16px;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif}
h1{font-size:18px;margin:0 0 4px}h2{font-size:15px;margin:18px 0 6px}p{margin:4px 0;color:var(--mut)}table{border-collapse:separate;border-spacing:4px}th{font-weight:600;font-size:12px;text-align:center;color:var(--mut);max-width:var(--cw)}
td.n{font-weight:600;white-space:nowrap;padding-right:8px}canvas{display:block;border-radius:4px}.row{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin:6px 0}select,input{background:#2b2f27;color:var(--fg);border:1px solid #444;border-radius:4px;padding:2px 4px}
.sc{overflow:auto;max-width:100%}</style></head><body>
<h1>Helden-Prototyp: Mixamo-Figuren, Draufsicht, Farbstil C</h1>
<p>Exakt von oben, Blick nach rechts (+x), 16 Bilder je Schleife, Spielgröße &times;3 (Heldenfeld 160 px = 4 m, Spielmaßstab 0,2055) &middot; Anzeige-Zoom einstellbar. Waffen: CC0-Modelle (Quaternius, Pichuliru), Schläger eigenes Drehteil. Mündungsfeuer/Spuren: gestrichelt = Laufrichtung, durchgezogen = Spielrichtung (+x). Szene: gemeinsamer Maßstab, alle Menschen 1,8 m.</p>
<div class="row"><label>Zoom <input id="zoom" type="range" min="1" max="4" step="0.25" value="1.5"> <span id="zv">1,5</span>&times; (1 = Spielgröße &times;3)</label></div>
<div class="sc"><table id="tab"></table></div>
<h2>Szene: Helden und Zombies im Kreis</h2>
<div class="row"><label>Jennifer <select id="sj"></select></label><label>SWAT Guy <select id="ss"></select></label></div>
<div class="sc"><canvas id="szene" width="980" height="520"></canvas></div>
<script>
const D=@@D@@;const SP=@@SP@@;const GRAS="@@GRAS@@";const FIG=@@FIG@@;
const PXREAL=40; // Szene: Bildpunkte je echtem Meter, alle Menschen auf 1,8 m normiert (gerenderte Höhe hm)
const PXM=24.7; // Bildpunkte je Meter bei Zoom 1 (Spielmaßstab x3): 8,2 px/m x 3
const img=u=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=u});
async function laden(){for(const g of ['held','zomb'])for(const f in D[g]){const o=g=='held'?D[g][f]:{z:D[g][f]};for(const c in o){const s=o[c];s.I=await img(s.img);s.S=await img(s.sh)}}
 const t=await img(GRAS);return t}
function zeichne(ctx,s,idx,x,y,m,rot){ // Bild idx mit Schatten, Mitte x,y, m = Bildpunkte je Meter
 const w=s.feld*m;ctx.save();ctx.translate(x,y);
 ctx.drawImage(s.S,idx*s.f,0,s.f,s.f,-w/2+0.16*m,-w/2+0.24*m,w,w);
 if(rot)ctx.rotate(rot);ctx.drawImage(s.I,idx*s.f,0,s.f,s.f,-w/2,-w/2,w,w);ctx.restore()}
const SCH={pistole_schiessen:1,gewehr_schiessen:1,schrot_schiessen:1};
function effekt(ctx,s,idx,x,y,m,rot,t){ // Leuchtspuren (gestrichelt = Laufrichtung, durchgezogen = Spielrichtung) + Mündungsfeuer im Takt des Schusses
 const e=s.mu[idx];if(!e)return;const c=Math.cos(rot),sn=Math.sin(rot);const mx=x+(e.x*c-e.y*sn)*m,my=y+(e.x*sn+e.y*c)*m;
 const fl=s.schuss.includes(idx)&&(s.ms>=80?(t%s.ms)<70:true)||(s.ms<80&&s.schuss.includes((idx+s.N-1)%s.N));
 const L=2.2*m,a=e.a*Math.PI/180+rot;ctx.save();ctx.lineCap='round';
 ctx.setLineDash([6,5]);ctx.strokeStyle=fl?'rgba(255,230,120,.95)':'rgba(255,230,120,.5)';ctx.lineWidth=fl?2:1;ctx.beginPath();ctx.moveTo(mx,my);ctx.lineTo(mx+Math.cos(a)*L,my+Math.sin(a)*L);ctx.stroke();
 ctx.setLineDash([]);ctx.strokeStyle=fl?'rgba(255,90,60,.95)':'rgba(255,90,60,.5)';ctx.lineWidth=fl?2:1;ctx.beginPath();ctx.moveTo(mx,my);ctx.lineTo(mx+Math.cos(rot)*L,my+Math.sin(rot)*L);ctx.stroke();
 if(fl){const R=0.3*m,g=ctx.createRadialGradient(mx,my,0,mx,my,R);g.addColorStop(0,'rgba(255,255,230,1)');g.addColorStop(.35,'rgba(255,210,90,.9)');g.addColorStop(1,'rgba(255,140,30,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(mx,my,R,0,7);ctx.fill();
  ctx.translate(mx,my);ctx.rotate(a);ctx.fillStyle='rgba(255,220,110,.9)';ctx.beginPath();ctx.moveTo(0,-R*.35);ctx.lineTo(R*2.2,0);ctx.lineTo(0,R*.35);ctx.closePath();ctx.fill()}
 ctx.restore()}
laden().then(tile=>{
 const pat=document.createElement('canvas').getContext('2d').createPattern(tile,'repeat');
 const tab=document.getElementById('tab');let h='<tr><td></td>'+SP.map(s=>'<th>'+s[1]+'</th>').join('')+'</tr>';
 for(const [f,n] of FIG)h+='<tr><td class="n">'+n+'</td>'+SP.map(s=>'<td><canvas data-f="'+f+'" data-c="'+s[0]+'" width="240" height="240"></canvas></td>').join('')+'</tr>';
 tab.innerHTML=h;
 const cv=[...tab.querySelectorAll('canvas')];
 function groesse(){const z=+document.getElementById('zoom').value;document.getElementById('zv').textContent=String(z).replace('.',',');cv.forEach(c=>{c.style.width=5*PXM*z+'px';c.style.height=5*PXM*z+'px'});document.documentElement.style.setProperty('--cw',5*PXM*z+'px')}
 document.getElementById('zoom').oninput=groesse;groesse();
 const sel=(id,f,def)=>{const e=document.getElementById(id);e.innerHTML=SP.map(s=>'<option value="'+s[0]+'"'+(s[0]==def?' selected':'')+'>'+s[1]+'</option>').join('');return e};
 const sj=sel('sj','jennifer','rennen'),ss=sel('ss','swatguy','gewehr_gehen');
 const sc=document.getElementById('szene'),sx=sc.getContext('2d');
 function idxVon(s,t){const k=Math.floor(t/s.ms);if(s.einmal){return Math.min(k%(s.N+Math.ceil(1000/s.ms)),s.N-1)}return k%s.N}
 function tick(t){
  for(const c of cv){const s=D.held[c.dataset.f][c.dataset.c],x=c.getContext('2d');x.fillStyle=x.createPattern(tile,'repeat');x.fillRect(0,0,240,240);zeichne(x,s,idxVon(s,t),120,120,48,0);if(SCH[c.dataset.c])effekt(x,s,idxVon(s,t),120,120,48,0,t)}
  sx.fillStyle=pat2||(pat2=sx.createPattern(tile,'repeat'));sx.fillRect(0,0,sc.width,sc.height);
  const A=[];const kreis=(cx,cy,R,w,ph)=>{const th=ph+w*t/1000;return[cx+R*Math.cos(th),cy+R*Math.sin(th),th+Math.PI/2]};
  const hj=D.held.jennifer[sj.value],hs=D.held.swatguy[ss.value];
  let p=kreis(250,260,140,0.55,0);A.push([p[1],hj,p[0],p[2],t]);p=kreis(730,260,140,-0.45,Math.PI);A.push([p[1],hs,p[0],p[2],t]);
  ZB.forEach((z,i)=>{const q=kreis(z[0],z[1],z[2],z[3],z[4]);A.push([q[1],D.zomb[z[5]],q[0],q[2],t+i*137])});
  A.sort((a,b)=>a[0]-b[0]);for(const a of A){const s=a[1];const m=PXREAL*1.8/s.hm;const ix=idxVon(s,a[4]);zeichne(sx,s,ix,a[2],a[0],m,a[3]);if(s.mu&&s.mu.length&&s.schuss.length)effekt(sx,s,ix,a[2],a[0],m,a[3],a[4])}
  requestAnimationFrame(tick)}
 let pat2=null;const ZB=[[250,260,60,-0.9,1],[250,260,95,0.35,3.5],[730,260,60,0.8,2],[730,260,95,-0.3,0.4],[490,260,170,0.25,5]].map((z,i)=>z.concat(@@ZOMB@@[i]));
 requestAnimationFrame(tick)});
</script></body></html>'''
for k, v in (('@@D@@', json.dumps(D)), ('@@SP@@', json.dumps(SPALTEN)), ('@@GRAS@@', gras), ('@@FIG@@', json.dumps(FIG)), ('@@ZOMB@@', json.dumps(ZOMB))): html = html.replace(k, v)
open(OUT, 'w').write(html); print(OUT, round(len(html) / 1e6, 2), 'MB')
