import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Line, LineBasicMaterial, Object3D, Path, Vector2 } from "three";
import { FlagellumConfiguration, Unwrap } from "../configuration";
import { getComponents } from "../utils/draw";
import { randomFrom } from "../utils/math";
import { zero2 } from "../utils/geometry";
import { calculateDeformation, Deformation } from "./deformation";

interface Flagellum {
    points: Vector2[];
    jitters: Vector2[];
    deformations: Deformation[];
    length: number;
}

function generateFlagellum(target: Vector2, { segmentLength, amplitude, skewLimit }: Unwrap<FlagellumConfiguration>) {
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
        const jitter = i == segments - 1 ? 0 : randomFrom(0, amplitude) * sign;
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
        const angle = randomFrom(skewLimit / 2, skewLimit) * sign;
        sign = -sign;
        const next = i == 0 ? points[i + 1] : points[i - 1];
        const distance = points[i].distanceTo(next);
        deformations.push({ angle, length: randomFrom(distance, 2 * distance) });
    }
    return { points, length, deformations, jitters };
}

function calculateFlagellumPoints(
    { points, length, deformations, jitters }: Flagellum,
    startDirection: Vector2,
    finishDirection: Vector2,
    { inOutRatio }: Unwrap<FlagellumConfiguration>,
    time: number
) {
    let k = time * length;
    const path = new Path();
    path.moveTo(points[0].x, points[0].y);
    let jittered = [];
    for (let i = 0; i < points.length; i++) {
        const ttt = Math.cos(2 * Math.PI * time) * (1 - Math.min(1, time));
        jittered.push(new Vector2().copy(points[i]).addScaledVector(jitters[i], ttt));
    }
    if (time > 0) {
        for (let i = 1; i < jittered.length; i++) {
            let current = jittered[i].distanceTo(jittered[i - 1]);
            const direction1 = i == 1 ? startDirection : new Vector2().subVectors(jittered[i], jittered[i - 1]);
            const direction2 = i == jittered.length - 1 ? finishDirection : new Vector2().subVectors(jittered[i], jittered[i + 1]);
            const c = 0.1 + 0.9 * Math.max(0, 1 - time);
            const l1 = deformations[i - 1].length * c;
            const l2 = deformations[i].length * c;

            const a1 = deformations[i - 1].angle * c * Math.cos(Math.PI * time + i - 1);
            const a2 = deformations[i].angle * c * Math.cos(Math.PI * time + i);
            const c1 = calculateDeformation(jittered[i - 1], direction1, { angle: a1, length: l1 }, 0);
            const c2 = calculateDeformation(jittered[i], direction2, { angle: a2, length: l2 }, 0);
            if (current > k) {
                const alpha = k / current;
                const i1 = new Vector2().addScaledVector(jittered[i - 1], 1 - alpha).addScaledVector(c1, alpha);
                const j1 = new Vector2().addScaledVector(c1, 1 - alpha).addScaledVector(c2, alpha);
                const k1 = new Vector2().addScaledVector(c2, 1 - alpha).addScaledVector(jittered[i], alpha);
                const i2 = new Vector2().addScaledVector(i1, 1 - alpha).addScaledVector(j1, alpha);
                const j2 = new Vector2().addScaledVector(j1, 1 - alpha).addScaledVector(k1, alpha);
                const i3 = new Vector2().addScaledVector(i2, 1 - alpha).addScaledVector(j2, alpha);
                path.bezierCurveTo(i1.x, i1.y, i2.x, i2.y, i3.x, i3.y);
                break;
            } else {
                path.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, jittered[i].x, jittered[i].y);
                k -= current;
            }
        }
    }
    return path.getPoints(50);
}

export interface FlagellumState {
    startDirection: Vector2;
    finishDirection: Vector2;
    target: Vector2;
    startIn: number;
    finishIn: number;
    startOut: number;
    finishOut: number;
}

export function createFlagellum({ startDirection, finishDirection, target, startIn, finishIn, startOut, finishOut }: FlagellumState, configuration: Unwrap<FlagellumConfiguration>) {
    const material = new LineBasicMaterial({ color: configuration.color });
    const flagellum = generateFlagellum(target, configuration);
    let positionAttribute = new BufferAttribute(getComponents(calculateFlagellumPoints(flagellum, startDirection, finishDirection, configuration, 0)), 3);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", positionAttribute);
    const curve = new Line(geometry, material);
    return {
        object: curve,
        finish: finishOut,
        tick: (time: number) => {
            if (time > finishOut) {
                return;
            }
            let relativeTime = 0;
            if (time < finishIn) {
                relativeTime = (time - startIn) / (finishIn - startIn);
            } else if (time > startOut) {
                relativeTime = 1 - (time - startOut) / (finishOut - startOut);
            } else {
                relativeTime = 1 + (Math.min(time - finishIn, startOut - time) / (startOut - finishIn)) * 2;
            }
            const current = calculateFlagellumPoints(flagellum, startDirection, finishDirection, configuration, relativeTime);
            if (current.length === positionAttribute.count) {
                positionAttribute.set(getComponents(current));
                positionAttribute.needsUpdate = true;
            } else {
                const update = new BufferAttribute(getComponents(current), 3);
                geometry.setAttribute("position", update);
                positionAttribute = update;
            }
        },
    };
}
