import {ZxGraph, ZxNode, ZxEdge} from "src/sim/ZxGraph.js";
import {GeneralSet} from "src/base/GeneralSet.js";
import {seq} from "src/base/Seq.js";

class DisplayedZxGraph {
    constructor() {
        this.graph = new ZxGraph();
        this.interpolateStartTime = 0;
        this.interpolateEndTime = 0;
        let m = new Metric([], 50);
        this.metricX = m;
        this.metricY = m;
        this.interpolateStartMetricX = m;
        this.interpolateEndMetricX = m;
        this.interpolateStartMetricY = m;
        this.interpolateEndMetricY = m;
    }

    resetMetric() {
        this.interpolateStartTime = 0;
        this.interpolateEndTime = 0;
        let m = new Metric([], 50);
        this.metricX = m;
        this.metricY = m;
        this.interpolateStartMetricX = m;
        this.interpolateEndMetricX = m;
        this.interpolateStartMetricY = m;
        this.interpolateEndMetricY = m;
    }


    /**
     * @param {!boolean} withMargin
     * @returns {!{x: !int, y: !int, w: !int, h: !int}}
     */
    boundingDrawBox(withMargin=false) {
        let box = this.graph.boundingBox();
        if (withMargin) {
            box.x -= 2;
            box.y -= 2;
            box.w += 4;
            box.h += 4;
        }

        let x = this.metricX.coord(box.x) - 25;
        let y = this.metricY.coord(box.y) - 25;
        let w = this.metricX.coord(box.x + box.w) - x + 50;
        let h = this.metricY.coord(box.y + box.h) - y + 50;
        return {x, y, w, h};
    }

    startCenteringInterpolation() {
        let {x, y} = this.graph.boundingBox();
        let desiredOffsetX = (2.5 - x) * 50;
        let desiredOffsetY = (2.5 - y) * 50;
        this.startInterpolation(0.5, desiredOffsetX, desiredOffsetY);
    }

    /**
     * @param {!Metric} prevX
     * @param {!Metric} prevY
     * @param {!number} duration
     */
    interpolateFrom(prevX, prevY, duration) {
        //noinspection JSUnresolvedVariable
        let t = performance.now();
        this.interpolateStartTime = t;
        this.interpolateEndTime = t + duration*1000;
        this.interpolateStartMetricX = prevX;
        this.interpolateStartMetricY = prevY;
        this.interpolateEndMetricX = this.metricX;
        this.interpolateEndMetricY = this.metricY;
    }

    /**
     * @param {!number} duration
     * @param {!number} finalOffsetX
     * @param {!number} finalOffsetY
     */
    startInterpolation(duration, finalOffsetX, finalOffsetY) {
        //noinspection JSUnresolvedVariable
        let t = performance.now();
        this.interpolateStartTime = t;
        this.interpolateEndTime = t + duration*1000;
        this.interpolateStartMetricX = this.metricX;
        this.interpolateEndMetricY = this.metricY;
        this.interpolateEndMetricX = new Metric([finalOffsetX], 50);
        this.interpolateEndMetricY = new Metric([finalOffsetY], 50);
    }

    /**
     * @param {!number} time
     */
    interpolateTick(time) {
        this.metricX = this.interpolateStartMetricX.smoothStep(
            this.interpolateEndMetricX,
            this.interpolateStartTime,
            this.interpolateEndTime,
            time);
        this.metricY = this.interpolateStartMetricY.smoothStep(
            this.interpolateEndMetricY,
            this.interpolateStartTime,
            this.interpolateEndTime,
            time);
    }

    /**
     * @param {!ZxNode} n
     * @returns {![!number, !number]}
     */
    nodeToXy(n) {
        return [
            this.metricX.coord(n.x),
            this.metricY.coord(n.y),
        ];
    }

    /**
     * @param {!ZxNode|!ZxEdge} element
     * @returns {![!number, !number]}
     */
    graphElementToCenterXy(element) {
        if (element instanceof ZxNode) {
            return this.nodeToXy(element);
        } else {
            let [n1, n2] = element.nodes();
            let [x1, y1] = this.nodeToXy(n1);
            let [x2, y2] = this.nodeToXy(n2);
            return [(x1 + x2) / 2, (y1 + y2) / 2];
        }
    }

    /**
     * @param {!number} x
     * @param {!number} y
     * @param {!ZxNode|!ZxEdge} element
     */
    xyDistanceToGraphElement(x, y, element) {
        let [cx, cy] = this.graphElementToCenterXy(element);
        let dx = x - cx;
        let dy = y - cy;
        return Math.sqrt(dx*dx + dy*dy);
    }

    /**
     * @param {!number|undefined} x
     * @param {!number|undefined} y
     * @returns {undefined|!ZxNode|!ZxEdge}
     */
    xyToNode(x, y) {
        if (x === undefined || y === undefined) {
            return undefined;
        }

        return new ZxNode(this.metricX.closestIndex(x), this.metricX.closestIndex(y));
    }

    /**
     * @param {!number|undefined} x
     * @param {!number|undefined} y
     * @returns {undefined|!ZxNode|!ZxEdge}
     */
    xyToGraphElement(x, y) {
        if (x === undefined || y === undefined) {
            return undefined;
        }
        let nx = this.metricX.closestIndex(x);
        let ny = this.metricY.closestIndex(y);
        let region = seq(floodFillNodeAndUnitEdgeSpace(new ZxNode(nx, ny))).take(20);
        region = region.filter(e => e instanceof ZxEdge || this.graph.has(e));
        return region.minBy(e => this.xyDistanceToGraphElement(x, y, e));
    }
}

function smoothStep(v0, v1, t0, t1, t) {
    if (t >= t1) {
        return v1;
    }
    if (t <= t0) {
        return v0;
    }
    t = (t - t0) / (t1 - t0);
    t = 3*t*t - 2*t*t*t;
    return (1 - t) * v0 + t * v1;
}

/**
 * @param {!ZxNode|!ZxEdge} element
 * @yields {!ZxNodePos|!ZxEdgePos}
 */
function* floodFillNodeAndUnitEdgeSpace(element) {
    let queue = [element];
    let seen = new GeneralSet();
    while (queue.length > 0) {
        let next = queue.shift();
        if (seen.has(next)) {
            continue;
        }
        seen.add(next);
        yield next;
        if (next instanceof ZxNode) {
            queue.push(...next.unitEdges())
        } else {
            queue.push(...next.nodes())
        }
    }
    throw new Error('UNREACHABLE');
}

class Metric {
    /**
     * @param {!Array.<!number>} ticks
     * @param {!number} defaultTick
     */
    constructor(ticks, defaultTick) {
        ticks = [...ticks];
        while (ticks.length > 0 && ticks[ticks.length - 1] - ticks[ticks.length - 2] === defaultTick) {
            ticks.pop();
        }
        this.ticks = ticks;
        this.defaultTick = defaultTick;
    }

    /**
     * @param {!number} coord
     * @returns {!int}
     */
    closestIndex(coord) {
        let left = this.ticks.length > 0 ? this.ticks[0] : 0;
        let right = this.ticks.length > 0 ? this.ticks[this.ticks.length - 1] : 0;
        if (coord < left) {
            return Math.round((coord - left) / this.defaultTick);
        }
        if (coord > right) {
            return Math.round((coord - right) / this.defaultTick) + this.ticks.length - 1;
        }
        for (let i = 0; i < this.ticks.length - 1; i++) {
            if (coord <= (this.coord(i) + this.coord(i + 1)) / 2) {
                return i;
            }
        }
        return this.ticks.length - 1;
    }

    /**
     * @returns {!string}
     */
    toString() {
        return `Metric([${this.ticks}], ${this.defaultTick})`;
    }

    /**
     * @param {!int} index
     * @returns {!number}
     */
    coord(index) {
        if (index < 0) {
            let base = this.ticks.length !== 0 ? this.ticks[0] : 0;
            return base + this.defaultTick * index;
        }
        if (index >= this.ticks.length) {
            let base = this.ticks.length !== 0 ? this.ticks[this.ticks.length - 1] : 0;
            return base + this.defaultTick * (index - this.ticks.length + 1);
        }
        return this.ticks[index];
    }

    /**
     * @param {!Metric} other
     * @param {!number} t
     */
    lerp(other, t) {
        let n = Math.max(this.ticks.length, other.ticks.length);
        let ticks = [];
        for (let i = 0; i < n; i++) {
            ticks.push(_lerp(this.coord(i), other.coord(i), t));
        }
        return new Metric(
            ticks,
            _lerp(this.defaultTick, other.defaultTick, t));
    }

    /**
     * @param {!Metric} other
     * @param {!number} t0
     * @param {!number} t1
     * @param {!number} t
     */
    smoothStep(other, t0, t1, t) {
        if (t <= t0) {
            return this;
        }
        if (t >= t1) {
            return other;
        }
        let n = Math.max(this.ticks.length, other.ticks.length);
        let ticks = [];
        for (let i = 0; i < n; i++) {
            ticks.push(smoothStep(this.coord(i), other.coord(i), t0, t1, t));
        }
        return new Metric(
            ticks,
            smoothStep(this.defaultTick, other.defaultTick, t, t0, t1, t));
    }
}

/**
 * @param {!number} a
 * @param {!number} b
 * @param {!number} t
 * @returns {!number}
 * @private
 */
function _lerp(a, b, t) {
    return a * (1 - t) + b * t;
}

export {DisplayedZxGraph, floodFillNodeAndUnitEdgeSpace, Metric}
