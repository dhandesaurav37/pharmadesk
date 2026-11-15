/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type HeroCameraPreset = 'overview' | 'pos' | 'inventory';

interface ThreeHeroSceneProps {
  preset: HeroCameraPreset;
  onWebglUnavailable: () => void;
}

const PRESET_VIEWS: Record<
  HeroCameraPreset,
  { camPos: [number, number, number]; target: [number, number, number] }
> = {
  overview: { camPos: [0.35, 1.55, 5.2], target: [0, 0.25, 0] },
  pos: { camPos: [-1.15, 1.35, 3.85], target: [-0.3, 0.35, 0.1] },
  inventory: { camPos: [1.55, 1.25, 3.9], target: [0.7, 0.1, 0.1] },
};

const _targetCam = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _currentLook = new THREE.Vector3(0, 0.25, 0);

function detectSoftwareWebgl(): { supported: boolean; isSoftwareGl: boolean } {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) {
      return { supported: false, isSoftwareGl: true };
    }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const rendererStr = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    const isSoftware = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(rendererStr);
    return { supported: true, isSoftwareGl: isSoftware };
  } catch {
    return { supported: false, isSoftwareGl: true };
  }
}

function createRoundedRectShape(width: number, height: number, radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

function createPosScreenTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 640;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 1024, 640);

  // Top App Bar
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 1024, 68);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('PharmaDesk POS  ·  Retail Counter 01', 36, 43);

  ctx.fillStyle = '#93c5fd';
  ctx.font = '600 18px "JetBrains Mono", monospace';
  ctx.fillText('FEFO ACTIVE · GST TAX INVOICE', 680, 42);

  // Left Line-Items Card
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(32, 96, 610, 504, 18);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#334155';
  ctx.font = 'bold 20px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Medicine Search / Barcode Scan', 58, 140);

  // Search box
  ctx.fillStyle = '#f1f5f9';
  ctx.beginPath();
  ctx.roundRect(58, 160, 558, 50, 10);
  ctx.fill();
  ctx.fillStyle = '#1e293b';
  ctx.font = '500 18px "JetBrains Mono", monospace';
  ctx.fillText('890123456019  ·  Dolo 650mg Strip (15 Tabs)', 76, 192);

  // Table Headers
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 16px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('MEDICINE & BATCH', 58, 250);
  ctx.fillText('EXPIRY', 330, 250);
  ctx.fillText('QTY', 445, 250);
  ctx.fillText('TOTAL', 530, 250);

  const rows = [
    ['Dolo 650mg Tablet', 'Batch DL-2408', '10/2027', '2', 'Rs 68.00'],
    ['Augmentin 625 Duo', 'Batch AG-9914', '07/2027', '1', 'Rs 223.40'],
    ['Pan-D Capsule', 'Batch PD-1182', '12/2027', '2', 'Rs 398.00'],
    ['Montair LC Tablet', 'Batch ML-4021', '09/2027', '1', 'Rs 214.00'],
  ];

  rows.forEach((row, idx) => {
    const y = 296 + idx * 72;
    ctx.strokeStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.moveTo(58, y + 36);
    ctx.lineTo(616, y + 36);
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 19px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(row[0], 58, y);

    ctx.fillStyle = '#2563eb';
    ctx.font = '500 15px "JetBrains Mono", monospace';
    ctx.fillText(row[1], 58, y + 22);

    ctx.fillStyle = '#059669';
    ctx.font = '600 16px "JetBrains Mono", monospace';
    ctx.fillText(row[2], 330, y + 8);

    ctx.fillStyle = '#0f172a';
    ctx.fillText(row[3], 455, y + 8);
    ctx.fillText(row[4], 525, y + 8);
  });

  // Right Totals Card
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.roundRect(666, 96, 326, 504, 18);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#475569';
  ctx.font = 'bold 18px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('GST & Payment Summary', 694, 140);

  const summaryLines = [
    ['Taxable Value', 'Rs 806.61'],
    ['CGST (6%)', 'Rs 48.40'],
    ['SGST (6%)', 'Rs 48.39'],
    ['Payment Mode', 'UPI + Cash'],
  ];

  summaryLines.forEach(([label, val], idx) => {
    const y = 195 + idx * 46;
    ctx.fillStyle = '#64748b';
    ctx.font = '500 17px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(label, 694, y);
    ctx.fillStyle = '#0f172a';
    ctx.font = '600 17px "JetBrains Mono", monospace';
    ctx.fillText(val, 860, y);
  });

  ctx.fillStyle = '#eff6ff';
  ctx.beginPath();
  ctx.roundRect(694, 385, 270, 90, 14);
  ctx.fill();
  ctx.fillStyle = '#1e40af';
  ctx.font = '600 16px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Net Payable Amount', 714, 418);
  ctx.font = 'bold 34px "JetBrains Mono", monospace';
  ctx.fillText('Rs 903.40', 714, 458);

  // Action Button
  ctx.fillStyle = '#1d4ed8';
  ctx.beginPath();
  ctx.roundRect(694, 505, 270, 62, 12);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Complete & Print Bill', 730, 543);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

function createBottleLabelTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 512, 256);

  ctx.fillStyle = '#1d4ed8';
  ctx.fillRect(0, 0, 512, 48);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('PHARMADESK VERIFIED STOCK', 28, 33);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 30px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Amoxycillin Capsules IP', 28, 102);

  ctx.fillStyle = '#475569';
  ctx.font = '600 20px "JetBrains Mono", monospace';
  ctx.fillText('BATCH: AMX-2026B   EXP: 11/2027', 28, 148);
  ctx.fillText('HSN: 3004  ·  FEFO PRIORITY #1', 28, 184);

  // Barcode stripes
  ctx.fillStyle = '#0f172a';
  for (let x = 28; x < 300; x += 7) {
    const width = x % 14 === 0 ? 4 : 2;
    ctx.fillRect(x, 202, width, 34);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function createIndicatorCardTexture(
  title: string,
  metric: string,
  detail: string,
  accentColor: string,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 288;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 512, 288);

  ctx.fillStyle = accentColor;
  ctx.fillRect(0, 0, 512, 16);

  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 22px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(title, 34, 70);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 46px "JetBrains Mono", monospace';
  ctx.fillText(metric, 34, 152);

  ctx.fillStyle = '#334155';
  ctx.font = '600 22px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(detail, 34, 224);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export const ThreeHeroScene: React.FC<ThreeHeroSceneProps> = ({
  preset,
  onWebglUnavailable,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const presetRef = useRef<HeroCameraPreset>(preset);

  useEffect(() => {
    presetRef.current = preset;
  }, [preset]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const { supported, isSoftwareGl } = detectSoftwareWebgl();
    if (!supported) {
      onWebglUnavailable();
      return;
    }

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 320);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      onWebglUnavailable();
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      onWebglUnavailable();
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xf8fafc, 0.042);

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 40);
    camera.position.set(...PRESET_VIEWS[presetRef.current].camPos);

    // Studio environment reflection
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    // 3-Point Studio Lighting (Warm Key + Cool Sky Fill + Subtle Rim)
    const hemiLight = new THREE.HemisphereLight(0xeef2ff, 0xe2e8f0, 0.75);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff8ed, 1.5);
    keyLight.position.set(4.5, 6.2, 4.5);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 16;
    keyLight.shadow.camera.left = -3.5;
    keyLight.shadow.camera.right = 3.5;
    keyLight.shadow.camera.top = 3.5;
    keyLight.shadow.camera.bottom = -3.5;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.9);
    rimLight.position.set(-4.5, 3.2, -3.5);
    scene.add(rimLight);

    const maxAnisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    const disposables: Array<{ dispose: () => void }> = [envTex];
    const track = <T extends { dispose: () => void }>(item: T): T => {
      disposables.push(item);
      return item;
    };

    // Ground Stage Disc
    const stageGroup = new THREE.Group();
    const stageGeo = track(new THREE.CylinderGeometry(2.75, 2.85, 0.12, 48));
    const stageMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xf1f5f9,
        roughness: 0.72,
        metalness: 0.08,
      })
    );
    const stageMesh = new THREE.Mesh(stageGeo, stageMat);
    stageMesh.position.y = -0.82;
    stageMesh.receiveShadow = true;
    stageGroup.add(stageMesh);

    const ringGeo = track(new THREE.TorusGeometry(2.74, 0.015, 12, 64));
    const ringMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        roughness: 0.35,
        metalness: 0.65,
      })
    );
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.y = -0.76;
    stageGroup.add(ringMesh);
    scene.add(stageGroup);

    // 1. Floating POS Terminal Display (Composite Multi-Part Assembly)
    const posGroup = new THREE.Group();
    posGroup.position.set(-0.35, 0.35, -0.1);
    posGroup.rotation.y = 0.18;

    const aluminumMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.28,
        metalness: 0.85,
      })
    );
    const bezelMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.42,
        metalness: 0.45,
      })
    );

    // Stand Base
    const baseShape = createRoundedRectShape(1.1, 0.75, 0.08);
    const baseGeo = track(
      new THREE.ExtrudeGeometry(baseShape, {
        depth: 0.05,
        bevelEnabled: true,
        bevelThickness: 0.015,
        bevelSize: 0.015,
        bevelSegments: 3,
      })
    );
    const baseMesh = new THREE.Mesh(baseGeo, aluminumMat);
    baseMesh.rotation.x = -Math.PI / 2;
    baseMesh.position.set(0, -1.08, 0.05);
    baseMesh.castShadow = true;
    posGroup.add(baseMesh);

    // Stand Neck
    const neckGeo = track(new THREE.BoxGeometry(0.16, 0.95, 0.1));
    const neckMesh = new THREE.Mesh(neckGeo, aluminumMat);
    neckMesh.position.set(0, -0.58, -0.18);
    neckMesh.rotation.x = -0.16;
    neckMesh.castShadow = true;
    posGroup.add(neckMesh);

    // Display Housing (Extruded Bezel)
    const chassisShape = createRoundedRectShape(2.45, 1.56, 0.1);
    const chassisGeo = track(
      new THREE.ExtrudeGeometry(chassisShape, {
        depth: 0.08,
        bevelEnabled: true,
        bevelThickness: 0.02,
        bevelSize: 0.02,
        bevelSegments: 4,
      })
    );
    const chassisMesh = new THREE.Mesh(chassisGeo, bezelMat);
    chassisMesh.position.set(0, 0.08, -0.05);
    chassisMesh.castShadow = true;
    posGroup.add(chassisMesh);

    // Display Screen Texture
    const screenTex = track(createPosScreenTexture(maxAnisotropy));
    const screenGeo = track(new THREE.PlaneGeometry(2.3, 1.42));
    const screenMat = track(
      new THREE.MeshStandardMaterial({
        map: screenTex,
        roughness: 0.18,
        metalness: 0.04,
        emissive: 0xffffff,
        emissiveMap: screenTex,
        emissiveIntensity: 0.22,
      })
    );
    const screenMesh = new THREE.Mesh(screenGeo, screenMat);
    screenMesh.position.set(0, 0.08, 0.052);
    posGroup.add(screenMesh);
    scene.add(posGroup);

    // 2. Handheld Barcode Scanner (Composite 5-Part Group)
    const scannerGroup = new THREE.Group();
    scannerGroup.position.set(-1.58, -0.45, 0.85);
    scannerGroup.rotation.set(0.08, 0.55, -0.14);

    const rubberMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.82,
        metalness: 0.06,
      })
    );
    const scannerBodyMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        roughness: 0.24,
        metalness: 0.15,
      })
    );
    const accentBlueMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x2563eb,
        roughness: 0.3,
        metalness: 0.35,
      })
    );

    const handleMesh = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.075, 0.095, 0.54, 18)),
      rubberMat
    );
    handleMesh.position.set(0, 0.02, 0);
    handleMesh.rotation.z = -0.22;
    handleMesh.castShadow = true;
    scannerGroup.add(handleMesh);

    const triggerMesh = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.06, 0.12, 0.05)),
      accentBlueMat
    );
    triggerMesh.position.set(0.08, 0.14, 0);
    scannerGroup.add(triggerMesh);

    const headMesh = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.36, 0.16, 0.19)),
      scannerBodyMat
    );
    headMesh.position.set(0.11, 0.3, 0);
    headMesh.rotation.z = 0.22;
    headMesh.castShadow = true;
    scannerGroup.add(headMesh);

    const scanWindowMesh = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.03, 0.12, 0.15)),
      track(
        new THREE.MeshStandardMaterial({
          color: 0xef4444,
          emissive: 0xef4444,
          emissiveIntensity: 0.85,
          roughness: 0.15,
        })
      )
    );
    scanWindowMesh.position.set(0.29, 0.34, 0);
    scanWindowMesh.rotation.z = 0.22;
    scannerGroup.add(scanWindowMesh);
    scene.add(scannerGroup);

    // 3. Pharmacy Bottle + Blister Strip Group (Composite Assembly)
    const medicineGroup = new THREE.Group();
    medicineGroup.position.set(1.22, -0.4, 0.65);

    const amberGlassMat = track(
      new THREE.MeshPhysicalMaterial({
        color: 0x92400e,
        roughness: 0.14,
        metalness: 0.05,
        clearcoat: 1.0,
        clearcoatRoughness: 0.08,
        transmission: isSoftwareGl ? 0 : 0.45,
        thickness: 0.5,
        transparent: true,
        opacity: isSoftwareGl ? 0.88 : 1,
      })
    );

    const bottleBody = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.24, 0.24, 0.58, 28)),
      amberGlassMat
    );
    bottleBody.position.y = -0.04;
    bottleBody.castShadow = true;
    medicineGroup.add(bottleBody);

    const bottleNeck = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.14, 0.2, 0.12, 24)),
      amberGlassMat
    );
    bottleNeck.position.y = 0.31;
    medicineGroup.add(bottleNeck);

    const capMesh = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.165, 0.165, 0.13, 24)),
      track(
        new THREE.MeshStandardMaterial({
          color: 0xf1f5f9,
          roughness: 0.55,
          metalness: 0.05,
        })
      )
    );
    capMesh.position.y = 0.43;
    capMesh.castShadow = true;
    medicineGroup.add(capMesh);

    const bottleLabelTex = track(createBottleLabelTexture(maxAnisotropy));
    const bottleLabelMesh = new THREE.Mesh(
      track(
        new THREE.CylinderGeometry(0.244, 0.244, 0.34, 28, 1, true, -Math.PI * 0.55, Math.PI * 1.1)
      ),
      track(
        new THREE.MeshStandardMaterial({
          map: bottleLabelTex,
          roughness: 0.45,
          metalness: 0.02,
        })
      )
    );
    bottleLabelMesh.position.y = -0.04;
    medicineGroup.add(bottleLabelMesh);

    // Blister Pack Card next to bottle
    const blisterGroup = new THREE.Group();
    blisterGroup.position.set(-0.46, -0.31, 0.32);
    blisterGroup.rotation.set(-Math.PI / 2 + 0.16, 0.12, -0.35);

    const foilMesh = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.56, 0.34, 0.02)),
      track(
        new THREE.MeshStandardMaterial({
          color: 0xe2e8f0,
          roughness: 0.26,
          metalness: 0.78,
        })
      )
    );
    foilMesh.castShadow = true;
    blisterGroup.add(foilMesh);

    const capsuleGeo = track(new THREE.CapsuleGeometry(0.032, 0.035, 6, 12));
    const capsuleMat = track(
      new THREE.MeshPhysicalMaterial({
        color: 0x2563eb,
        roughness: 0.18,
        metalness: 0.05,
        clearcoat: 0.9,
      })
    );
    const pillInstanced = new THREE.InstancedMesh(capsuleGeo, capsuleMat, 6);
    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        dummy.position.set(-0.16 + c * 0.16, -0.075 + r * 0.15, 0.025);
        dummy.rotation.set(Math.PI / 2, 0, Math.PI / 2);
        dummy.updateMatrix();
        pillInstanced.setMatrixAt(idx++, dummy.matrix);
      }
    }
    pillInstanced.computeBoundingSphere();
    blisterGroup.add(pillInstanced);
    medicineGroup.add(blisterGroup);
    scene.add(medicineGroup);

    // 4. Floating Analytics & Expiry Guard Cards
    const card1Tex = track(
      createIndicatorCardTexture(
        'BATCH EXPIRY GUARD',
        'FEFO LOCKED',
        'Expired stock blocked automatically',
        '#059669',
        maxAnisotropy
      )
    );
    const card2Tex = track(
      createIndicatorCardTexture(
        'GST & LEDGER SYNC',
        'CGST + SGST',
        'Balanced double-entry vouchers',
        '#2563eb',
        maxAnisotropy
      )
    );

    const cardGeo = track(new THREE.BoxGeometry(1.18, 0.66, 0.035));
    const cardEdgeMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        roughness: 0.35,
        metalness: 0.2,
      })
    );

    const floatingCardTop = new THREE.Mesh(cardGeo, [
      cardEdgeMat,
      cardEdgeMat,
      cardEdgeMat,
      cardEdgeMat,
      track(new THREE.MeshStandardMaterial({ map: card1Tex, roughness: 0.25 })),
      cardEdgeMat,
    ]);
    floatingCardTop.position.set(1.42, 0.85, -0.15);
    floatingCardTop.rotation.y = -0.32;
    floatingCardTop.castShadow = true;
    scene.add(floatingCardTop);

    const floatingCardBottom = new THREE.Mesh(cardGeo, [
      cardEdgeMat,
      cardEdgeMat,
      cardEdgeMat,
      cardEdgeMat,
      track(new THREE.MeshStandardMaterial({ map: card2Tex, roughness: 0.25 })),
      cardEdgeMat,
    ]);
    floatingCardBottom.position.set(-1.55, 0.72, -0.25);
    floatingCardBottom.rotation.y = 0.28;
    floatingCardBottom.castShadow = true;
    scene.add(floatingCardBottom);

    // Pointer parallax state
    const pointer = { x: 0, y: 0 };
    const handlePointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointer.x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      pointer.y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    container.addEventListener('pointermove', handlePointerMove);

    const handleResize = () => {
      if (!container) return;
      const w = Math.max(container.clientWidth, 300);
      const h = Math.max(container.clientHeight, 300);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    };
    window.addEventListener('resize', handleResize);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

    function afterDraw(cb: () => void) {
      try {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        if (typeof gl.fenceSync === 'function') {
          const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
          gl.flush();
          const poll = () => {
            if (disposed) return;
            const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
            if (state === gl.UNSIGNALED) {
              frameId = window.setTimeout(poll, 5);
            } else {
              if (sync) gl.deleteSync(sync);
              frameId = window.setTimeout(cb, 80);
            }
          };
          frameId = window.setTimeout(poll, 5);
          return;
        }
      } catch {
        // Fallback pacing if sync query unsupported
      }
      frameId = window.setTimeout(cb, 80);
    }

    function tick() {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.getElapsedTime();

      const view = PRESET_VIEWS[presetRef.current];
      _targetCam.set(
        view.camPos[0] + pointer.x * 0.26,
        view.camPos[1] - pointer.y * 0.16,
        view.camPos[2]
      );
      _lookTarget.set(...view.target);

      camera.position.x = THREE.MathUtils.damp(camera.position.x, _targetCam.x, 4.5, delta);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, _targetCam.y, 4.5, delta);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, _targetCam.z, 4.5, delta);

      _currentLook.x = THREE.MathUtils.damp(_currentLook.x, _lookTarget.x, 5, delta);
      _currentLook.y = THREE.MathUtils.damp(_currentLook.y, _lookTarget.y, 5, delta);
      _currentLook.z = THREE.MathUtils.damp(_currentLook.z, _lookTarget.z, 5, delta);
      camera.lookAt(_currentLook);

      // Gentle physical hover on cards and slight presentation sway
      floatingCardTop.position.y = 0.85 + Math.sin(elapsed * 1.4) * 0.045;
      floatingCardBottom.position.y = 0.72 + Math.cos(elapsed * 1.25) * 0.045;
      posGroup.rotation.y = 0.18 + Math.sin(elapsed * 0.6) * 0.03;

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      disposables.forEach((d) => {
        try {
          d.dispose();
        } catch {
          // Safe cleanup
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [onWebglUnavailable]);

  return (
    <div
      ref={mountRef}
      className="w-full h-full min-h-[360px] lg:min-h-[480px]"
      aria-label="Interactive 3D PharmaDesk workstation showing GST POS billing terminal, barcode scanner, medicine packaging, and FEFO stock indicators"
    />
  );
};
