import * as THREE from 'three';

/** Workspace grid is intentionally omitted from exported layout references. */
export function createTrainScene(withGround = false): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f0f1f5');
  scene.add(new THREE.HemisphereLight('#ffffff', '#777e88', 2));
  const key = new THREE.DirectionalLight('#ffffff', 2.4);
  key.position.set(-8, 16, 10); scene.add(key);
  const fill = new THREE.DirectionalLight('#e1e7ed', 1);
  fill.position.set(8, 8, -10); scene.add(fill);
  if (withGround) {
    const grid = new THREE.GridHelper(180, 90, '#dce0e7', '#e1e4eb');
    grid.name = 'workspace-ground'; grid.position.y = -.06;
    grid.material.transparent = true; grid.material.opacity = .5;
    scene.add(grid);
  }
  return scene;
}
