import { BackSide, BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, Line, LineBasicMaterial, Matrix4, Mesh, MeshBasicMaterial, Object3D, Path, ShaderMaterial, Uniform, Vector2 } from "three";
import { FlagellumConfiguration, Unwrap } from "../configuration";
import { createFigureFromPath, cutBezierCurve, getFlatComponents3D } from "../utils/draw";
import { randomFrom } from "../utils/math";
import { zero2 } from "../utils/geometry";
import { calculateDeformation, Deformation, modifyDeformation } from "./deformation";
import { getRelativeTime, Timings } from "../utils/timings";
import { FlagellumElement } from "./types";

// @ts-ignore
import FlagellumVertexShader from "../shaders/flagellum-vertex.shader";
// @ts-ignore
import FlagellumFragmentShader from "../shaders/flagellum-fragment.shader";

interface Flagellum {
    points: Vector2[];
    jitters: Vector2[];
    deformations: Deformation[];
    length: number;
}

function generateFlagellum(target: Vector2, { segmentLength, amplitude, skew }: Unwrap<FlagellumConfiguration>) {
    const ratios = [];
    const distance = target.length();
    let remainder = distance;
    while (remainder >= 0) {
        const ratio = randomFrom(0, segmentLength);
        ratios.push(Math.min(ratio, remainder) / distance);
        remainder -= ratio;
    }
    ratios.sort((a, b) => b - a);

    const segments = ratios.length;
    const ort = new Vector2()
        .copy(target)
        .rotateAround(zero2, Math.PI / 2)
        .normalize();
    const points = [new Vector2(0, 0)];
    const jitters = [new Vector2(0, 0)];
    let sign = Math.sign(randomFrom(-1, 1));
    for (let i = 0; i < segments; i++) {
        const current = amplitude / (i + 1);
        const jitter = i == segments - 1 ? 0 : randomFrom(current / 2, current) * sign;
        sign = -sign;
        const point = new Vector2().copy(points[i]).addScaledVector(target, ratios[i]);
        points.push(point);
        jitters.push(new Vector2().copy(ort).multiplyScalar(jitter));
    }

    const deformations = [];
    sign = Math.sign(randomFrom(-1, 1));
    let length = 0;
    for (let i = 0; i < points.length; i++) {
        if (i > 0) {
            length += points[i].distanceTo(points[i - 1]);
        }
        const angle = i == 0 ? 0 : randomFrom(skew / 2, skew) * sign;
        sign = -sign;
        const next = i == 0 ? points[i + 1] : points[i - 1];
        const distance = points[i].distanceTo(next);
        deformations.push({ angle, length: randomFrom(distance, 2 * distance) });
    }
    return { points, length, deformations, jitters };
}

function calculateFlagellumPoints({ points, length, deformations, jitters }: Flagellum, startDirection: Vector2, finishDirection: Vector2, { wobbling }: Unwrap<FlagellumConfiguration>, time: number) {
    let k = time * length;
    const path = new Path();
    path.moveTo(points[0].x, points[0].y);
    let jittered = [];
    for (let i = 0; i < points.length; i++) {
        const intensity = Math.cos(2 * Math.PI * time) * (1 - Math.min(1, time));
        jittered.push(new Vector2().copy(points[i]).addScaledVector(jitters[i], intensity));
    }
    for (let i = 1; i < jittered.length && k > 0; i++) {
        let current = jittered[i].distanceTo(jittered[i - 1]);
        const direction1 = i == 1 ? startDirection : new Vector2().subVectors(jittered[i], jittered[i - 1]);
        const direction2 = i == jittered.length - 1 ? finishDirection : new Vector2().subVectors(jittered[i], jittered[i + 1]);
        const lengthStretch = wobbling + (1 - wobbling) * Math.max(0, 1 - time);
        const angleStretch1 = lengthStretch * Math.cos(Math.PI * time + i - 1);
        const angleStretch2 = lengthStretch * Math.cos(Math.PI * time + i);
        const d1 = modifyDeformation(deformations[i - 1], angleStretch1, lengthStretch);
        const d2 = modifyDeformation(deformations[i], angleStretch2, lengthStretch);
        const c1 = calculateDeformation(jittered[i - 1], direction1, d1, 0);
        const c2 = calculateDeformation(jittered[i], direction2, d2, 0);
        if (current > k) {
            const cut = cutBezierCurve(jittered[i - 1], c1, c2, jittered[i], k / current);
            path.bezierCurveTo(cut.c1.x, cut.c1.y, cut.c2.x, cut.c2.y, cut.end.x, cut.end.y);
        } else {
            path.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, jittered[i].x, jittered[i].y);
        }
        k -= current;
    }
    return path.getPoints(50);
}

export interface FlagellumState {
    startDirection: Vector2;
    finishDirection: Vector2;
    follow: () => Vector2;
    timings: Timings;
}

function createOrientation(n: number) {
    const orientation = [];
    for (let i = 0; i < n; i++) {
        orientation.push(1);
        orientation.push(-1);
    }
    return new Float32Array(orientation);
}

function createTrace(points: Vector2[]) {
    let length = 0;
    for (let i = 1; i < points.length; i++) {
        length += points[i].distanceTo(points[i - 1]);
    }
    const trace = [0, 0];
    let current = 0;
    for (let i = 1; i < points.length; i++) {
        current += points[i].distanceTo(points[i - 1]);
        trace.push(current / length);
        trace.push(current / length);
    }
    return new Float32Array(trace);
}

function transform(p: Vector2, m: number[][]) {
    return new Vector2(p.x * m[0][0] + p.y * m[1][0], p.x * m[0][1] + p.y * m[1][1]);
}

export function createFlagellum({ startDirection, finishDirection, follow, timings }: FlagellumState, configuration: Unwrap<FlagellumConfiguration>): FlagellumElement {
    const initial = follow();
    const r = initial.lengthSq();
    const rTransform = [
        [initial.x / r, -initial.y / r],
        [initial.y / r, initial.x / r],
    ];
    const flagellum = generateFlagellum(follow(), configuration);
    const geometry = new BufferGeometry();

    const material = new ShaderMaterial({
        uniforms: {
            u_color: new Uniform(new Color(configuration.color)),
        },
        vertexShader: FlagellumVertexShader,
        fragmentShader: FlagellumFragmentShader,
        transparent: true,
        side: BackSide,
    });
    const curve = new Mesh(geometry, material);
    return {
        multiverse: curve,
        tick: (time: number) => {
            if (time > timings.finishOut) {
                return false;
            }
            const relativeTime = getRelativeTime(timings, time);
            let current = calculateFlagellumPoints(flagellum, startDirection, finishDirection, configuration, relativeTime);
            const target = follow();
            const fTransform = [
                [target.x, target.y],
                [-target.y, target.x],
            ];
            current = current.map((x) => transform(transform(x, rTransform), fTransform));
            const update = createFigureFromPath(current, (d) => Math.max(1, 5 / Math.pow(1 + d, 1 / 4)));
            geometry.setAttribute("position", new BufferAttribute(update.positions, 3));
            geometry.setAttribute("orientation", new BufferAttribute(createOrientation(current.length), 1));
            geometry.setAttribute("trace", new BufferAttribute(createTrace(current), 1));
            geometry.setIndex(update.indices);
            geometry.attributes.position.needsUpdate = true;
            geometry.attributes.orientation.needsUpdate = true;
            geometry.attributes.trace.needsUpdate = true;
            return true;
        },
    };
}
