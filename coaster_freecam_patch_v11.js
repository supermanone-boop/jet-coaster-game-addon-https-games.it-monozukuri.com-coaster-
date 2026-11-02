// 走行画面専用の自由カメラ。ドラッグで見回し、ボタンを押している間カメラを移動する。
const freeCamState = {
  pos: new THREE.Vector3(), yaw: 0, pitch: 0, speed: 40,
  move: { forward: false, back: false, left: false, right: false, up: false, down: false },
  drag: null,
};
const freeCamStyle = document.createElement('style');
freeCamStyle.textContent = `
#rc-free-camera{position:fixed;right:10px;bottom:max(84px,env(safe-area-inset-bottom));z-index:2147483645;width:min(264px,calc(100vw - 20px));box-sizing:border-box;padding:10px;border:1px solid #64748b;border-radius:12px;background:rgba(15,23,42,.94);color:#fff;box-shadow:0 5px 24px #0007;font:12px/1.35 system-ui,sans-serif;touch-action:manipulation}
#rc-free-camera[hidden]{display:none!important}
#rc-free-camera button{min-height:34px;border:1px solid #94a3b8;border-radius:7px;background:#f8fafc;color:#172033;font:700 12px system-ui,sans-serif;padding:5px 8px;touch-action:none}
#rc-free-camera .rc-fc-top{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:7px}
#rc-free-camera .rc-fc-look{height:52px;display:grid;place-items:center;margin-bottom:7px;border:1px dashed #94a3b8;border-radius:8px;background:rgba(148,163,184,.18);color:#fff;text-align:center;user-select:none;-webkit-user-select:none;touch-action:none}
#rc-free-camera .rc-fc-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}
#rc-free-camera .rc-fc-grid button{width:100%}
#rc-free-camera .rc-fc-speed{display:flex;align-items:center;gap:8px;margin-top:8px}
#rc-free-camera input{width:100%;min-width:0}
#rc-free-camera .rc-fc-speed output{min-width:54px;text-align:right;font-variant-numeric:tabular-nums}
#rc-free-camera .rc-fc-help{margin:7px 0 0;color:#cbd5e1;font-size:11px}
`;
document.head.appendChild(freeCamStyle);
const freeCamPanel = document.createElement('section');
freeCamPanel.id = 'rc-free-camera';
freeCamPanel.hidden = true;
freeCamPanel.innerHTML = `
<div class="rc-fc-top"><b>自由カメラ</b><button type="button" data-fc-action="auto">自動カメラへ戻る</button></div>
<div class="rc-fc-look" data-fc-look>ここをドラッグして見回す</div>
<div class="rc-fc-grid">
  <button type="button" data-fc-move="forward">前進 ↑</button>
  <button type="button" data-fc-move="up">上昇 +</button>
  <button type="button" data-fc-move="back">後退 ↓</button>
  <button type="button" data-fc-move="left">左 ←</button>
  <button type="button" data-fc-action="reset">車両付近へ</button>
  <button type="button" data-fc-move="right">右 →</button>
  <button type="button" data-fc-move="down">下降 −</button>
</div>
<label class="rc-fc-speed">移動速度 <input type="range" min="1" max="250" value="40" data-fc-speed><output data-fc-speed-label>40 m/s</output></label>
<p class="rc-fc-help">3D画面をドラッグして見回し、ボタンを押している間移動します。</p>`;
document.body.appendChild(freeCamPanel);

function clearFreeCamMoves() {
  for (const key of Object.keys(freeCamState.move)) freeCamState.move[key] = false;
}
function activateFreeCamera() {
  const dir = cam.look.clone().sub(cam.pos).normalize();
  if (dir.lengthSq() < 0.0001) dir.set(1, 0, 0);
  freeCamState.pos.copy(cam.pos);
  freeCamState.yaw = Math.atan2(dir.z, dir.x);
  freeCamState.pitch = Math.asin(clamp(dir.y, -0.98, 0.98));
  freeCamState.drag = null;
  clearFreeCamMoves();
  freeCamPanel.hidden = mode !== 'ride';
}
function updateFreeCamera(dt) {
  const step = Math.min(0.1, Math.max(0, dt)) * freeCamState.speed;
  const yaw = freeCamState.yaw;
  const forwardX = Math.cos(yaw), forwardZ = Math.sin(yaw);
  const rightX = -Math.sin(yaw), rightZ = Math.cos(yaw);
  const m = freeCamState.move;
  const forward = Number(m.forward) - Number(m.back);
  const sideways = Number(m.right) - Number(m.left);
  const vertical = Number(m.up) - Number(m.down);
  freeCamState.pos.x += (forwardX * forward + rightX * sideways) * step;
  freeCamState.pos.z += (forwardZ * forward + rightZ * sideways) * step;
  freeCamState.pos.y += vertical * step;
  const cp = Math.cos(freeCamState.pitch);
  const dir = new THREE.Vector3(cp * Math.cos(yaw), Math.sin(freeCamState.pitch), cp * Math.sin(yaw));
  cam.pos.copy(freeCamState.pos);
  cam.look.copy(freeCamState.pos).addScaledVector(dir, 100);
  camera.position.copy(cam.pos);
  camera.up.set(0, 1, 0);
  camera.lookAt(cam.look);
  const wantedFar = Math.max(2400, Math.abs(cam.pos.y) * 3 + 2400, co ? co.tr.maxH * 4 + 2400 : 2400);
  if (wantedFar > camera.far) {
    camera.far = wantedFar;
    camera.updateProjectionMatrix();
    if (scene3d.fog) scene3d.fog.far = Math.max(scene3d.fog.far, wantedFar * 0.75);
  }
}
freeCamPanel.querySelectorAll('[data-fc-move]').forEach((button) => {
  const key = button.dataset.fcMove;
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    freeCamState.move[key] = true;
    try { button.setPointerCapture(event.pointerId); } catch (_) {}
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(type, (event) => {
      event.stopPropagation();
      freeCamState.move[key] = false;
    });
  }
});
document.addEventListener('pointerup', clearFreeCamMoves);
document.addEventListener('pointercancel', clearFreeCamMoves);
const freeCamLook = freeCamPanel.querySelector('[data-fc-look]');
freeCamLook.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  freeCamState.drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  try { freeCamLook.setPointerCapture(event.pointerId); } catch (_) {}
});
freeCamLook.addEventListener('pointermove', (event) => {
  const drag = freeCamState.drag;
  if (!drag || drag.id !== event.pointerId) return;
  const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
  drag.x = event.clientX;
  drag.y = event.clientY;
  freeCamState.yaw -= dx * 0.006;
  freeCamState.pitch = clamp(freeCamState.pitch - dy * 0.006, -1.48, 1.48);
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  freeCamLook.addEventListener(type, () => { freeCamState.drag = null; });
}
// 自由カメラ中は3D画面そのものをドラッグして見回せる。
cvs.addEventListener('pointerdown', (event) => {
  if (mode !== 'ride' || cam.mode !== 'free') return;
  event.preventDefault();
  freeCamState.drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  try { cvs.setPointerCapture(event.pointerId); } catch (_) {}
});
cvs.addEventListener('pointermove', (event) => {
  const drag = freeCamState.drag;
  if (mode !== 'ride' || cam.mode !== 'free' || !drag || drag.id !== event.pointerId) return;
  const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
  drag.x = event.clientX;
  drag.y = event.clientY;
  freeCamState.yaw -= dx * 0.006;
  freeCamState.pitch = clamp(freeCamState.pitch - dy * 0.006, -1.48, 1.48);
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  cvs.addEventListener(type, () => { freeCamState.drag = null; });
}
const freeCamSpeed = freeCamPanel.querySelector('[data-fc-speed]');
const freeCamSpeedLabel = freeCamPanel.querySelector('[data-fc-speed-label]');
freeCamSpeed.addEventListener('input', () => {
  freeCamState.speed = Number(freeCamSpeed.value);
  freeCamSpeedLabel.textContent = `${freeCamState.speed} m/s`;
});
freeCamPanel.querySelector('[data-fc-action="auto"]').addEventListener('click', () => {
  cam.mode = 'auto';
  cam.shotT = 0;
  freeCamPanel.hidden = true;
  ui.camBtn.textContent = `🎥 ${CAM_NAMES[cam.mode]}`;
  clearFreeCamMoves();
  sound.sfx('tap');
});
freeCamPanel.querySelector('[data-fc-action="reset"]').addEventListener('click', () => {
  const f = co && co.sim && co.sim.cars[0] && co.sim.cars[0].f;
  if (!f) return;
  freeCamState.pos.set(f.x - f.tx * 24 + f.rx * 10, f.y + 12, f.z - f.tz * 24 + f.rz * 10);
  const dir = new THREE.Vector3(
    f.x - freeCamState.pos.x,
    f.y + 2 - freeCamState.pos.y,
    f.z - freeCamState.pos.z
  ).normalize();
  freeCamState.yaw = Math.atan2(dir.z, dir.x);
  freeCamState.pitch = Math.asin(clamp(dir.y, -0.98, 0.98));
  sound.sfx('tap');
});
