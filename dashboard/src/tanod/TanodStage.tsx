/**
 * Tanod in 3D: loads public/mascot/tanod.glb (built in Blender, see
 * mascot/README.md) and animates its pivot nodes in code. This module pulls in
 * three.js, so it is loaded only after the page has settled.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Mood } from './brain';

export interface StageState {
  mood: Mood | 'idle';
  /** True while a reply is being typed out: the mouth moves. */
  talking: boolean;
  /** Pointer over the mascot: he looks at it and waves. */
  hover: boolean;
  /** Bumped to make him do a short wave (for example when the chat opens). */
  greet: number;
}

const ARM_REST = 0.3;
const FOREARM_REST = 0.1;

interface Rig {
  root: THREE.Object3D;
  hips: THREE.Object3D;
  torso: THREE.Object3D;
  head: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  forearmL: THREE.Object3D;
  forearmR: THREE.Object3D;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  eyeL: THREE.Object3D;
  eyeR: THREE.Object3D;
  mouth: THREE.Object3D;
  shadow: THREE.Object3D;
  hipsY: number;
}

/** Joint angles (radians, offsets from rest) and the body's height. */
interface Pose {
  lift: number;
  turn: number;
  lean: number;
  sway: number;
  headX: number;
  headY: number;
  headZ: number;
  armLZ: number;
  armLX: number;
  armRZ: number;
  armRX: number;
  foreLZ: number;
  foreRZ: number;
  foreLX: number;
  foreRX: number;
}

const ZERO: Pose = {
  lift: 0,
  turn: 0,
  lean: 0,
  sway: 0,
  headX: 0,
  headY: 0,
  headZ: 0,
  armLZ: 0,
  armLX: 0,
  armRZ: 0,
  armRX: 0,
  foreLZ: 0,
  foreRZ: 0,
  foreLX: 0,
  foreRX: 0,
};

/**
 * The pose for a mood at time t (seconds since the mood started).
 * Character's left is +X. He stands bottom-left with the chat to the viewer's
 * right, which is his left (+X), so he points and turns that way.
 */
function moodPose(mood: StageState['mood'], t: number, motion: number): Partial<Pose> {
  const wob = (speed: number, size: number) => Math.sin(t * speed) * size * motion;
  switch (mood) {
    case 'wave':
      return {
        armLZ: 2.35,
        armLX: -0.25,
        foreLZ: 0.35 + wob(11, 0.45),
        headZ: 0.12,
        headY: 0.15,
        lift: t < 0.5 ? Math.sin((t / 0.5) * Math.PI) * 0.06 * motion : 0,
      };
    case 'happy': {
      const hop = t < 1.1 ? Math.abs(Math.sin((t / 0.55) * Math.PI)) * 0.12 * motion : 0;
      return {
        lift: hop,
        armLZ: 2.3 + wob(9, 0.15),
        armRZ: -2.3 - wob(9, 0.15),
        foreLZ: -0.3,
        foreRZ: 0.3,
        headX: -0.15,
      };
    }
    case 'explain':
      return {
        armLZ: 0.7 + wob(2.4, 0.15),
        armLX: -0.85,
        foreLZ: 0.5,
        foreLX: -0.4,
        armRZ: -0.7 + wob(2.4, 0.15),
        armRX: -0.85 + wob(1.7, 0.15),
        foreRZ: -0.5,
        foreRX: -0.4,
        headX: 0.06 + wob(3.2, 0.05),
        headZ: wob(1.3, 0.06),
        lean: 0.05,
      };
    case 'point':
      return {
        armLZ: 1.35,
        armLX: -0.55,
        foreLZ: -0.05,
        headY: 0.45,
        headZ: 0.05,
        turn: 0.3,
        lean: 0.04,
      };
    case 'think':
      return {
        armRX: -1.45,
        armRZ: 0.25,
        foreRX: -1.1,
        foreRZ: 0.6,
        armLZ: 0.35,
        armLX: -0.4,
        foreLX: -1.1,
        headZ: 0.18,
        headX: -0.18 + wob(4, 0.04),
        headY: 0.2,
      };
    case 'shrug':
      return {
        armLZ: 0.9,
        armRZ: -0.9,
        armLX: -0.5,
        armRX: -0.5,
        foreLZ: -1.0,
        foreRZ: 1.0,
        foreLX: -0.5,
        foreRX: -0.5,
        headZ: 0.22,
        headX: -0.05,
        lift: t < 0.4 ? Math.sin((t / 0.4) * Math.PI) * 0.03 * motion : 0,
      };
    case 'firm':
      // Hands on hips, a steady nod.
      return {
        armLZ: 0.5,
        armRZ: -0.5,
        foreLZ: -1.7,
        foreRZ: 1.7,
        headX: t < 0.9 ? Math.sin((t / 0.9) * Math.PI * 2) * 0.12 * motion : 0,
      };
    default:
      return {};
  }
}

function findRig(scene: THREE.Object3D): Rig | null {
  const get = (name: string) => scene.getObjectByName(name);
  const names = [
    'tanod',
    'hips',
    'torso',
    'head',
    'armL',
    'armR',
    'forearmL',
    'forearmR',
    'legL',
    'legR',
    'eyeL',
    'eyeR',
    'mouth',
    'groundShadow',
  ];
  const parts = names.map(get);
  if (parts.some((p) => !p)) return null;
  const [
    root,
    hips,
    torso,
    head,
    armL,
    armR,
    forearmL,
    forearmR,
    legL,
    legR,
    eyeL,
    eyeR,
    mouth,
    shadow,
  ] = parts as THREE.Object3D[];
  return {
    root,
    hips,
    torso,
    head,
    armL,
    armR,
    forearmL,
    forearmR,
    legL,
    legR,
    eyeL,
    eyeR,
    mouth,
    shadow,
    hipsY: hips.position.y,
  };
}

/** The GLB has plain materials; give it the drawing's two-step cel shading. */
function toonify(scene: THREE.Object3D) {
  const steps = new Uint8Array([150, 255]);
  const ramp = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
  ramp.minFilter = THREE.NearestFilter;
  ramp.magFilter = THREE.NearestFilter;
  ramp.needsUpdate = true;
  const cache = new Map<string, THREE.Material>();
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const source = mesh.material as THREE.MeshStandardMaterial;
    const name = source.name;
    let material = cache.get(name);
    if (!material) {
      if (name === 'outline') {
        material = new THREE.MeshBasicMaterial({ color: 0x0d0d10 });
      } else if (name === 'groundShadow') {
        material = new THREE.MeshBasicMaterial({
          color: 0x8a6a4a,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
        });
      } else {
        material = new THREE.MeshToonMaterial({ color: source.color, gradientMap: ramp });
      }
      material.name = name;
      cache.set(name, material);
    }
    mesh.material = material;
  });
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export default function TanodStage({
  state,
  onReady,
  onFail,
}: {
  state: StageState;
  onReady: () => void;
  onFail: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef(state);
  useEffect(() => {
    live.current = state;
  }, [state]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      onFail();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    element.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-hidden', 'true');

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-2, 4, 3); // the sheet is lit from the upper left
    scene.add(sun);

    const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 30);
    // Seen from his right, so at rest he faces into the page (he stands bottom-left).
    camera.position.set(-0.9, 1.25, 5.2);
    camera.lookAt(0, 0.93, 0);

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    // Where the cursor is on the page, and when it last moved.
    const pointer = { x: 0, y: 0, moved: -Infinity };
    const onPointer = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.moved = performance.now();
    };
    window.addEventListener('pointermove', onPointer, { passive: true });

    const resize = () => {
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = width / height;
      // Keep the whole body in view whatever the box's shape.
      camera.fov = width / height < 0.75 ? 24 * (0.75 / (width / height)) : 24;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();

    let rig: Rig | null = null;
    let frame = 0;
    let disposed = false;
    const pose: Pose = { ...ZERO };
    let moodStarted = performance.now();
    let lastMood: StageState['mood'] = 'idle';
    let lastGreet = state.greet;
    let greetUntil = 0;
    let nextBlink = performance.now() + 2500;
    let nextGlance = performance.now() + 4000;
    let glance = 0;

    new GLTFLoader().load(
      '/mascot/tanod.glb',
      (gltf) => {
        if (disposed) return;
        toonify(gltf.scene);
        rig = findRig(gltf.scene);
        if (!rig) {
          onFail();
          return;
        }
        rig.mouth.visible = false;
        scene.add(gltf.scene);
        onReady();
      },
      undefined,
      () => !disposed && onFail(),
    );

    const clock = new THREE.Clock();
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      if (!rig) return;
      const now = performance.now();
      const s = live.current;
      const motion = reduced?.matches ? 0 : 1;

      if (s.greet !== lastGreet) {
        lastGreet = s.greet;
        greetUntil = now + 1600;
      }
      let mood: StageState['mood'] = s.mood;
      if (mood === 'idle' && (now < greetUntil || s.hover)) mood = 'wave';
      if (mood !== lastMood) {
        lastMood = mood;
        moodStarted = now;
      }
      const t = (now - moodStarted) / 1000;
      const time = now / 1000;

      // Idle life: breathing, a little sway, glancing around now and then.
      if (now > nextGlance) {
        glance = (Math.random() - 0.5) * 0.8;
        nextGlance = now + 3000 + Math.random() * 4000;
        if (Math.random() < 0.4) glance = 0;
      }
      const target: Pose = {
        ...ZERO,
        lift: Math.sin(time * 2.2) * 0.012 * motion,
        sway: Math.sin(time * 1.1) * 0.035 * motion,
        headY: glance * motion,
        headZ: Math.sin(time * 0.9) * 0.04 * motion,
        armLZ: Math.sin(time * 2.2) * 0.03 * motion,
        armRZ: -Math.sin(time * 2.2) * 0.03 * motion,
        ...moodPose(mood, t, motion),
      };
      // Follow the cursor anywhere on the page: head first, body a little.
      // He keeps watching for a few seconds after it stops, then looks around again.
      const sinceMove = now - pointer.moved;
      if (motion && sinceMove < 6000) {
        const box = element.getBoundingClientRect();
        const dx = pointer.x - (box.left + box.width / 2);
        const dy = pointer.y - (box.top + box.height * 0.3); // from his eyes
        const yaw = THREE.MathUtils.clamp(Math.atan2(dx, 520), -0.95, 0.95);
        const pitch = THREE.MathUtils.clamp(Math.atan2(dy, 700), -0.4, 0.25);
        // Gestures that aim the head (pointing, thinking) keep most of their own pose.
        const busy = mood === 'point' || mood === 'think';
        const w = (busy ? 0.3 : 1) * (sinceMove < 4000 ? 1 : 1 - (sinceMove - 4000) / 2000);
        target.headY = lerp(target.headY, yaw * 0.65, w);
        target.turn = lerp(target.turn, yaw * 0.35, w);
        target.headX = lerp(target.headX, pitch, w);
      }
      if (s.talking) {
        target.headX += Math.sin(time * 7) * 0.035 * motion;
      }

      const k = motion ? 1 - Math.exp(-dt * 9) : 1;
      for (const key of Object.keys(pose) as (keyof Pose)[]) {
        pose[key] = lerp(pose[key], target[key], key === 'lift' ? Math.min(1, k * 2) : k);
      }

      rig.hips.position.y = rig.hipsY + pose.lift;
      rig.shadow.scale.setScalar(1 - pose.lift * 1.5);
      rig.hips.rotation.y = pose.turn;
      rig.torso.rotation.set(pose.lean, 0, pose.sway);
      rig.head.rotation.set(pose.headX, pose.headY, pose.headZ - pose.sway * 0.5);
      rig.armL.rotation.set(pose.armLX, 0, ARM_REST + pose.armLZ);
      rig.armR.rotation.set(pose.armRX, 0, -ARM_REST + pose.armRZ);
      rig.forearmL.rotation.set(pose.foreLX, 0, -FOREARM_REST + pose.foreLZ);
      rig.forearmR.rotation.set(pose.foreRX, 0, FOREARM_REST + pose.foreRZ);
      // Legs bend a touch when he hops.
      rig.legL.rotation.x = -pose.lift * 1.2;
      rig.legR.rotation.x = -pose.lift * 1.2;

      // Blink every few seconds (and twice in a row sometimes).
      let eye = 1;
      if (motion && now > nextBlink) {
        const into = now - nextBlink;
        eye = into < 140 ? Math.abs(Math.cos((into / 140) * Math.PI)) : 1;
        if (into >= 140)
          nextBlink = now + (Math.random() < 0.2 ? 180 : 2500 + Math.random() * 3500);
      }
      if (mood === 'happy') eye = 0.35; // smiling eyes
      rig.eyeL.scale.y = eye;
      rig.eyeR.scale.y = eye;

      rig.mouth.visible = s.talking || mood === 'happy';
      rig.mouth.scale.y = s.talking
        ? 0.5 + Math.abs(Math.sin(time * 13)) * 1.1 * (motion || 0.4)
        : 0.8;

      renderer.render(scene, camera);
    };
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('pointermove', onPointer);
      renderer.dispose();
      renderer.domElement.remove();
    };
    // The scene is built once; later state arrives through `live`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={host} className="tanod-stage-3d" />;
}
