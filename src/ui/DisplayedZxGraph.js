import {ZxGraph, ZxNode, ZxEdge} from "src/sim/ZxGraph.js";
import {GeneralSet} from "src/base/GeneralSet.js";
import {seq} from "src/base/Seq.js";

class DisplayedZxGraph {
    constructor() {
        this.graph = new ZxGraph();
        this.interpolateStartTime = 0;
        this.interpolateEndTime = 0;
        this.interpolateStartX = 0;
        this.interpolateEndX = 0;
        this.interpolateStartY = 0;
        this.interpolateEndY = 0;
        this.offsetX = 0;
        this.offsetY = 0;
        this.pitch = 50;
    }

    /**
     * @param {!boolean} withMargin
     * @returns {!{x: !int, y: !int, w: !int, h: !int}}
     */
    boundingDrawBox(withMargin=false) {
        let box = this.graph.boundingBox();
        [box.x, box.y] = this.nodeToXy(new ZxNode(box.x, box.y));
        box.w -= 1;
        box.h -= 1;
        box.w *= this.pitch;
        box.h *= this.pitch;
        if (withMargin) {
            box.x -= this.pitch * 2.5;
            box.y -= this.pitch * 2.5;
            box.w += this.pitch * 5;
            box.h += this.pitch * 5;
        }
        return box;
    }

    startCenteringInterpolation() {
        let {x, y} = this.graph.boundingBox();
        let desiredOffsetX = (2.5 - x) * this.pitch;
        let desiredOffsetY = (2.5 - y) * this.pitch;
        this.startInterpolation(0.5, desiredOffsetX, desiredOffsetY);
    }

    /**
     * @param {!number} duration
     * @param {!number} finalOffsetX
     * @param {!number} finalOffsetY
     */
    startInterpolation(duration, finalOffsetX, finalOffsetY) {
        if (this.offsetX === finalOffsetX && this.offsetY === finalOffsetY) {
            duration = 0;
        }

        //noinspection JSUnresolvedVariable
        let t = performance.now();
        this.interpolateStartTime = t;
        this.interpolateEndTime = t + duration*1000;
        this.interpolateStartX = this.offsetX;
        this.interpolateStartY = this.offsetY;
        this.interpolateEndX = finalOffsetX;
        this.interpolateEndY = finalOffsetY;
    }

    /**
     * @param {!number} time
     */
    interpolateTick(time) {
        this.offsetX = smoothStep(
            this.interpolateStartX,
            this.interpolateEndX,
            this.interpolateStartTime,
            this.interpolateEndTime,
            time);
        this.offsetY = smoothStep(
            this.interpolateStartY,
            this.interpolateEndY,
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
            n.x * this.pitch + this.offsetX,
            n.y * this.pitch + this.offsetY
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

        x -= this.offsetX;
        x /= this.pitch;
        x = Math.floor(x + 0.5);

        y -= this.offsetY;
        y /= this.pitch;
        y = Math.floor(y + 0.5);

        return new ZxNode(x, y);
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
        let nx = Math.floor((x - this.offsetX) / this.pitch + 0.25);
        let ny = Math.floor((y - this.offsetY) / this.pitch + 0.25);
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

export {DisplayedZxGraph, floodFillNodeAndUnitEdgeSpace}
