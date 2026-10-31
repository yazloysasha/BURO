from PIL import Image, ImageDraw
import sys
def grid(files,dst,labels=None,cols=10,k=5,size=16):
  rows=(len(files)+cols-1)//cols; W=size*k+8; H=size*k+18
  out=Image.new('RGBA',(cols*W,rows*H),(60,60,80,255)); d=ImageDraw.Draw(out)
  for n,f in enumerate(files):
    im=Image.open(f).convert('RGBA'); im=im.resize((im.width*k,im.height*k),Image.NEAREST)
    x=(n%cols)*W; y=(n//cols)*H; out.alpha_composite(im,(x+4,y+2)); d.text((x+4,y+size*k+4),str(labels[n] if labels else n),fill='white')
  out.save(dst)
