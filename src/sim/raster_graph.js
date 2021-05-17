import {Util} from "src/base/Util.js";
import {equate_Iterables} from "src/base/Equate.js";
import {describe} from "src/base/Describe.js";
import {ExternalStabilizer} from "src/sim/external_stabilizer.js";
import {stim} from "src/ext/stim.js";
import {text_diagram_to_edge_list} from "src/sim/text_diagram_to_graph.js";


class RasterGraph {
    /**
     * @param {undefined|!Map.<!string, !string>} content
     */
    constructor(content = undefined) {
        this.content = content ?? new Map();
    }

    /**
     * @param {!int} x
     * @param {!int} y
     * @returns {!string}
     */
    get(x, y) {
        return this.content.get(`${x},${y}`) ?? '';
    }

    /**
     * @param {!int} x
     * @param {!int} y
     * @param {undefined|!string} value
     */
    set(x, y, value) {
        let k = `${x},${y}`;
        if (value === '' || value === ' ' || value === undefined) {
            this.content.delete(k);
        } else {
            this.content.set(k, value);
        }
    }

    /**
     * @param {!int} x
     * @param {!int} y
     */
    delete(x, y) {
        this.content.delete(`${x},${y}`);
    }

    /**
     * @returns {!Generator<![!int, !int], void, void>}
     */
    *keys() {
        for (let k of this.content.keys()) {
            let [sx, sy] = k.split(',');
            let x = Number.parseInt(sx);
            let y = Number.parseInt(sy);
            yield [x, y];
        }
    }

    /**
     * @returns {!Generator<![!int, !int, !string], void, void>}
     */
    *entries() {
        for (let [k, v] of this.content.entries()) {
            let [sx, sy] = k.split(',');
            let x = Number.parseInt(sx);
            let y = Number.parseInt(sy);
            yield [x, y, v];
        }
    }

    /**
     * @returns {!{minY: !int, minX: !int, maxY: !int, maxX: !int}}
     */
    boundingBox() {
        let minX = undefined;
        let maxX = undefined;
        let minY = undefined;
        let maxY = undefined;
        for (let [x, y] of this.keys()) {
            if (minX === undefined) {
                minX = x;
                maxX = x;
                minY = y;
                maxY = y;
            } else {
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            }
        }
        if (minX === undefined) {
            minX = 0;
            minY = 0;
            maxX = 0;
            maxY = 0;
        }
        return {minX, maxX, minY, maxY};
    }

    /**
     * @param {!string} text_diagram
     * @returns {!RasterGraph}
     */
    static fromString(text_diagram) {
        let result = new RasterGraph();
        let x = 0;
        let y = 0;
        let accumulating = undefined;
        for (let c of text_diagram) {
            if (c === ']') {
                result.set(x, y, accumulating);
                x++;
                accumulating = undefined;
            } else if (c === '[') {
                accumulating = '';
            } else if (c === '_') {
                // Ignore.
            } else if (c === '\n' || c === ';') {
                x = 0;
                y++;
            } else if (accumulating !== undefined) {
                accumulating += c;
            } else {
                if (c !== '.') {
                    result.set(x, y, c);
                }
                x++;
            }
        }
        return result;
    }

    /**
     * @returns {!string}
     */
    toString(padColumnsToBeEven = true) {
        let {minX, maxX, minY, maxY} = this.boundingBox();
        let output = [];
        for (let y = minY; y <= maxY; y++) {
            let line = [];
            for (let x = minX; x <= maxX; x++) {
                let r = this.get(x, y);
                if (r.includes('[') || r.includes(']') || r.includes('\n') || r.includes('_') || r.includes('.') || r.includes(';')) {
                    throw new Error("Escaping? What's escaping?");
                }
                if (r.length === 0) {
                    r = '.';
                }
                if (r.length > 1) {
                    r = '[' + r + ']';
                }
                line.push(r);
            }
            while (line.length > 0 && line[line.length - 1] === '.') {
                line.pop();
            }
            output.push(line);
        }

        if (padColumnsToBeEven) {
            let w = maxX - minX + 1;
            let h = maxY - minY + 1;
            for (let x = 0; x < w; x++) {
                let n = 0;
                for (let y = 0; y < h; y++) {
                    if (x < output[y].length) {
                        n = Math.max(output[y][x].length, n);
                    }
                }
                for (let y = 0; y < h; y++) {
                    if (x < output[y].length) {
                        output[y][x] += '_'.repeat(n - output[y][x].length);
                    }
                }
            }
        }

        return output.map(e => e.join('')).join(';');
    }
}

export {RasterGraph}
