import { Color, ColorRepresentation, Mesh, MeshBasicMaterial, Object3D, ShaderMaterial, Uniform, Vector2 } from "three";
import { CellConfiguration, FlagellumConfiguration, Unwrap } from "../configuration";
import { createFlagellum } from "./flagellum";
import { createAliveMembrane } from "./alive-membrane";
import { getHSLVector } from "../utils/draw";
import { tickAll } from "../utils/tick";
import { Timings } from "../utils/timings";
import { getRegularPolygon, getSectorIn, scalePoints, zero2 } from "../utils/geometry";
import { CellElement, FlagellumElement, OrganellInfo } from "./types";
import { createOrganells } from "./organells";

// @ts-ignore
import CellVertexShader from "../shaders/cell-vertex.shader";
// @ts-ignore
import CellFragmentShader from "../shaders/cell-fragment.shader";

export function createAliveCell(cellConfig: Unwrap<CellConfiguration>, flagellumConfig: Unwrap<FlagellumConfiguration>): CellElement {
    const r = cellConfig.radius / Math.cos(Math.PI / cellConfig.segments);
    const membrane = { points: getRegularPolygon(cellConfig.segments, r) };
    const { geometry, tick: membraneTick, scale: membraneScale, getScale: membraneGetScale } = createAliveMembrane(membrane, cellConfig.membrane);
    let flagellums: FlagellumElement[] = [];
    let organells = createOrganells(membrane.points);

    const color = new Color(cellConfig.color);
    const material = new ShaderMaterial({
        uniforms: {
            u_color: new Uniform(getHSLVector(cellConfig.color)),
            u_start: new Uniform(cellConfig.glowing),
        },
        vertexShader: CellVertexShader,
        fragmentShader: CellFragmentShader,
        transparent: true,
    });
    const multiverse = new Object3D();
    const cell = new Mesh(geometry, material);
    cell.renderOrder = 1;
    multiverse.add(cell);
    multiverse.add(organells.multiverse);
    organells.multiverse.renderOrder = 2;
    return {
        multiverse: multiverse,
        tick: (time: number) => {
            flagellums = tickAll(flagellums, time, (f) => multiverse.remove(f.multiverse));
            membraneTick(time);
            organells.tick(time);
            organells.multiverse.rotateZ(0.001);
            return true;
        },
        get: (id: number) => {
            const state = organells.get(id);
            return { center: new Vector2().copy(state.center).rotateAround(zero2, organells.multiverse.rotation.z), weight: state.weight };
        },
        getAll: () => {
            return organells.getAll();
        },
        irritate(id: number, start: number, finish: number) {
            organells.irritate(id, start, finish);
            // for (let i = 0; i < state.length; i++) {
            //     if (state[i].id === id) {
            //         organells[i].glow(start, finish);
            //         break;
            //     }
            // }
        },
        update: (size: number, organellInfos: OrganellInfo[]) => {
            membraneScale(size / cellConfig.radius);
            organells.spawnMany(organellInfos);
            organells.scale(size / cellConfig.radius);
        },
        spawn: (id: number, weight: number, active: boolean, color: ColorRepresentation) => {
            organells.spawn(id, weight, active, color);
        },
        attack: (targets: Vector2[], start: number, finish: number): Timings => {
            const duration = finish - start;
            const timing = {
                startIn: start,
                finishIn: start + duration * 0.3,
                startOut: start + duration * 0.5,
                finishOut: start + duration,
            };
            for (let i = 0; i < targets.length; i++) {
                const { point, id } = getSectorIn(targets[i], membrane.points);
                const attach = new Vector2().copy(point).multiplyScalar(0.9 * membraneGetScale());
                const flagellum = createFlagellum(
                    {
                        startDirection: new Vector2().copy(point),
                        finishDirection: new Vector2().subVectors(targets[i], attach),
                        target: new Vector2().subVectors(targets[i], attach),
                        timings: timing,
                    },
                    flagellumConfig
                );
                flagellum.multiverse.position.set(attach.x, attach.y, 0);
                flagellum.multiverse.renderOrder = 3;
                multiverse.add(flagellum.multiverse);
                flagellums.push(flagellum);
            }
            return timing;
        },
    };
}
