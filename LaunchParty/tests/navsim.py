# Python port of the bot navigation in BotService/ArenaService. Run: python3 tests/navsim.py
# Simulates bots walking to random spots on every arena shape (with crumbling) and counts walk-offs.
import math, random
from collections import deque
R, T = 46, 7
SHAPES = {
 "Disc": lambda x,z: x*x+z*z <= R*R,
 "Cross": lambda x,z: (abs(x)<=R*0.36 or abs(z)<=R*0.36) and max(abs(x),abs(z))<=R,
 "Donut": lambda x,z: R*0.32 <= math.hypot(x,z) <= R,
 "Twin": lambda x,z: (x+R*0.5)**2+z*z <= (R*0.48)**2 or (x-R*0.5)**2+z*z <= (R*0.48)**2 or (abs(z)<=4 and abs(x)<=R*0.5),
}
def rnd(v): return math.floor(v+0.5) if v>=0 else -math.floor(-v+0.5)
class Arena:
    def __init__(s, shape):
        n=math.ceil(R/T); s.grid={}
        for gx in range(-n,n+1):
            for gz in range(-n,n+1):
                if SHAPES[shape](gx*T,gz*T): s.grid[(gx,gz)]=True
    def coords(s,p): return rnd(p[0]/T), rnd(p[1]/T)
    def solid(s,gx,gz): return s.grid.get((gx,gz),False)
    def has_floor(s,p): return s.solid(*s.coords(p))
    def openness(s,p):
        gx,gz=s.coords(p); return sum(1 for dx in(-1,0,1) for dz in(-1,0,1) if (dx or dz) and s.solid(gx+dx,gz+dz))
    def tiles(s): return [ (gx*T,gz*T) for (gx,gz),a in s.grid.items() if a]
    def nearest(s,p):
        t=s.tiles(); return min(t,key=lambda q:(q[0]-p[0])**2+(q[1]-p[1])**2) if t else None
    def safest(s,p):
        t=s.tiles(); return max(t,key=lambda q:s.openness(q)*10-math.hypot(q[0]-p[0],q[1]-p[1])*0.3) if t else None
    def path(s,a,b):
        sx,sz=s.coords(a)
        if not s.solid(sx,sz):
            n=s.nearest(a); sx,sz=s.coords(n)
        tx,tz=s.coords(b)
        if not s.solid(tx,tz):
            n=s.nearest(b); tx,tz=s.coords(n)
        if (sx,sz)==(tx,tz): return [(tx*T,tz*T)]
        came={(sx,sz):None}; q=deque([(sx,sz)])
        while q:
            x,z=q.popleft()
            for dx,dz in [(1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1)]:
                nx,nz=x+dx,z+dz
                if (nx,nz) not in came and s.solid(nx,nz) and (dx==0 or dz==0 or (s.solid(x+dx,z) and s.solid(x,z+dz))):
                    came[(nx,nz)]=(x,z)
                    if (nx,nz)==(tx,tz):
                        out=[]; c=(nx,nz)
                        while c!=(sx,sz): out.insert(0,(c[0]*T,c[1]*T)); c=came[c]
                        return out
                    q.append((nx,nz))
        return None
def add(a,b,k=1): return (a[0]+b[0]*k, a[1]+b[1]*k)
def sub(a,b): return (a[0]-b[0], a[1]-b[1])
def mag(v): return math.hypot(*v)
def unit(v): m=mag(v); return (v[0]/m,v[1]/m)
def dot(a,b): return a[0]*b[0]+a[1]*b[1]
def safe_dir(A,p,d,reach): return A.has_floor(add(p,d,2)) and A.has_floor(add(p,d,reach)) and A.has_floor(add(p,d,reach+2.5))
def steer(A,p,desired,heat):
    reach=3.5+min(max(heat/100,0),1.5)*1.5
    if safe_dir(A,p,desired,reach): return desired
    best=None; bs=-1e9
    for i in range(16):
        a=i/16*2*math.pi; d=(math.cos(a),math.sin(a))
        if safe_dir(A,p,d,reach):
            sc=dot(d,desired)+A.openness(add(p,d,reach))*0.05
            if sc>bs: best,bs=d,sc
    return best
def line_floor(A,a,b):
    off=sub(b,a); L=mag(off)
    if L<0.1: return True
    d=unit(off); x=1.5
    while x<=L:
        if not A.has_floor(add(a,d,x)): return False
        x+=1.5
    return True
def walk_dir(A,p,goal,heat):
    wp=goal
    if not line_floor(A,p,goal):
        path=A.path(p,goal)
        if path:
            wp=path[0]
            for q in path[1:4]:
                if line_floor(A,p,q): wp=q
                else: break
    des=sub(wp,p)
    if mag(des)<0.75: return (0,0)
    d=steer(A,p,unit(des),heat)
    return d or (0,0)

random.seed(1)
STEP=16*0.1  # walk speed * tick
for shape in SHAPES:
    falls=0; reached=0; trials=400
    for t in range(trials):
        A=Arena(shape); tiles=A.tiles()
        p=random.choice(tiles); p=(p[0]+random.uniform(-2.5,2.5), p[1]+random.uniform(-2.5,2.5))
        goal=random.choice(tiles); heat=random.choice([0,60,150])
        crumble = t%2==0  # half the trials: outer ring crumbles mid-walk
        for tick in range(300):
            if crumble and tick in (40,80,120):
                alive=[k for k,a in A.grid.items() if a]
                if len(alive)>8:
                    far=max(math.hypot(k[0]*T,k[1]*T) for k in alive)
                    for k in alive:
                        if math.hypot(k[0]*T,k[1]*T)>=far-T*0.6: A.grid[k]=False
                    if not A.has_floor(goal): goal=A.safest(goal)
            if not A.has_floor(p):
                # mirrors think() step 1: walk back to nearest solid tile (counts as a near-miss, not a fall)
                n=A.nearest(p); d=unit(sub(n,p)); p=add(p,d,STEP)
                # a real fall = more than ~2 studs past the floor edge (root outside the tile + body width)
                gx,gz=A.coords(p); cx,cz=gx*T,gz*T
                if not A.has_floor(p) and min(math.hypot(p[0]-q[0],p[1]-q[1]) for q in A.tiles())>T/2+2:
                    falls+=1; break
                continue
            d=walk_dir(A,p,goal,heat)
            p=add(p,d,STEP)
            if mag(sub(goal,p))<2: reached+=1; break
    print(f"{shape:6s}: walked off {falls}/{trials}, reached goal {reached}/{trials}")
