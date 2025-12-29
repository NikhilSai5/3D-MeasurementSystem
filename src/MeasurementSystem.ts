import * as THREE from 'three';

interface MeasurementConfig {
  scene: THREE.Scene;
  camera: THREE.Camera;
}

interface DimensionGroup extends THREE.Group {
  userData: {
    startPoint: THREE.Vector3;
    endPoint: THREE.Vector3;
    distance: number;
  };
}

export class MeasurementSystem {
  static instance: MeasurementSystem;
  static createReference() {
    if (!this.instance) this.instance = new MeasurementSystem();
    return this.instance;
  }

  // Core state
  scene!: THREE.Scene;
  camera!: THREE.Camera;
  isActive: boolean = false;
  startPoint: THREE.Vector3 | null = null;
  previewLine: THREE.Line | null = null;
  currentMousePos: THREE.Vector3 = new THREE.Vector3();
  measurements: DimensionGroup[] = [];

  // Materials
  dimensionMat = new THREE.LineBasicMaterial({ color: 0x2563eb, linewidth: 2 });
  extensionMat = new THREE.LineBasicMaterial({ color: 0x2563eb, linewidth: 1 });
  previewMat = new THREE.LineDashedMaterial({
    color: 0x94a3b8,
    dashSize: 0.2,
    gapSize: 0.1,
    linewidth: 1,
  });
  arrowheadMat = new THREE.MeshBasicMaterial({ color: 0x2563eb });
  textMat = new THREE.SpriteMaterial({ sizeAttenuation: true });

  // Constants
  readonly EXTENSION_OFFSET = 0.002; // 2px gap from point
  readonly EXTENSION_OVERSHOOT = 0.003; // 3px overshoot
  readonly ARROWHEAD_SIZE = 0.08; // 8px length
  readonly ARROWHEAD_ANGLE = 45; // degrees
  readonly TEXT_PADDING = 4;
  readonly TEXT_RADIUS = 2;
  readonly TEXT_SIZE = 16;
  readonly SNAP_SHIFT = 0.5; // 0.5m increments
  readonly SNAP_CTRL = 0.1; // 0.1m increments

  init({ scene, camera }: MeasurementConfig) {
    this.scene = scene;
    this.camera = camera;
  }

  activate() {
    this.isActive = true;
  }

  deactivate() {
    this.isActive = false;
    this.cancelMeasurement();
  }

  handleEvent(event: KeyboardEvent | MouseEvent) {
    if (event instanceof KeyboardEvent) {
      if (event.key === 'Escape') {
        this.cancelMeasurement();
      }
    }
  }

  handleMouseMove(p: THREE.Vector3) {
    if (!this.isActive) return;
    this.currentMousePos.copy(p);

    if (!this.previewLine || !this.startPoint) return;

    // Update preview line
    this.previewLine.geometry.setFromPoints([this.startPoint, p]);
    this.previewLine.computeLineDistances();
  }

  handleClick(p: THREE.Vector3, shiftKey: boolean = false, ctrlKey: boolean = false) {
    if (!this.isActive) return;

    if (!this.startPoint) {
      // First click: start measurement
      this.startPoint = p.clone();
      const geo = new THREE.BufferGeometry().setFromPoints([p, p]);
      this.previewLine = new THREE.Line(geo, this.previewMat);
      this.previewLine.computeLineDistances();
      this.scene.add(this.previewLine);
    } else {
      // Second click: finish measurement
      let endPoint = p.clone();

      // Apply snap if modifiers active
      if (shiftKey) {
        endPoint = this.snapToIncrement(this.startPoint, endPoint, this.SNAP_SHIFT);
      } else if (ctrlKey) {
        endPoint = this.snapToIncrement(this.startPoint, endPoint, this.SNAP_CTRL);
      }

      this.completeMeasurement(this.startPoint, endPoint);
      this.cancelMeasurement();
    }
  }

  cancelMeasurement() {
    if (this.previewLine) {
      this.scene.remove(this.previewLine);
      this.disposeGroup(this.previewLine);
      this.previewLine = null;
    }
    this.startPoint = null;
  }

  completeMeasurement(a: THREE.Vector3, b: THREE.Vector3) {
    const dimensionGroup = this.createDimensionLineGroup(a, b);
    this.scene.add(dimensionGroup);
    this.measurements.push(dimensionGroup);
  }

  createDimensionLineGroup(a: THREE.Vector3, b: THREE.Vector3): DimensionGroup {
    const group = new THREE.Group() as DimensionGroup;
    const distance = a.distanceTo(b);

    // Store measurement data
    group.userData = {
      startPoint: a.clone(),
      endPoint: b.clone(),
      distance,
    };

    // Direction vector
    const direction = b.clone().sub(a);
    const lineLength = direction.length();
    const lineAngle = this.getLineAngle(a, b);

    // 1. Main dimension line
    const dimGeo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const dimLine = new THREE.Line(dimGeo, this.dimensionMat);
    group.add(dimLine);

    // 2. Extension lines (perpendicular to main line)
    const perpendicular = new THREE.Vector3(-direction.y, direction.x, 0).normalize();
    const extensionLength = this.EXTENSION_OFFSET + this.EXTENSION_OVERSHOOT;

    const extGeo1 = new THREE.BufferGeometry().setFromPoints([
      a.clone().sub(perpendicular.clone().multiplyScalar(extensionLength)),
      a.clone().add(perpendicular.clone().multiplyScalar(this.EXTENSION_OFFSET)),
    ]);
    const extLine1 = new THREE.Line(extGeo1, this.extensionMat);
    group.add(extLine1);

    const extGeo2 = new THREE.BufferGeometry().setFromPoints([
      b.clone().sub(perpendicular.clone().multiplyScalar(extensionLength)),
      b.clone().add(perpendicular.clone().multiplyScalar(this.EXTENSION_OFFSET)),
    ]);
    const extLine2 = new THREE.Line(extGeo2, this.extensionMat);
    group.add(extLine2);

    // 3. Arrowheads at both ends
    const arrowhead1 = this.createArrowHead(a, direction, lineAngle);
    group.add(arrowhead1);

    const arrowhead2 = this.createArrowHead(b, direction.clone().negate(), lineAngle + 180);
    group.add(arrowhead2);

    // 4. Text sprite with distance
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const textSprite = this.createTextSprite(`${distance.toFixed(2)} m`, mid, lineAngle);
    group.add(textSprite);

    return group;
  }

  createArrowHead(position: THREE.Vector3, direction: THREE.Vector3, angle: number): THREE.Mesh {
    // Create triangle pointing along direction
    const arrowSize = this.ARROWHEAD_SIZE;
    const angleRad = THREE.MathUtils.degToRad(this.ARROWHEAD_ANGLE);

    const points = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(arrowSize * Math.cos(angleRad), arrowSize * Math.sin(angleRad), 0),
      new THREE.Vector3(arrowSize * Math.cos(angleRad), -arrowSize * Math.sin(angleRad), 0),
    ];

    const arrowGeo = new THREE.BufferGeometry().setFromPoints(points);
    const arrowhead = new THREE.Mesh(arrowGeo, this.arrowheadMat);

    // Position at point
    arrowhead.position.copy(position);

    // Rotate to face along direction
    const dirNorm = direction.clone().normalize();
    arrowhead.lookAt(position.clone().add(dirNorm));
    arrowhead.rotateZ(THREE.MathUtils.degToRad(angle));

    return arrowhead;
  }

  createTextSprite(text: string, pos: THREE.Vector3, lineAngle: number): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;

    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;

    // Measure text
    ctx.font = `${this.TEXT_SIZE}px monospace`;
    const textMetrics = ctx.measureText(text);
    const textWidth = textMetrics.width;
    const textHeight = this.TEXT_SIZE;

    // Background with rounded corners
    const padding = this.TEXT_PADDING;
    const bgWidth = textWidth + padding * 2;
    const bgHeight = textHeight + padding;
    const bgX = (canvas.width - bgWidth) / 2;
    const bgY = (canvas.height - bgHeight) / 2;

    // Draw background with rounded corners
    this.roundRect(ctx, bgX, bgY, bgWidth, bgHeight, this.TEXT_RADIUS, 'rgba(255,255,255,0.9)');

    // Draw text
    ctx.fillStyle = '#1e40af';
    ctx.font = `${this.TEXT_SIZE}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;

    const material = new THREE.SpriteMaterial({ map: texture, sizeAttenuation: true });
    const sprite = new THREE.Sprite(material);

    sprite.position.copy(pos);

    // Determine text rotation based on line angle
    const angle = lineAngle % 360;
    if (angle >= 0 && angle < 30) {
      // Horizontal above line
      sprite.rotation.z = 0;
      sprite.position.y += 0.15;
    } else if (angle >= 30 && angle < 60) {
      // Rotate with line
      sprite.rotation.z = THREE.MathUtils.degToRad(lineAngle);
      sprite.position.y += 0.15;
    } else if (angle >= 60 && angle < 90) {
      // Horizontal on side
      sprite.rotation.z = 0;
      sprite.position.x += 0.15;
    } else {
      // Default: horizontal
      sprite.rotation.z = 0;
    }

    sprite.scale.set(2, 0.5, 1);

    return sprite;
  }

  getLineAngle(a: THREE.Vector3, b: THREE.Vector3): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return THREE.MathUtils.radToDeg(Math.atan2(dy, dx));
  }

  snapToIncrement(start: THREE.Vector3, end: THREE.Vector3, increment: number): THREE.Vector3 {
    const distance = start.distanceTo(end);
    const snappedDistance = Math.round(distance / increment) * increment;

    if (snappedDistance === 0) return end;

    const direction = end.clone().sub(start).normalize();
    return start.clone().add(direction.multiplyScalar(snappedDistance));
  }

  removeMeasurement(index: number) {
    if (index >= 0 && index < this.measurements.length) {
      const measurement = this.measurements[index];
      this.scene.remove(measurement);
      this.disposeGroup(measurement);
      this.measurements.splice(index, 1);
    }
  }

  clearAllMeasurements() {
    this.measurements.forEach((measurement) => {
      this.scene.remove(measurement);
      this.disposeGroup(measurement);
    });
    this.measurements = [];
  }

  disposeGroup(group: THREE.Object3D) {
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => mat.dispose?.());
        } else {
          child.material?.dispose?.();
        }
      } else if (child instanceof THREE.Line) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => mat.dispose?.());
        } else {
          child.material?.dispose?.();
        }
      } else if (child instanceof THREE.Sprite) {
        child.geometry?.dispose();
        if (child.material instanceof THREE.SpriteMaterial) {
          child.material.map?.dispose?.();
        }
        child.material?.dispose?.();
      }
    });
  }

  dispose() {
    this.clearAllMeasurements();
    this.cancelMeasurement();
    this.dimensionMat.dispose();
    this.extensionMat.dispose();
    this.previewMat.dispose();
    this.arrowheadMat.dispose();
  }

  // Helper to draw rounded rectangles
  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    fillStyle: string
  ) {
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
  }
}
