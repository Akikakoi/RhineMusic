// Rhine Music · 黑胶唱片袋卡片资产
//
// 形态：纸质滑套（右侧开口）+ 内衬纸袋 + 黑胶唱片 + 杏金中心标签 + 边条与索引签。
// 数组/详情模型与拆解模型共用同一份几何定义，拆解版把厚度放大三倍以便观察层叠。
//
// 命名契约（与 src/scene.ts、src/appearance.ts 对齐）：
//   X = 宽度 5.0，Y = 高度 3.7，Z = 厚度（正面朝 +Z）
//   material.name = 表面名，写入 mesh.userData.surface
//   mesh.userData.assemblyPart = 拆解组（cover / carrier / substrate / optical-core / optical-lenses / fasteners）
//
// 说明：本机未安装 Blender，暂由 three.js 直接导出 GLB 作为过渡资产；
// 几何参数与材质名即 Blender 版（art/build_vinyl_sleeve.py）的规格来源，两者需保持一致。
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// GLTFExporter 只在写二进制块时用到 FileReader，Node 没有这个全局对象。
if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buffer) => {
        this.result = buffer;
        this.onloadend?.();
      });
    }
  };
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "public/assets");

const W = 5.0;          // 卡片面宽
const H = 3.7;          // 卡片面高
const DEPTH = 0.36;     // 滑套总厚
const PAPER = 0.05;     // 纸板厚度
const RECORD_R = 1.78;  // 唱片半径
const RECORD_T = 0.075; // 唱片厚度
const ASSEMBLY_DEPTH_SCALE = 3; // 拆解版厚度放大倍数
// 坐标必须与 archive-cassette.glb 一致：Y 从 0（下边缘）到 3.7，正面在 +Z 且整体前移。
// 原点若不同，卡片在阵列里会整体浮空或镶嵌。
const BASE_Y = H / 2, BASE_Z = 0.058;
const at = (x, y, z) => [x, BASE_Y + y, BASE_Z + z];
// 索引签位置：让开应用侧的正面印刷区（4.4 × 2.6，中心 y=1.75）。
const TICKET_X = -1.9, TICKET_Y = 3.36;

const materials = {
  Sleeve_Paper: new THREE.MeshStandardMaterial({ color: 0xdfd9cc, roughness: 0.88, metalness: 0 }),
  Sleeve_Liner: new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }),
  Vinyl_Record: new THREE.MeshPhysicalMaterial({ color: 0x0e0e11, roughness: 0.42, metalness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.35 }),
  Vinyl_Label: new THREE.MeshStandardMaterial({ color: 0xd2a054, roughness: 0.5, metalness: 0.1 }),
  Amber_Lightguide: new THREE.MeshStandardMaterial({ color: 0xd2a054, roughness: 0.34, metalness: 0.2, emissive: 0x6b4410, emissiveIntensity: 0.45 }),
  Index_Inlay: new THREE.MeshStandardMaterial({ color: 0xe8dcc9, roughness: 0.6, metalness: 0.05 }),
};

// 表面名必须写在 material.name 上：应用按名字重建材质、注册磨砂/主题状态与阵列实例。
for (const [name, material] of Object.entries(materials)) material.name = name;

function add(list, kind, surface, part, geometry, position, rotation = null) {
  const mesh = new THREE.Mesh(geometry, materials[surface]);
  mesh.name = `${part}__${surface}`;
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.userData.surface = surface;
  mesh.userData.assemblyPart = part;
  list.push(mesh);
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const disc = (r, t) => {
  const geometry = new THREE.CylinderGeometry(r, r, t, 96);
  geometry.rotateX(Math.PI / 2);
  return geometry;
};
const rim = (r, t) => {
  const geometry = new THREE.TorusGeometry(r, t, 12, 96);
  return geometry;
};

// 开口在 +X 一侧，抽取时唱片向右滑出。
function sleeveParts() {
  const meshes = [];
  const faceZ = DEPTH / 2 - PAPER / 2;
  add(meshes, "box", "Sleeve_Paper", "cover", box(W, H, PAPER), at(0, 0, faceZ));
  add(meshes, "box", "Sleeve_Paper", "carrier", box(W, H, PAPER), at(0, 0, -faceZ));
  add(meshes, "box", "Sleeve_Paper", "carrier", box(PAPER, H, DEPTH - PAPER * 2), at(-(W / 2 - PAPER / 2), 0, 0));
  add(meshes, "box", "Sleeve_Paper", "carrier", box(W - PAPER, PAPER, DEPTH - PAPER * 2), at(PAPER / 2, H / 2 - PAPER / 2, 0));
  add(meshes, "box", "Sleeve_Paper", "carrier", box(W - PAPER, PAPER, DEPTH - PAPER * 2), at(PAPER / 2, -(H / 2 - PAPER / 2), 0));
  add(meshes, "box", "Sleeve_Liner", "substrate", box(W - 0.3, H - 0.25, 0.03), at(0, 0, -0.075));
  add(meshes, "disc", "Vinyl_Record", "optical-core", disc(RECORD_R, RECORD_T), at(0, 0, 0.02));
  add(meshes, "rim", "Vinyl_Record", "optical-core", rim(RECORD_R + 0.005, 0.03), at(0, 0, 0.02));
  add(meshes, "disc", "Vinyl_Label", "optical-lenses", disc(0.6, 0.014), at(0, 0, 0.058));
  add(meshes, "box", "Amber_Lightguide", "fasteners", box(0.03, H - 0.5, 0.22), at(-(W / 2 + 0.015), 0, 0.02));
  // 索引签让出正面印刷区（4.4 × 2.6，中心 y=1.75），贴在左上角。
  add(meshes, "box", "Index_Inlay", "fasteners", box(1.0, 0.36, 0.014), [TICKET_X, TICKET_Y, BASE_Z + faceZ + PAPER / 2 + 0.007]);
  return meshes;
}

function exportGlb(objects, file) {
  const scene = new THREE.Scene();
  for (const object of objects) scene.add(object);
  const exporter = new GLTFExporter();
  exporter.parse(
    scene,
    (result) => {
      mkdirSync(OUT, { recursive: true });
      writeFileSync(resolve(OUT, file), Buffer.from(result));
      console.log(`${file}: ${objects.length} meshes, ${(result.byteLength / 1024).toFixed(1)} KiB`);
    },
    (error) => {
      console.error(`${file} failed`, error);
      process.exitCode = 1;
    },
    { binary: true, onlyVisible: false },
  );
}

// 阵列 / 详情模型：保留独立网格，便于运行时单独驱动唱片与标签。
const sleeve = sleeveParts();
sleeve.forEach((mesh) => mesh.updateMatrix());
exportGlb(sleeve, "vinyl-sleeve.glb");

// 拆解模型：按 (部件, 表面) 合并，厚度放大以便观察纸板与唱片的层叠关系。
const groups = new Map();
for (const mesh of sleeveParts()) {
  mesh.updateMatrix();
  const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrix);
  geometry.scale(1, 1, ASSEMBLY_DEPTH_SCALE);
  const key = `${mesh.userData.assemblyPart}__${mesh.userData.surface}`;
  groups.set(key, [...(groups.get(key) ?? []), geometry]);
}
const assembly = [...groups].map(([key, geometries]) => {
  const [part, surface] = key.split("__");
  const merged = mergeGeometries(geometries, false);
  const mesh = new THREE.Mesh(merged, materials[surface]);
  mesh.name = key;
  mesh.userData.surface = surface;
  mesh.userData.assemblyPart = part;
  return mesh;
});
exportGlb(assembly, "vinyl-sleeve-assembly.glb");
