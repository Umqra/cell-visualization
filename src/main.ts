import { atom } from "nanostores";
import { ColorRepresentation, Vector2, WebGLRenderer } from "three";
import { WorldConfiguration } from "./configuration";
import { createScene } from "./world/scene";
import { initializeGui } from "./utils/knobs";
import Stats from "stats.js";
import "./microscope/time";
import { convexHull } from "./utils/geometry";
import { updateApiCredentials, updateFakeApi } from "./api";
import { createDetails } from "./microscope/details";
import { createMicroscope } from "./microscope/microscope";

function adjust(adjustable: { setSize(width: number, height: number, arg?: boolean): void }, canvas) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    adjustable.setSize(width, height, false);
    return [width, height];
}

function createConfiguration(canvas, width: number, height: number): WorldConfiguration {
    const configuration: WorldConfiguration = {
        light: {
            color: atom<ColorRepresentation>("rgb(0, 0, 0)"),
            intensity: atom<number>(1),
        },
        soup: {
            count: atom<number>(2),
            width: canvas.clientWidth,
            height: canvas.clientHeight,
        },
        target: {
            appearDuration: atom<number>(250),
            typingDuration: atom<number>(1000),
            selectDuration: atom<number>(2000),
            attackerColor: atom<ColorRepresentation>("rgb(255, 255, 255)"),
            defenderColor: atom<ColorRepresentation>("rgb(255, 100, 100)"),
        },
        cell: {
            segments: atom<number>(10),
            bloomStrength: atom<number>(0.5),
            bloomThreshold: atom<number>(0),
            bloomRadius: atom<number>(6),
            membrane: {
                spline: atom<boolean>(false),
                detalization: atom<number>(50),
                frequency: atom<number>(0.0001),
                skew: atom<number>(0.325),
                thorness: atom<number>(0.2),
                wobbling: atom<number>(0.28),
                transitionDuration: atom<number>(5000),
            },
            organell: {
                transitionDuration: atom<number>(5000),
                colors: {
                    color0: atom<ColorRepresentation>("rgb(128, 84, 84)"),
                    color1: atom<ColorRepresentation>("rgb(106, 130, 86)"),
                    color2: atom<ColorRepresentation>("rgb(110, 101, 173)"),
                    color3: atom<ColorRepresentation>("rgb(175, 160, 111)"),
                    color4: atom<ColorRepresentation>("rgb(175, 127, 195)"),
                },
                membrane: {
                    spline: atom<boolean>(false),
                    detalization: atom<number>(20),
                    frequency: atom<number>(0.00005),
                    skew: atom<number>(Math.PI / 8),
                    thorness: atom<number>(0.2),
                    wobbling: atom<number>(0.5),
                    transitionDuration: atom<number>(5000),
                },
            },
            glowing: atom<number>(0.85),
            radius: atom<number>(120),
            // radius: atom<number>(Math.min((width - 300) / 8, (height - 100) / 8)),
            color: atom<ColorRepresentation>("rgb(84, 105, 125)"),
        },
        flagellum: {
            color: atom<ColorRepresentation>("rgb(84, 105, 125)"),
            segmentLength: atom<number>(50),
            amplitude: atom<number>(100),
            skew: atom<number>(Math.PI),
            wobbling: atom<number>(0.1),
        },
        speed: atom<number>(0.1),
        angular: atom<number>(0.001),
        roundDuration: atom<number>(8000),
    };
    const membraneLimits = {
        segments: { min: 3, max: 10, step: 1 },
        detalization: { min: 1, max: 100, step: 1 },
        frequency: { min: 0, max: 0.01, step: 0.0001 },
        skew: { min: 0, max: Math.PI, step: 0.001 },
        angularLimit: { min: 0, max: 1, step: 0.01 },
        thorness: { min: 0, max: 1, step: 0.1 },
        wobbling: { min: 0, max: 1, step: 0.01 },
    };
    if (false)
        initializeGui(configuration, {
            light: { intensity: { min: 0, max: 1, step: 0.01 } },
            soup: {
                count: { min: 1, max: 40, step: 1 },
            },
            cell: {
                bloomStrength: { min: 0, max: 1, step: 0.01 },
                bloomThreshold: { min: 0, max: 1, step: 0.001 },
                bloomRadius: { min: 0, max: 10, step: 0.01 },
                membrane: membraneLimits,
                radius: { min: 10, max: 200, step: 1 },
                glowing: { min: 0, max: 1, step: 0.01 },
                organell: {
                    membrane: membraneLimits,
                },
            },
            flagellum: {
                segmentLength: { min: 2, max: 100, step: 1 },
                amplitude: { min: 1, max: 200, step: 1 },
                skew: { min: 0, max: Math.PI, step: 0.1 },
                wobbling: { min: 0, max: 1, step: 0.05 },
            },
            speed: { min: 0, max: 10, step: 0.01 },
            angular: { min: 0, max: 1, step: 0.0001 },
            roundDuration: { min: 1000, max: 100_000, step: 100 },
        });
    return configuration;
}

let microcosmos = null;
function initialize() {
    const renderer = new WebGLRenderer({
        canvas: document.getElementById("microcosmos"),
        alpha: true,
    });
    renderer.autoClear = false;
    const [width, height] = adjust(renderer, renderer.domElement);
    const configuration = createConfiguration(renderer.domElement, width, height);
    microcosmos = createScene(configuration, renderer);

    for (const composer of microcosmos.composers) {
        adjust(composer, renderer.domElement);
    }

    const stats = Stats();

    function render(time: number) {
        stats.begin();
        renderer.clear();
        microcosmos.tick(time);
        for (let i = 0; i < microcosmos.composers; i++) {
            microcosmos.composers[i].render();
        }
        for (const composer of microcosmos.composers) {
            composer.render();
            composer.reset();
        }
        stats.end();
        requestAnimationFrame(render);
    }
    requestAnimationFrame(render);

    // stats.showPanel(0);
    // document.body.appendChild(stats.dom);
}

initialize();

let dragging = false;
let start = [0, 0];
document.body.addEventListener("mousedown", (ev) => {
    dragging = true;
    start = [ev.clientX, ev.clientY];
});
document.body.addEventListener("mouseup", (ev) => {
    dragging = false;
});
document.body.addEventListener("mousemove", (ev) => {
    if (dragging) {
        const delta = [-ev.movementX, ev.movementY];
        microcosmos.move(delta[0], delta[1]);
    }
});
document.body.addEventListener("wheel", (ev) => {
    microcosmos.zoom(-ev.deltaY);
    const magnifications = document.getElementsByClassName("magnification");
    for (let i = 0; i < magnifications.length; i++) {
        magnifications[i].textContent = `${Math.round(25 * microcosmos.magnification())}`;
    }
});

function updateApi() {
    // @ts-ignore
    const value = document.getElementById("credentials").value;
    console.info("update api with new credentials: " + value);
    let [username, password] = value.split("/");
    if (username == null || password == null) {
        console.error("bad credentials string");
        return;
    }
    username = username.trim();
    password = password.trim();
    updateApiCredentials(`wss://${username}:${password}@ctf.hitb.org/api/events`);
}

// updateApiCredentials(`ws://localhost:8080/api/events`);
updateFakeApi();
// document.getElementById("credentials").addEventListener("keypress", (e) => (e.code.includes("Enter") ? updateApi() : null));
