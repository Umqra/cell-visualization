// @ts-ignore
import Events from "./secret/events.json";
import ReconnectingWebSocket from "reconnecting-websocket";

export interface Attack {
    service_id: number;
    attacker_id: number;
    victim_id: number;
    round: number;
}

export interface TeamService {
    id: number;
    flags: number;
    sflags: number;
    sla: number;
    fp: number;
    status: number;
    stdout: string;
}

export interface Service {
    name: string;
    active: number;
}

export interface Team {
    n: number;
    name: string;
    host: string;
    d: number;
    score: number;
    old_score: number;
    services: TeamService[];
    team_id: number;
}

export interface State {
    round: number;
    scoreboard: Team[];
    services: { [key: string]: Service };
}

export type Response = { type: "attack"; value: Attack } | { type: "state"; value: State };

const subscriptions = [];
export function subscribeApi(handler: (r: Response) => void) {
    subscriptions.push(handler);
    return () => {
        const position = subscriptions.indexOf(handler);
        if (position == -1) {
            return;
        }
        subscriptions.splice(position, 1);
    };
}

let active: ReconnectingWebSocket | null = null;

export function updateFakeApi() {
    for (let i = 0; i < Events.length; i++) {
        setTimeout(() => notify(Events[i].data), Events[i].timestamp * 1000);
    }
}

function notify(data) {
    for (const subscription of subscriptions) {
        subscription(data);
    }
}

export function updateApiCredentials(url) {
    if (active != null) {
        active.close();
    }
    active = new ReconnectingWebSocket(url);
    active.onmessage = (e) => {
        notify(JSON.parse(e.data));
    };
    active.onerror = (e) => {
        console.error(e);
    };
}
