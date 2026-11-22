import re
from lb_common import *
def read_gml(name):
    s=open(B+f'basisdlm/{name}.gml',encoding='utf8').read()
    out=[]
    for m in re.finditer(r'<%s gml:id="([^"]+)">(.*?)</%s>'%(name,name),s,re.S):
        b=m.group(2)
        pl=re.search(r'<gml:posList>([^<]*)</gml:posList>',b)
        if not pl: continue
        v=np.array(pl.group(1).split(),float).reshape(-1,2)
        a={k:v_ for k,v_ in re.findall(r'<(\w+)(?: uom="m")?>([^<>]+)</\1>',b) if k not in('beginnt','advStandardModell')}
        out.append((m.group(1),v,a))
    return out
