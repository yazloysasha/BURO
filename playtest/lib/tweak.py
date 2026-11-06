# one-off balance edits: python3 playtest/lib/tweak.py 'pep.def=1' ...
import json,sys,re
c=json.load(open('data/cats.json',encoding='utf8'))
b=json.load(open('data/balance.json'))
e_s=open('data/enemies.json',encoding='utf8').read()
for arg in sys.argv[1:]:
    k,v=arg.split('=');v=float(v);v=int(v) if v==int(v) else v
    if k.startswith('pep.') or k.startswith('dud.'):
        cat=c['peposya' if k[:3]=='pep' else 'dudonya']; f=k[4:]
        if f in cat['stats']: cat['stats'][f]=v
        else:
            a,fld=f.split('_'); cat['actions'][a][fld]=v
    elif k.startswith('boss.'):
        f=k[5:]; e_s,n=re.subn(r'("id": "klobster_king".*?"%s": )[\d.]+'%f, lambda m:m.group(1)+str(v), e_s, count=1, flags=re.S); assert n==1
    else:
        p=k.split('.'); o=b
        for x in p[:-1]: o=o[x]
        o[p[-1]]=v
json.dump(b,open('data/balance.json','w'),ensure_ascii=False,indent=2);open('data/balance.json','a').write('\n')
s=json.dumps(c,ensure_ascii=False,indent=2);open('data/cats.json','w',encoding='utf8').write(s+'\n')
open('data/enemies.json','w',encoding='utf8').write(e_s)
