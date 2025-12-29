import * as THREE from 'three';
import { MeasurementSystem } from './MeasurementSystem';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf8fafc);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(6, 6, 6);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

scene.add(new THREE.GridHelper(20, 20));

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

const system = MeasurementSystem.createReference();
system.init({ scene, camera });
system.activate();

window.addEventListener('mousemove', e => {
  mouse.x = (e.clientX / innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const p = raycaster.ray.at(10, new THREE.Vector3());
  system.handleMouseMove(p);
});

window.addEventListener('click', (e) => {
  raycaster.setFromCamera(mouse, camera);
  const p = raycaster.ray.at(10, new THREE.Vector3());
  system.handleClick(p, e.shiftKey, e.ctrlKey);
});

window.addEventListener('keydown', e => {
  if (e.key === 'Escape') system.cancelMeasurement();
});

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();
