import * as T from 'three';
import { GRAYS, sampleTrainSurface, type Layout3DConfig, type Region } from './layout3d';
import { referencePoint, sideAngle, referenceWindscreenHalfAngle, referenceNosePaintEdges, REFERENCE_LENGTH_SCALE as SX, REFERENCE_DOORS, REFERENCE_WINDOWS } from './referenceTrainProfile';

const bogies = [-11.5, -2.3, 2.35, 12.9];
const material = (color: string, roughness = .4, metalness = .15) => new T.MeshStandardMaterial({ color, roughness, metalness, side: T.DoubleSide });
const outlineMaterial = () => new T.LineBasicMaterial({ color: '#7a8288', transparent: true, opacity: .65 });

function surfaceMesh(points: number[], indices: number[], mat: T.Material, name: string): T.Mesh {
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(points, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh = new T.Mesh(geometry, mat); mesh.name = name; return mesh;
}

function body(start: number, end: number, config: Layout3DConfig, selected?: Region): T.Mesh {
  const points: number[] = [], indices: number[] = [], colors: number[] = [];
  const lineWidth = { thin: .055, medium: .085, wide: .12 }[config.waist.width];
  const boundaries = [1.18, 1.52, 2.05, 2.2, 2.64, 3.05, 3.13, 3.63-.58/3,
    ...[1.72, 1.92].flatMap(y => [y-lineWidth/2, y+lineWidth/2])];
  const angles = Array.from({ length: 129 }, (_, j) => j*Math.PI*2/128);
  for (const y of [1.72,1.82,1.92,...boundaries.flatMap(y=>[y-.0015,y+.0015])]) {
    const a = sideAngle(5,y); angles.push(a,2*Math.PI-a);
  }
  angles.sort((a,b)=>a-b);
  const nx = 400, nr = angles.length + 12;
  const palette = Object.fromEntries(Object.entries(GRAYS).map(([key,value])=>[key,new T.Color(value)]));
  const selection = new T.Color('#90aec0');
  for (let i=0;i<=nx;i++) {
    const x = start+(end-start)*i/nx;
    // Transport contour samples along every row so the paint edge follows triangles,
    // rather than stepping diagonally between a fixed set of cross-section angles.
    const edges = referenceNosePaintEdges(x,config.roofSide,config.lowerSide);
    const rowAngles = [...angles];
    for(const edge of [edges.upper,edges.lower,edges.bottom])for(const delta of [-.0015,.0015]){
      const a=sideAngle(5,edge+delta);rowAngles.push(a,2*Math.PI-a);
    }
    rowAngles.sort((a,b)=>a-b);
    for (let j=0;j<nr;j++) {
      const p = referencePoint(x,rowAngles[j]); points.push(...p);
      const sample = sampleTrainSurface(config,x,p[1],p[2]);
      const color = palette[sample.paint].clone();
      if (sample.region === selected) color.lerp(selection,.25);
      colors.push(color.r,color.g,color.b);
      if (i<nx && j<nr-1) {
        const nextX = x+(end-start)/nx;
        const mid = referencePoint((x+nextX)/2,(rowAngles[j]+rowAngles[j+1])/2);
        // Real skirt cut-outs expose bogies; don't paint across the wheels.
        const opening = bogies.some(b=>Math.abs(x-b)<.99) && mid[1]<1.08 && Math.abs(mid[2])>.8;
        if (!opening) { const a=i*nr+j,b=a+nr; indices.push(a,a+1,b+1,a,b+1,b); }
      }
    }
  }
  const mesh=surfaceMesh(points,indices,new T.MeshStandardMaterial({vertexColors:true,roughness:.32,metalness:.18,side:T.DoubleSide}),start<0?'头车':'普通车厢');
  mesh.geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3)); mesh.userData.trainBody=true;
  return mesh;
}

/** Curved patch, parametrized by longitudinal position and cross-section angle. */
function patch(group:T.Group,name:string,x0:number,x1:number,angle:(u:number,v:number)=>number,mat:T.Material,offset=.018) {
  const positions:number[]=[],indices:number[]=[]; const nu=40,nv=24;
  for(let i=0;i<=nu;i++)for(let j=0;j<=nv;j++){
    positions.push(...referencePoint(x0+(x1-x0)*i/nu,angle(i/nu,j/nv),offset));
    if(i<nu&&j<nv){const a=i*(nv+1)+j,b=a+nv+1;indices.push(a,a+1,b+1,a,b+1,b);}
  }
  const mesh=surfaceMesh(positions,indices,mat,name);group.add(mesh);return mesh;
}
function line(group:T.Group,name:string,points:T.Vector3[],mat:T.LineBasicMaterial) {
  const item=new T.Line(new T.BufferGeometry().setFromPoints(points),mat);item.name=name;group.add(item);
}
function roundedContour(cx:number,cy:number,w:number,h:number,r:number):T.Vector2[] {
  const result:T.Vector2[]=[];
  for(const [dx,dy,base] of [[1,1,0],[-1,1,90],[-1,-1,180],[1,-1,270]]){
    for(let k=0;k<=8;k++){const a=(base+k*90/8)*Math.PI/180;
      result.push(new T.Vector2(cx+dx*(w/2-r)+Math.cos(a)*r,cy+dy*(h/2-r)+Math.sin(a)*r));}
  }
  return result;
}
function sidePanel(group:T.Group,name:string,contour:T.Vector2[],sign:number,mat:T.Material|null,stroke:T.LineBasicMaterial,offset=.022) {
  // Subdivide in the panel's drawing plane, then project every vertex onto the shell.
  // Triangulating only the outline creates long chords that cut through a curved cab.
  if(mat){
    const positions:number[]=[], indices:number[]=[];
    const triangle=(a:T.Vector2,b:T.Vector2,c:T.Vector2)=>{
      if(Math.max(a.distanceTo(b),b.distanceTo(c),c.distanceTo(a))>.07){
        const ab=a.clone().lerp(b,.5),bc=b.clone().lerp(c,.5),ca=c.clone().lerp(a,.5);
        triangle(a,ab,ca);triangle(ab,b,bc);triangle(ca,bc,c);triangle(ab,bc,ca);return;
      }
      const start=positions.length/3;
      for(const p of [a,b,c])positions.push(...referencePoint(p.x,sign*sideAngle(p.x,p.y),offset));
      indices.push(start,start+1,start+2);
    };
    for(const [a,b,c] of T.ShapeUtils.triangulateShape(contour,[]))triangle(contour[a],contour[b],contour[c]);
    group.add(surfaceMesh(positions,indices,mat,name));
  }
  const border=contour.flatMap((a,i)=>{
    const b=contour[(i+1)%contour.length], count=Math.max(1,Math.ceil(a.distanceTo(b)/.04));
    return Array.from({length:count},(_,j)=>{
      const p=a.clone().lerp(b,j/count);return new T.Vector3(...referencePoint(p.x,sign*sideAngle(p.x,p.y),offset+.004));
    });
  });
  border.push(border[0].clone());line(group,name,border,stroke);
}

function details(group:T.Group) {
  const glass=material('#273540',.19,.4), rubber=material('#202930',.58), metal=material('#6c777f',.35,.55);
  const seam=outlineMaterial(), darkLine=new T.LineBasicMaterial({color:'#283039'});
  // Continuous windscreen roof fairing with tapered, rounded-looking ends.
  patch(group,'风挡外框',-13.95,-10.6,(u,v)=>{
    const half=.20+.44*Math.sin(Math.PI*Math.pow(u,.75))**.45;
    return (v*2-1)*half;
  },rubber,.025);
  patch(group,'驾驶室风挡',-13.83,-11.12,(u,v)=>{
    const half=referenceWindscreenHalfAngle(u);
    return (v*2-1)*half;
  },glass,.042);
  // Wiper lies on the windscreen rather than floating in front of the nose.
  line(group,'雨刷',[-13.65,-13.1,-12.5].map((x,i)=>new T.Vector3(...referencePoint(x,.08+i*.07,.065))),darkLine);
  for(const sign of [-1,1]){
    sidePanel(group,'驾驶室侧窗',[
      new T.Vector2(-13.05,2.39),new T.Vector2(-11.95,2.85),new T.Vector2(-11.87,2.63),
      new T.Vector2(-12.06,2.42),new T.Vector2(-12.66,2.21),new T.Vector2(-12.94,2.25),
    ],sign,glass,darkLine);
    // Paired upper shoulder light clusters, separate from all editable paint.
    patch(group,'灯组',-14.08,-13.48,(u,v)=>sign*(.82+v*.23+.06*Math.sin(u*Math.PI)),rubber,.03);
    patch(group,'灯组灯罩',-14.03,-13.53,(_u,v)=>sign*(.845+v*.17),material('#c4d3df',.16,.48),.05);
    for(const x of REFERENCE_WINDOWS){
      const width=x===-2.65?.37:.79;
      sidePanel(group,'客窗',roundedContour(x,2.64,width,.54,.065),sign,glass,darkLine);
    }
    for(const x of REFERENCE_DOORS){
      sidePanel(group,'门框',roundedContour(x,2.16,.58,1.94,.045),sign,null,seam);
      sidePanel(group,'车门玻璃',roundedContour(x,2.65,.25,.57,.115),sign,glass,darkLine);
      sidePanel(group,'门把手',roundedContour(x+.19,1.98,.04,.15,.013),sign,metal,seam,.033);
    }
    // Lower fairing seams, equipment vents, and local wheel arch frames.
    for(const [a,b] of [[-13.45,-.38],[.38,14.98]]){
      line(group,'裙板分缝',Array.from({length:180},(_,i)=>{
        const x=a+(b-a)*i/179;return new T.Vector3(...referencePoint(x,sign*sideAngle(x,1.18),.017));
      }),seam);
    }
    for(const x of [-9.4,-7.6,-5.8,-4.2,4.6,6.7,8.8,10.5]){
      line(group,'检修板接缝',[.80,1.16].map(y=>new T.Vector3(...referencePoint(x,sign*sideAngle(x,y),.018))),seam);
      for(let j=0;j<5;j++)line(group,'散热格栅',[x+.15,x+.58].map(s=>new T.Vector3(...referencePoint(s,sign*sideAngle(s,.9+j*.038),.025))),seam);
    }
  }
  // Nose end cover is a surface-following outline around the rounded front.
  for(const sign of [-1,1])line(group,'鼻端盖板',Array.from({length:80},(_,i)=>{
    const t=i/79, x=-14.91+.72*Math.sin(Math.PI*t);
    return new T.Vector3(...referencePoint(x,sign*(.30+t*2.46),.025));
  }),seam);

  for(const x of bogies){
    const bogie=new T.Group();bogie.name='转向架';group.add(bogie);
    const frame=new T.Mesh(new T.BoxGeometry(2.7,.22,1.95),rubber);frame.position.set(x*SX,.62,0);bogie.add(frame);
    for(const dx of [-.57,.57]){
      const axle=new T.Mesh(new T.CylinderGeometry(.095,.095,2.48,16),metal);axle.rotation.x=Math.PI/2;axle.position.set((x+dx)*SX,.40,0);bogie.add(axle);
      for(const z of [-1.08,1.08]){
        const wheel=new T.Mesh(new T.CylinderGeometry(.38,.38,.18,32),rubber);wheel.rotation.x=Math.PI/2;wheel.position.set((x+dx)*SX,.40,z);bogie.add(wheel);
        const hub=new T.Mesh(new T.CylinderGeometry(.22,.22,.19,24),metal);hub.rotation.x=Math.PI/2;hub.position.copy(wheel.position);bogie.add(hub);
      }
    }
    for(const z of [-.93,.93])for(const dx of [-.24,.24]){
      const spring=new T.Mesh(new T.CylinderGeometry(.13,.13,.24,12),metal);spring.position.set((x+dx)*SX,.83,z);bogie.add(spring);
    }
  }
  for(let i=0;i<11;i++){
    const ring=new T.Mesh(new T.BoxGeometry(.05,2.62,2.73),i%2?rubber:material('#444b50',.7));ring.position.set(-.48+i*.096,2.14,0);ring.name='车厢连接风挡';group.add(ring);
  }
  for(const x of [-.35,.35,15]){
    const positions:number[]=[];const indices:number[]=[];
    positions.push(x*SX,2.2,0);
    for(let j=0;j<=128;j++)positions.push(...referencePoint(x,j*2*Math.PI/128));
    for(let j=1;j<=128;j++)indices.push(0,j,j+1);
    group.add(surfaceMesh(positions,indices,material('#e4e6e6'),'车厢端面'));
  }
}
export function buildReferenceTrain(config:Layout3DConfig,selected?:Region):T.Group {
  const group=new T.Group();group.name='参考图重建 · 两节高铁';
  group.add(body(-15,-.35,config,selected),body(.35,15,config,selected));
  details(group);return group;
}
