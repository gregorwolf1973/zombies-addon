// Zeichenfunktionen aus dem Einzelspieler-Prototyp „Zombies in Oberbayern“ – wörtlich übernommen
// und von tools/baue_aussehen.py erzeugt. Nicht von Hand ändern, sondern neu erzeugen.
/* eslint-disable */
export function erzeugeZeichner(ctx) {
  const TAU = Math.PI * 2;
  let time = 0;
const FPAL=[[['#1b4d1f','#2c6b2f'],['#1e5a22','#357c38'],['#22662a','#3f8c42']],[['#1a4433','#2a5f48'],['#1d4f3b','#2f6b51'],['#215a43','#3a7a5d']],[['#2a5418','#3f7526'],['#2f611c','#4a842e'],['#356d20','#56923a']]];
function hash(x,y){let h=(Math.imul(x,374761393)+Math.imul(y,668265263))|0;h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296;}
function vnoise(x,y,s){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
  const a=hash(xi+s,yi),b=hash(xi+1+s,yi),c=hash(xi+s,yi+1),d=hash(xi+1+s,yi+1);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;}
function shadowE(x,y,rx,ry){ctx.fillStyle='#0003';ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fill();}
function rrect(x,y,w,h,r){ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,y,w,h,r);else ctx.rect(x,y,w,h);}
function fichte(x,y,s,v){
  v=v||0;const pal=FPAL[Math.floor(v*3)%3],asy=.88+v*.24;
  shadowE(x+9*s,y+22*s,24*s,8*s);
  ctx.fillStyle='#4e342e';ctx.fillRect(x-3*s,y+4*s,6*s,18*s);ctx.fillStyle='#6d4c41';ctx.fillRect(x,y+4*s,3*s,18*s);
  const tiers=[[12,23],[-6,18],[-22,13]];if(v>.6)tiers.push([-34,8]);
  tiers.forEach(([ty,w],i)=>{const[dk,lt]=pal[Math.min(i,2)],top=i===tiers.length-1?ty-16:ty-24;
    ctx.fillStyle=dk;ctx.beginPath();ctx.moveTo(x,y+top*s);ctx.lineTo(x+w*asy*s,y+ty*s);ctx.lineTo(x+w*asy*.55*s,y+(ty+2)*s);ctx.quadraticCurveTo(x,y+(ty+5)*s,x-w*.5*s,y+(ty+2)*s);ctx.lineTo(x-w*s,y+ty*s);ctx.closePath();ctx.fill();
    ctx.fillStyle=lt;ctx.beginPath();ctx.moveTo(x,y+top*s);ctx.lineTo(x+w*asy*s,y+ty*s);ctx.quadraticCurveTo(x+w*.5*s,y+(ty+3)*s,x+w*.1*s,y+(ty+2)*s);ctx.closePath();ctx.fill();});
}
function laubbaum(x,y,s,v){
  shadowE(x+11*s,y+22*s,30*s,10*s);
  ctx.fillStyle='#4e342e';ctx.beginPath();ctx.moveTo(x-4.5*s,y+20*s);ctx.lineTo(x-2.5*s,y-8*s);ctx.lineTo(x+2.5*s,y-8*s);ctx.lineTo(x+4.5*s,y+20*s);ctx.fill();
  ctx.strokeStyle='#4e342e';ctx.lineWidth=2.5*s;ctx.beginPath();ctx.moveTo(x,y-2*s);ctx.lineTo(x-9*s,y-14*s);ctx.moveTo(x,y-5*s);ctx.lineTo(x+8*s,y-16*s);ctx.stroke();
  const pal=v<.33?['#2e6b2a','#3d8a35','#5aa847']:v<.66?['#3a6b1f','#4f8a2a','#72a83f']:['#275e3a','#367d4c','#519c64'];
  const cl=[[0,-24,16],[-14,-16,12],[14,-16,12],[-8,-33,11],[9,-33,11],[0,-12,11],[-17,-26,9],[17,-26,9]];
  ctx.fillStyle=pal[0];for(const[a,b,r] of cl){ctx.beginPath();ctx.arc(x+a*s,y+b*s,r*s,0,TAU);ctx.fill();}
  ctx.fillStyle=pal[1];for(const[a,b,r] of cl){ctx.beginPath();ctx.arc(x+(a-3)*s,y+(b-3)*s,r*.72*s,0,TAU);ctx.fill();}
  ctx.fillStyle=pal[2];for(const[a,b,r] of cl.slice(0,5)){ctx.beginPath();ctx.arc(x+(a-5)*s,y+(b-6)*s,r*.33*s,0,TAU);ctx.fill();}
}
function birke(x,y,s){
  shadowE(x+8*s,y+22*s,18*s,6*s);
  ctx.fillStyle='#eeeeee';ctx.fillRect(x-2.5*s,y-24*s,5*s,46*s);ctx.fillStyle='#333';for(let i=0;i<6;i++)ctx.fillRect(x-2.5*s+(i%2)*2*s,y-20*s+i*7*s,3*s,1.5*s);
  const cl=[[-6,-30,9],[6,-34,9],[0,-42,8],[-9,-20,7],[9,-22,7]];
  ctx.fillStyle='#6a9a3a';for(const[a,b,r] of cl){ctx.beginPath();ctx.arc(x+a*s,y+b*s,r*s,0,TAU);ctx.fill();}
  ctx.fillStyle='#8fbf55';for(const[a,b,r] of cl){ctx.beginPath();ctx.arc(x+(a-2)*s,y+(b-2)*s,r*.55*s,0,TAU);ctx.fill();}
}
function busch(x,y,s,v){
  shadowE(x+5*s,y+8*s,16*s,5*s);
  const c=v>.5?['#2f5e24','#447d30']:['#355f2a','#4b8a3a'];
  for(const[a,b,r] of[[-7,0,8],[7,0,8],[0,-5,9],[0,3,7]]){ctx.fillStyle=c[0];ctx.beginPath();ctx.arc(x+a*s,y+b*s,r*s,0,TAU);ctx.fill();}
  for(const[a,b,r] of[[-8,-3,4],[5,-7,4]]){ctx.fillStyle=c[1];ctx.beginPath();ctx.arc(x+a*s,y+b*s,r*s,0,TAU);ctx.fill();}
  if(v>.8){ctx.fillStyle='#c62828';for(let i=0;i<5;i++){ctx.beginPath();ctx.arc(x+(hash(i,v*99|0)-.5)*18*s,y+(hash(v*99|0,i)-.6)*12*s,1.4*s,0,TAU);ctx.fill();}}
}
function maibaum(x,y){
  shadowE(x+30,y+4,40,5);
  const top=y-118;ctx.save();ctx.beginPath();ctx.rect(x-3.5,top,7,118);ctx.clip();ctx.fillStyle='#fafafa';ctx.fillRect(x-4,top,8,118);
  ctx.fillStyle='#1e6fd0';for(let i=-2;i<16;i++){ctx.beginPath();ctx.moveTo(x-4,top+i*9);ctx.lineTo(x+4,top+i*9-6);ctx.lineTo(x+4,top+i*9-1.5);ctx.lineTo(x-4,top+i*9+4.5);ctx.fill();}ctx.restore();
  ctx.fillStyle='rgba(0,0,0,.18)';ctx.fillRect(x+1,top,2.5,118);
  for(let i=0;i<3;i++){const yy=top+30+i*26,sd=i%2?1:-1;ctx.strokeStyle='#5d4037';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x,yy);ctx.lineTo(x+sd*14,yy);ctx.stroke();
    ctx.fillStyle='#f5f0e0';ctx.fillRect(x+sd*14-(sd<0?12:0),yy-1,12,9);ctx.fillStyle=['#c62828','#1565c0','#2e7d32'][i];ctx.fillRect(x+sd*14-(sd<0?12:0)+3,yy+2,6,4);}
  ctx.strokeStyle='#2e7d32';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(x,top+16,10,3.5,0,0,TAU);ctx.stroke();
  ctx.fillStyle='#1b5e20';ctx.beginPath();ctx.moveTo(x,top-16);ctx.lineTo(x+7,top+2);ctx.lineTo(x-7,top+2);ctx.fill();ctx.fillStyle='#2e7d32';ctx.beginPath();ctx.moveTo(x,top-12);ctx.lineTo(x+4,top);ctx.lineTo(x,top);ctx.fill();
}
function heu(x,y,v){
  shadowE(x+5,y+12,18,6);v=v||0;
  if(v>.55){ctx.fillStyle='#e8e8e8';rrect(x-15,y-12,30,22,4);ctx.fill();ctx.fillStyle='#fafafa';ctx.beginPath();ctx.ellipse(x-15,y-1,6,11,0,0,TAU);ctx.fill();ctx.strokeStyle='#cfcfcf';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(x-15,y-1,3,6,0,0,TAU);ctx.stroke();
    ctx.fillStyle='rgba(0,0,0,.08)';ctx.fillRect(x-10,y+4,25,6);ctx.strokeStyle='#d6d6d6';ctx.beginPath();ctx.moveTo(x-6,y-12);ctx.lineTo(x-4,y+10);ctx.moveTo(x+6,y-12);ctx.lineTo(x+8,y+10);ctx.stroke();return;}
  ctx.fillStyle='#c9a646';rrect(x-15,y-12,30,22,4);ctx.fill();ctx.strokeStyle='#a8892f';ctx.lineWidth=1;for(let i=0;i<6;i++){ctx.beginPath();ctx.moveTo(x-12+i*5,y-11);ctx.lineTo(x-10+i*5,y+9);ctx.stroke();}
  ctx.fillStyle='#dcbb5c';ctx.beginPath();ctx.ellipse(x-15,y-1,6,11,0,0,TAU);ctx.fill();ctx.strokeStyle='#a8892f';ctx.beginPath();for(let r=2;r<10;r+=2.5)ctx.ellipse(x-15,y-1,r*.55,r,0,0,TAU);ctx.stroke();
  ctx.strokeStyle='#e6cb73';ctx.beginPath();ctx.moveTo(x+8,y-12);ctx.lineTo(x+12,y-16);ctx.moveTo(x+2,y-12);ctx.lineTo(x+1,y-17);ctx.stroke();
}
function hochsitz(x,y){
  shadowE(x+12,y+22,26,7);ctx.strokeStyle='#5d4037';ctx.lineWidth=3;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(x-13,y+22);ctx.lineTo(x-9,y-22);ctx.moveTo(x+13,y+22);ctx.lineTo(x+9,y-22);ctx.moveTo(x-12,y+8);ctx.lineTo(x+12,y-10);ctx.moveTo(x+12,y+8);ctx.lineTo(x-12,y-10);ctx.stroke();
  ctx.strokeStyle='#795548';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-5,y+24);ctx.lineTo(x-4,y-20);ctx.moveTo(x+5,y+24);ctx.lineTo(x+4,y-20);for(let i=0;i<6;i++){ctx.moveTo(x-5,y+20-i*7);ctx.lineTo(x+5,y+20-i*7);}ctx.stroke();
  ctx.fillStyle='#795548';ctx.fillRect(x-15,y-44,30,24);ctx.fillStyle='#5d4037';for(let i=0;i<5;i++)ctx.fillRect(x-15,y-42+i*5,30,1);ctx.fillStyle='#1a1a1a';ctx.fillRect(x-10,y-38,20,7);
  ctx.fillStyle='#4e342e';ctx.beginPath();ctx.moveTo(x-19,y-42);ctx.lineTo(x,y-54);ctx.lineTo(x+19,y-42);ctx.fill();ctx.fillStyle='#3e2723';ctx.fillRect(x-19,y-43,38,2);
}
function vogelscheuche(x,y){
  shadowE(x+6,y+22,14,5);ctx.strokeStyle='#6d4c41';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,y+22);ctx.lineTo(x,y-20);ctx.moveTo(x-19,y-9);ctx.lineTo(x+19,y-9);ctx.stroke();
  ctx.fillStyle='#5d4f7a';ctx.beginPath();ctx.moveTo(x-10,y-13);ctx.lineTo(x+10,y-13);ctx.lineTo(x+12,y+8);ctx.lineTo(x-12,y+8);ctx.fill();ctx.fillStyle='#8d6e63';ctx.fillRect(x+2,y-4,6,6);ctx.fillStyle='#c62828';ctx.fillRect(x-8,y+1,5,5);
  ctx.strokeStyle='#e0c060';ctx.lineWidth=1.3;ctx.beginPath();for(const sd of[-1,1]){for(let i=0;i<3;i++){ctx.moveTo(x+sd*19,y-9);ctx.lineTo(x+sd*(22+i*2),y-6+i*3);}}for(let i=-2;i<=2;i++){ctx.moveTo(x+i*3,y+8);ctx.lineTo(x+i*4,y+13);}ctx.stroke();
  ctx.fillStyle='#e8d7a8';ctx.beginPath();ctx.arc(x,y-21,7,0,TAU);ctx.fill();ctx.fillStyle='#333';ctx.fillRect(x-3,y-23,2,2);ctx.fillRect(x+1.5,y-23,2,2);ctx.strokeStyle='#333';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x-3,y-18);ctx.lineTo(x+3,y-18);ctx.stroke();
  ctx.fillStyle='#3e2723';ctx.beginPath();ctx.ellipse(x,y-26,11,3,0,0,TAU);ctx.fill();ctx.fillRect(x-6,y-34,12,8);
}
function traktor(x,y){
  shadowE(x+5,y+18,34,8);
  ctx.fillStyle='#1a1a1a';ctx.beginPath();ctx.arc(x-15,y+5,14,0,TAU);ctx.fill();ctx.fillStyle='#333';for(let i=0;i<12;i++){const a=i/12*TAU;ctx.fillRect(x-15+Math.cos(a)*12-1.5,y+5+Math.sin(a)*12-1.5,3,3);}
  ctx.fillStyle='#fbc02d';ctx.beginPath();ctx.arc(x-15,y+5,6,0,TAU);ctx.fill();ctx.fillStyle='#c49000';ctx.beginPath();ctx.arc(x-15,y+5,2.5,0,TAU);ctx.fill();
  ctx.fillStyle='#2e7d32';ctx.fillRect(x-6,y-6,32,13);ctx.fillStyle='#388e3c';ctx.fillRect(x-6,y-6,32,4);ctx.fillStyle='#1b5e20';for(let i=0;i<4;i++)ctx.fillRect(x+4+i*5,y-3,3,8);
  ctx.fillStyle='#1a1a1a';ctx.beginPath();ctx.arc(x+18,y+10,7.5,0,TAU);ctx.fill();ctx.fillStyle='#fbc02d';ctx.beginPath();ctx.arc(x+18,y+10,3.5,0,TAU);ctx.fill();
  ctx.fillStyle='#2e7d32';ctx.fillRect(x-24,y-28,20,24);ctx.fillStyle='#b3e5fc';ctx.fillRect(x-21,y-25,14,10);ctx.fillStyle='rgba(255,255,255,.5)';ctx.fillRect(x-20,y-24,4,8);
  ctx.fillStyle='#1b5e20';ctx.fillRect(x-26,y-31,24,4);ctx.fillStyle='#424242';ctx.fillRect(x+6,y-20,3,14);ctx.fillStyle='rgba(120,120,120,.4)';ctx.beginPath();ctx.arc(x+8+Math.sin(time*2)*2,y-25,4,0,TAU);ctx.arc(x+11,y-31,5,0,TAU);ctx.fill();
  ctx.fillStyle='#fff9c4';ctx.fillRect(x+24,y-4,3,4);
}
function fenster(x,y,w,h,sh){
  ctx.fillStyle='#f5f5f5';ctx.fillRect(x-2,y-2,w+4,h+4);
  const g=ctx.createLinearGradient(x,y,x+w,y+h);g.addColorStop(0,'#5b7f9a');g.addColorStop(.5,'#2c3e50');g.addColorStop(1,'#1c2833');ctx.fillStyle=g;ctx.fillRect(x,y,w,h);
  ctx.fillStyle='rgba(255,255,255,.25)';ctx.beginPath();ctx.moveTo(x+2,y+h*.7);ctx.lineTo(x+w*.6,y+2);ctx.lineTo(x+w*.8,y+2);ctx.lineTo(x+2,y+h*.95);ctx.fill();
  ctx.fillStyle='#f5f5f5';ctx.fillRect(x+w/2-1,y,2,h);ctx.fillRect(x,y+h*.45,w,2);
  if(sh){for(const sx of[x-2-w*.42,x+w+2]){ctx.fillStyle=sh;ctx.fillRect(sx,y-2,w*.42,h+4);ctx.fillStyle='rgba(0,0,0,.2)';for(let i=2;i<h;i+=4)ctx.fillRect(sx+1,y+i,w*.42-2,1);}}
}
function house(x,y,hs,pX,pY){
  const w=210,hh=140,ox=x+12,oy=y+8,k=hs*1000|0,v1=hash(k,1),v2=hash(k,2),v3=hash(k,3);
  if(pX>ox-14&&pX<ox+w+14&&pY>oy-10&&pY<oy+hh+10)ctx.globalAlpha=.4;
  const roof=[['#9c4030','#b5523f','#6e2c1f'],['#5d4037','#755548','#3e2723'],['#4f5b62','#66757d','#323b40']][Math.floor(v1*3)];
  const wall=['#f7f3ea','#f3e7c9','#efe4d8'][Math.floor(v2*3)],wood=v3>.3,shut=v2>.5?'#2e7d32':'#6d4c41';
  ctx.fillStyle='rgba(0,0,0,.25)';ctx.fillRect(ox+10,oy+hh-3,w+4,12);ctx.fillRect(ox+w,oy+64,12,hh-64);
  // Holzstapel
  ctx.fillStyle='#6d4c41';ctx.fillRect(ox+w+2,oy+hh-34,14,30);ctx.fillStyle='#a1887f';for(let i=0;i<5;i++)for(let j=0;j<2;j++){ctx.beginPath();ctx.arc(ox+w+6+j*6,oy+hh-30+i*6,2.4,0,TAU);ctx.fill();}
  // Mauer
  ctx.fillStyle=wall;ctx.fillRect(ox,oy+62,w,hh-62);
  ctx.fillStyle='rgba(0,0,0,.035)';for(let i=0;i<8;i++){ctx.beginPath();ctx.arc(ox+hash(k,i+10)*w,oy+70+hash(i+10,k)*(hh-80),6+hash(k,i)*8,0,TAU);ctx.fill();}
  if(wood){ctx.fillStyle='#7b5233';ctx.fillRect(ox,oy+62,w,32);ctx.fillStyle='#5d3b22';for(let i=0;i<6;i++)ctx.fillRect(ox,oy+66+i*5,w,1);}
  ctx.fillStyle='#9e9e9e';ctx.fillRect(ox,oy+hh-9,w,9);ctx.fillStyle='#8a8a8a';for(let i=0;i<w;i+=14)ctx.fillRect(ox+i,oy+hh-9,1,9);
  // Fenster
  for(let i=0;i<4;i++){const wx=ox+22+i*50;fenster(wx,oy+68,16,16,wood?null:shut);if(i!==1)fenster(wx-1,oy+106,18,20,shut);}
  // Tür
  const dx=ox+68;ctx.fillStyle='#f5f5f5';ctx.fillRect(dx-3,oy+hh-42,30,33);ctx.fillStyle='#5d3a1e';ctx.beginPath();ctx.moveTo(dx,oy+hh-9);ctx.lineTo(dx,oy+hh-30);ctx.quadraticCurveTo(dx+12,oy+hh-42,dx+24,oy+hh-30);ctx.lineTo(dx+24,oy+hh-9);ctx.fill();
  ctx.strokeStyle='#3e2412';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(dx+12,oy+hh-36);ctx.lineTo(dx+12,oy+hh-9);ctx.stroke();ctx.fillStyle='#ffd54f';ctx.fillRect(dx+15,oy+hh-22,2,3);
  // Bank
  ctx.fillStyle='#6d4c41';ctx.fillRect(ox+130,oy+hh-16,34,4);ctx.fillRect(ox+132,oy+hh-12,2,5);ctx.fillRect(ox+160,oy+hh-12,2,5);
  // Balkon mit Geranien
  ctx.fillStyle='#6d4c41';ctx.fillRect(ox+6,oy+92,w-12,4);ctx.fillStyle='#8d6e63';for(let i=ox+8;i<ox+w-8;i+=6)ctx.fillRect(i,oy+96,3,9);ctx.fillStyle='#6d4c41';ctx.fillRect(ox+6,oy+104,w-12,3);
  ctx.fillStyle='#4e342e';ctx.fillRect(ox+8,oy+86,w-16,6);
  for(let i=0;i<20;i++){const fx=ox+12+i*(w-24)/19;ctx.fillStyle='#2e7d32';ctx.beginPath();ctx.arc(fx,oy+86,3.2,0,TAU);ctx.fill();ctx.fillStyle=i%3?'#e53935':'#d81b60';ctx.beginPath();ctx.arc(fx+1,oy+84+(i%2),2.4,0,TAU);ctx.fill();}
  // Dachschatten auf der Wand
  ctx.fillStyle='rgba(0,0,0,.2)';ctx.fillRect(ox,oy+62,w,7);
  // Dach: hintere und vordere Fläche
  ctx.fillStyle=roof[2];ctx.beginPath();ctx.moveTo(ox+2,oy+18);ctx.lineTo(ox+12,oy-2);ctx.lineTo(ox+w-12,oy-2);ctx.lineTo(ox+w-2,oy+18);ctx.fill();
  ctx.fillStyle=roof[0];ctx.beginPath();ctx.moveTo(ox-16,oy+68);ctx.lineTo(ox+2,oy+18);ctx.lineTo(ox+w-2,oy+18);ctx.lineTo(ox+w+16,oy+68);ctx.fill();
  for(let r=0;r<7;r++){const yy=oy+22+r*7,f=(yy-oy-18)/50,l=ox+2-18*f,rr=ox+w-2+18*f;
    ctx.fillStyle=roof[1];ctx.fillRect(l,yy,rr-l,1.5);ctx.fillStyle=roof[2];ctx.fillRect(l,yy+5,rr-l,1);
    for(let xx=l+(r%2)*6;xx<rr;xx+=12)ctx.fillRect(xx,yy+1.5,1,4);}
  if(v1>.72){ctx.fillStyle='#1a2a44';ctx.fillRect(ox+30,oy+26,70,30);ctx.strokeStyle='#90a4ae';ctx.lineWidth=1;for(let i=0;i<=5;i++){ctx.beginPath();ctx.moveTo(ox+30+i*14,oy+26);ctx.lineTo(ox+30+i*14,oy+56);ctx.stroke();}ctx.beginPath();ctx.moveTo(ox+30,oy+41);ctx.lineTo(ox+100,oy+41);ctx.stroke();}
  ctx.strokeStyle=roof[2];ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(ox+2,oy+18);ctx.lineTo(ox+w-2,oy+18);ctx.stroke();
  ctx.fillStyle='#5d3b22';ctx.beginPath();ctx.moveTo(ox-16,oy+68);ctx.lineTo(ox+w+16,oy+68);ctx.lineTo(ox+w+14,oy+72);ctx.lineTo(ox-14,oy+72);ctx.fill();
  // Kamin mit Rauch
  const kx=ox+w*.72;ctx.fillStyle='#8d6e63';ctx.fillRect(kx,oy+4,14,24);ctx.fillStyle='#5d4037';ctx.fillRect(kx-2,oy+2,18,4);ctx.fillStyle='rgba(0,0,0,.2)';ctx.fillRect(kx+9,oy+6,5,22);
  for(let i=0;i<4;i++){const q=(time*.35+i/4+hs*3)%1;ctx.fillStyle='rgba(225,225,225,'+((1-q)*.45)+')';ctx.beginPath();ctx.arc(kx+7+q*14,oy-q*36,4+q*7,0,TAU);ctx.fill();}
  ctx.globalAlpha=1;
}
function kirche(x,y,pX,pY){
  const ox=x+20,oy=y+20,w=150,hh=110;
  if(pX>ox-10&&pX<ox+w+10&&pY>oy-75&&pY<oy+hh+10)ctx.globalAlpha=.4;
  ctx.fillStyle='rgba(0,0,0,.25)';ctx.fillRect(ox+10,oy+hh-3,w,12);ctx.fillRect(ox+w,oy+48,12,hh-48);
  // Langhaus
  ctx.fillStyle='#f6f1e6';ctx.fillRect(ox+40,oy+46,w-40,hh-46);
  ctx.fillStyle='#e2bd72';for(let i=0;i<4;i++)ctx.fillRect(ox+44+i*34,oy+46,5,hh-46);ctx.fillStyle='#cfa65a';ctx.fillRect(ox+40,oy+hh-8,w-40,8);
  for(let i=0;i<3;i++){const wx=ox+56+i*34;ctx.fillStyle='#e2bd72';ctx.beginPath();ctx.moveTo(wx-3,oy+92);ctx.lineTo(wx-3,oy+64);ctx.arc(wx+7,oy+64,10,Math.PI,0);ctx.lineTo(wx+17,oy+92);ctx.fill();
    ctx.fillStyle='#2c3e50';ctx.beginPath();ctx.moveTo(wx,oy+90);ctx.lineTo(wx,oy+64);ctx.arc(wx+7,oy+64,7,Math.PI,0);ctx.lineTo(wx+14,oy+90);ctx.fill();
    ctx.strokeStyle='#90a4ae';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(wx+7,oy+58);ctx.lineTo(wx+7,oy+90);for(let j=0;j<4;j++){ctx.moveTo(wx,oy+66+j*6);ctx.lineTo(wx+14,oy+66+j*6);}ctx.stroke();}
  // Dach
  ctx.fillStyle='#6e2c1f';ctx.beginPath();ctx.moveTo(ox+38,oy+22);ctx.lineTo(ox+46,oy+6);ctx.lineTo(ox+w-6,oy+6);ctx.lineTo(ox+w+2,oy+22);ctx.fill();
  ctx.fillStyle='#9c4030';ctx.beginPath();ctx.moveTo(ox+30,oy+52);ctx.lineTo(ox+38,oy+22);ctx.lineTo(ox+w+2,oy+22);ctx.lineTo(ox+w+10,oy+52);ctx.fill();
  for(let r=0;r<4;r++){const yy=oy+25+r*7,f=(yy-oy-22)/30,l=ox+38-8*f,rr=ox+w+2+8*f;ctx.fillStyle='#b5523f';ctx.fillRect(l,yy,rr-l,1.3);ctx.fillStyle='#6e2c1f';for(let xx=l+(r%2)*5;xx<rr;xx+=10)ctx.fillRect(xx,yy+1.3,1,4.5);}
  ctx.strokeStyle='#6e2c1f';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(ox+38,oy+22);ctx.lineTo(ox+w+2,oy+22);ctx.stroke();ctx.fillStyle='rgba(0,0,0,.18)';ctx.fillRect(ox+40,oy+52,w-40,5);
  // Turm
  ctx.fillStyle='#fbf7ee';ctx.fillRect(ox,oy+4,44,hh-4);ctx.fillStyle='#e2bd72';ctx.fillRect(ox,oy+4,4,hh-4);ctx.fillRect(ox+40,oy+4,4,hh-4);ctx.fillRect(ox-2,oy+2,48,4);ctx.fillRect(ox-1,oy+40,46,3);ctx.fillStyle='#cfa65a';ctx.fillRect(ox,oy+hh-8,44,8);
  ctx.fillStyle='#e2bd72';ctx.beginPath();ctx.moveTo(ox+12,oy+34);ctx.lineTo(ox+12,oy+18);ctx.arc(ox+22,oy+18,10,Math.PI,0);ctx.lineTo(ox+32,oy+34);ctx.fill();
  ctx.fillStyle='#263238';ctx.beginPath();ctx.moveTo(ox+14,oy+33);ctx.lineTo(ox+14,oy+18);ctx.arc(ox+22,oy+18,8,Math.PI,0);ctx.lineTo(ox+30,oy+33);ctx.fill();ctx.fillStyle='#455a64';for(let j=0;j<4;j++)ctx.fillRect(ox+14,oy+20+j*3.5,16,1.4);
  ctx.fillStyle='#e2bd72';ctx.beginPath();ctx.arc(ox+22,oy+56,10,0,TAU);ctx.fill();ctx.fillStyle='#fafafa';ctx.beginPath();ctx.arc(ox+22,oy+56,8,0,TAU);ctx.fill();
  ctx.fillStyle='#333';for(let i=0;i<12;i++){const a=i/12*TAU;ctx.fillRect(ox+22+Math.cos(a)*6.5-.6,oy+56+Math.sin(a)*6.5-.6,1.2,1.2);}
  ctx.strokeStyle='#222';ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(ox+22,oy+56);ctx.lineTo(ox+22,oy+50.5);ctx.moveTo(ox+22,oy+56);ctx.lineTo(ox+26,oy+57.5);ctx.stroke();
  ctx.fillStyle='#e2bd72';ctx.beginPath();ctx.moveTo(ox+9,oy+hh-8);ctx.lineTo(ox+9,oy+hh-26);ctx.arc(ox+22,oy+hh-26,13,Math.PI,0);ctx.lineTo(ox+35,oy+hh-8);ctx.fill();
  ctx.fillStyle='#5d3a1e';ctx.beginPath();ctx.moveTo(ox+12,oy+hh-8);ctx.lineTo(ox+12,oy+hh-26);ctx.arc(ox+22,oy+hh-26,10,Math.PI,0);ctx.lineTo(ox+32,oy+hh-8);ctx.fill();ctx.strokeStyle='#3e2412';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(ox+22,oy+hh-36);ctx.lineTo(ox+22,oy+hh-8);ctx.stroke();
  // Zwiebelhaube
  ctx.fillStyle='#e2bd72';ctx.fillRect(ox+6,oy-4,32,7);
  ctx.fillStyle='#3f8f7f';ctx.beginPath();ctx.moveTo(ox+7,oy-3);ctx.bezierCurveTo(ox-8,oy-14,ox+4,oy-28,ox+22,oy-36);ctx.bezierCurveTo(ox+40,oy-28,ox+52,oy-14,ox+37,oy-3);ctx.closePath();ctx.fill();
  ctx.fillStyle='#5fb3a0';ctx.beginPath();ctx.moveTo(ox+9,oy-4);ctx.bezierCurveTo(ox,oy-14,ox+8,oy-26,ox+20,oy-33);ctx.bezierCurveTo(ox+12,oy-24,ox+10,oy-14,ox+15,oy-4);ctx.fill();
  ctx.fillStyle='#2d6e61';ctx.beginPath();ctx.moveTo(ox+35,oy-4);ctx.bezierCurveTo(ox+46,oy-14,ox+38,oy-26,ox+26,oy-33);ctx.bezierCurveTo(ox+32,oy-24,ox+34,oy-14,ox+30,oy-4);ctx.fill();
  ctx.fillStyle='#3f8f7f';ctx.fillRect(ox+19,oy-46,6,11);ctx.beginPath();ctx.arc(ox+22,oy-48,4.5,0,TAU);ctx.fill();
  ctx.fillStyle='#ffd54f';ctx.beginPath();ctx.arc(ox+22,oy-55,3,0,TAU);ctx.fill();ctx.fillRect(ox+21,oy-70,2,14);ctx.fillRect(ox+17,oy-65,10,2);
  ctx.globalAlpha=1;
}
function biertisch(x,y){shadowE(x+6,y+18,26,8);
  ctx.fillStyle='#8d6e63';ctx.fillRect(x-24,y-4,48,10);ctx.fillStyle='#6d4c41';ctx.fillRect(x-24,y-14,48,5);ctx.fillRect(x-24,y+12,48,5);
  ctx.fillStyle='#ffca28';ctx.fillRect(x-10,y-3,5,6);ctx.fillRect(x+6,y-2,5,6);
  ctx.strokeStyle='#5d4037';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y-30);ctx.stroke();
  for(let i=0;i<8;i++){ctx.fillStyle=i%2?'#1e88e5':'#fff';ctx.beginPath();ctx.moveTo(x,y-32);ctx.arc(x,y-32,22,i/8*TAU,(i+1)/8*TAU);ctx.fill();}}
function ente(x,y,tx){const b=Math.sin(time*2+tx)*2;ctx.fillStyle='#ffffff22';ctx.beginPath();ctx.ellipse(x,y+5,14,4,0,0,TAU);ctx.fill();
  ctx.fillStyle='#8d6e63';ctx.beginPath();ctx.ellipse(x,y+b,10,6,0,0,TAU);ctx.fill();
  ctx.fillStyle='#2e7d32';ctx.beginPath();ctx.arc(x+8,y-5+b,4.5,0,TAU);ctx.fill();ctx.fillStyle='#ffa000';ctx.fillRect(x+11,y-5+b,5,2.5);}
function schilf(x,y,k){
  k=k||0;const n=8+Math.floor(hash(k,3)*7);
  ctx.strokeStyle='#7c9a3a';ctx.lineWidth=2.2;for(let j=0;j<2;j++){const dx=(hash(k,j+20)-.5)*16,d=j?1:-1;ctx.beginPath();ctx.moveTo(x+dx,y+10);ctx.quadraticCurveTo(x+dx+d*6,y-6,x+dx+d*15+Math.sin(time*1.4+j)*2,y-1);ctx.stroke();}
  for(let i=0;i<n;i++){const dx=(hash(k,i)-.5)*26,h=18+hash(i,k)*24,sw=Math.sin(time*1.6+i*.7+x*.01)*3*(h/30),lean=(hash(k+1,i)-.5)*9;
    ctx.strokeStyle=['#a89a4a','#6f8a32','#879b3c','#9aa84a'][i%4];ctx.lineWidth=1.5;
    ctx.beginPath();ctx.moveTo(x+dx,y+10);ctx.quadraticCurveTo(x+dx+lean*.5,y+10-h*.5,x+dx+lean+sw,y+10-h);ctx.stroke();
    if(i%4===0){ctx.fillStyle='#5d3a1e';ctx.beginPath();ctx.ellipse(x+dx+lean*.8+sw*.8,y+10-h*.8,2,4.8,lean*.03,0,TAU);ctx.fill();}}
}
function fels(x,y,s){shadowE(x+6,y+10,22*s,7*s);ctx.fillStyle='#8a8f94';ctx.beginPath();ctx.moveTo(x-20*s,y+8);ctx.lineTo(x-12*s,y-12*s);ctx.lineTo(x+4*s,y-18*s);ctx.lineTo(x+20*s,y-4*s);ctx.lineTo(x+16*s,y+8);ctx.fill();
  ctx.fillStyle='#a5aaaf';ctx.beginPath();ctx.moveTo(x-12*s,y-12*s);ctx.lineTo(x+4*s,y-18*s);ctx.lineTo(x+2*s,y-4*s);ctx.fill();}
function kuh(x,y,h){const sw=Math.sin(time*.8+h*20)*2;shadowE(x+4,y+14,22,6);
  ctx.fillStyle='#fafafa';ctx.beginPath();ctx.ellipse(x,y,20,12,0,0,TAU);ctx.fill();
  ctx.fillStyle='#333';ctx.beginPath();ctx.arc(x-6,y-3,5,0,TAU);ctx.arc(x+8,y+4,4,0,TAU);ctx.fill();
  ctx.fillStyle='#fafafa';ctx.beginPath();ctx.ellipse(x+21,y-4+sw,8,6,0,0,TAU);ctx.fill();ctx.fillStyle='#f8bbd0';ctx.beginPath();ctx.ellipse(x+27,y-3+sw,4,3.5,0,0,TAU);ctx.fill();
  ctx.fillStyle='#ffd54f';ctx.beginPath();ctx.arc(x+18,y+4+sw,3,0,TAU);ctx.fill();
  ctx.strokeStyle='#333';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-20,y);ctx.lineTo(x-26,y+6+sw);ctx.stroke();}
function leitpfosten(x,y){ctx.fillStyle='#0003';ctx.fillRect(x+1,y,5,2);ctx.fillStyle='#f5f5f5';ctx.fillRect(x-1.5,y-11,3.5,11);ctx.fillStyle='#212121';ctx.fillRect(x-1.5,y-9,3.5,2.5);ctx.fillStyle='#ff8f00';ctx.fillRect(x-.5,y-8.6,1.5,1.6);}
  return { setzeZeit(t) { time = t; }, hash, vnoise, shadowE, rrect, fichte, laubbaum, birke, busch, maibaum, heu, hochsitz, vogelscheuche, traktor, fenster, house, kirche, biertisch, ente, schilf, fels, kuh, leitpfosten };
}
