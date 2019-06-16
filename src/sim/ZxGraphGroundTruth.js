import {GeneralMap} from "src/base/GeneralMap.js";
import {GeneralSet} from "src/base/GeneralSet.js";
import {seq, Seq} from "src/base/Seq.js";
import {SimulatorSpec} from "src/sim/SimulatorSpec.js"
import {ChpSimulator} from "src/sim/ChpSimulator.js"
import {VectorSimulator} from "src/sim/VectorSimulator.js"
import {Measurement} from "src/sim/Measurement.js"
import {Complex} from "src/base/Complex.js"
import {Matrix} from "src/base/Matrix.js"
import {ZxPort, ZxGraph, ZxEdgePos, ZxNodePos} from "src/sim/ZxGraph.js"
import {BitTable} from "src/sim/BitTable.js"
import {QubitAxis,PauliProduct} from "src/sim/PauliProduct.js"
import {LoggedSimulation} from "src/sim/LoggedSimulator.js";
import {popcnt} from "src/base/Util.js";
import {stabilizerStateToWavefunction} from "src/sim/StabilizerToWave.js";
import {Controls} from "src/sim/Controls.js";


/**
 * @param {!int} inDim
 * @param {!int} outDim
 * @returns {!Matrix}
 */
function zBasisEqualityMatrix(inDim, outDim) {
    let result = Matrix.zero(1 << inDim, 1 << outDim);
    let buf = result.rawBuffer();
    buf[0] = 1;
    buf[buf.length - 2] += 1;
    return result;
}

/**
 * @param {!int} inDim
 * @param {!int} outDim
 * @returns {!Matrix}
 */
function xBasisEqualityMatrix(inDim, outDim) {
    if (inDim + outDim === 0) {
        return Matrix.solo(2);
    }

    let result = Matrix.zero(1 << inDim, 1 << outDim);
    let buf = result.rawBuffer();
    let s = Math.sqrt(4 / (1 << (inDim + outDim)));
    for (let k = 0; k < buf.length; k += 2) {
        if (popcnt(k) % 2 === 0) {
            buf[k] = s;
        }
    }
    return result;
}

class Tensor {
    /**
     * @param {!Matrix} data
     * @param {!Array.<ZxPort>} ports
     */
    constructor(data, ports) {
        if (1 << ports.length !== data.height() || data.width() !== 1) {
            throw new Error('1 << ports.length !== data.height() || data.width() !== 1');
        }
        this.data = data;
        this.ports = ports;
    }

    /**
     * @param {!Matrix} unitary
     * @param {!ZxPort} port
     */
    inline_applyMatrixToPort(unitary, port) {
        this.data = unitary.applyToStateVectorAtQubitWithControls(
            this.data,
            this._indexOfPort(port),
            Controls.NONE);
    }

    /**
     * @param {ZxPort} port
     * @returns {!int}
     * @private
     */
    _indexOfPort(port) {
        for (let k = 0; k < this.ports.length; k++) {
            if (port.isEqualTo(this.ports[k])) {
                return k;
            }
        }

        throw new Error(`${this} doesn't have port ${port}.`);
    }

    /**
     * @param {!Array.<!ZxPort>} newOrder
     */
    inline_reorderPorts(newOrder) {
        for (let newIndex = 0; newIndex < this.ports.length; newIndex++) {
            let oldIndex = this._indexOfPort(newOrder[newIndex]);
            if (oldIndex === newIndex) {
                continue;
            }
            [this.ports[newIndex], this.ports[oldIndex]] = [this.ports[oldIndex], this.ports[newIndex]];
            this.data = this.data.afterQubitSwap(oldIndex, newIndex);
        }
    }

    /**
     * @param {!ZxPort} thisPort
     * @param {!Tensor} other
     * @param {!ZxPort} otherPort
     * @returns {!Tensor}
     */
    contracted(thisPort, other, otherPort) {
        let p1 = this._indexOfPort(thisPort);
        let p2 = other._indexOfPort(otherPort);
        let ports = [
            ...this.ports.slice(0, p1),
            ...this.ports.slice(p1 + 1),
            ...other.ports.slice(0, p2),
            ...other.ports.slice(p2 + 1),
        ];
        let data = Matrix.zero(1, this.data.height() * other.data.height() / 4);

        let buf1 = this.data.rawBuffer();
        let buf2 = other.data.rawBuffer();
        let buf3 = data.rawBuffer();
        let shift2 = p1;
        let shift3 = this.ports.length - 1;
        let shift4 = shift3 + p2;
        let n1 = buf1.length >> 1;
        let n2 = buf2.length >> 1;
        for (let k1 = 0; k1 < n1; k1++) {
            let c1 = this.data.cell(0, k1);
            for (let k2 = 0; k2 < n2; k2++) {
                // Contraction axes must agree.
                let b1 = (k1 & (1 << p1)) !== 0;
                let b2 = (k2 & (1 << p2)) !== 0;
                if (b1 !== b2) {
                    continue;
                }

                // Determine index in result tensor from non-contraction axes.
                let word1 = k1 & ((1 << p1) - 1);
                let word2 = k1 >> (p1 + 1);
                let word3 = k2 & ((1 << p2) - 1);
                let word4 = k2 >> (p2 + 1);
                let k3 = word1 | (word2 << shift2) | (word3 << shift3) | (word4 << shift4);

                // Add input product into output.
                let c2 = other.data.cell(0, k2);
                let c3 = c1.times(c2);
                buf3[k3*2] += c3.real;
                buf3[k3*2+1] += c3.imag;
            }
        }
        return new Tensor(data, ports);
    }

    /**
     * @returns {!string}
     */
    toString() {
        return `Tensor(ports=[\n    ${this.ports.join(',\n    ')}\n], data=${this.data})`;
    }

    /**
     * @param {object} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        if (!(other instanceof Tensor)) {
            return false;
        }
        if (!other.data.isEqualTo(this.data)) {
            return false;
        }
        if (other.ports.length !== this.ports.length) {
            return false;
        }
        for (let k = 0; k < this.ports.length; k++) {
            if (!this.ports[k].isEqualTo(other.ports[k])) {
                return false;
            }
        }
        return true;
    }
}

function basisChangeDict() {
    let s = Math.sqrt(0.5);
    let nis = Complex.I.times(-s);
    return {
        '-': 1,
        'h': Matrix.square(s, s, s, -s),
        'x': Matrix.square(0, 1, 1, 0),
        'z': Matrix.square(1, 0, 0, -1),
        's': Matrix.square(1, 0, 0, Complex.I),
        'f': Matrix.square(s, nis, nis, s),
    };
}

/**
 * @param {!ZxGraph} graph
 * @returns {!Matrix}
 */
function evalZxGraphGroundTruth(graph) {
    let portToTensorMap = /** @type {!GeneralMap.<ZxPort, Tensor>} */new GeneralMap();

    let inputPorts = [];
    let outputPorts = [];
    let nodes = [...graph.nodes.keys()];
    nodes.sort((a, b) => a.orderVal() - b.orderVal());
    for (let node of nodes) {
        let kind = graph.nodes.get(node);
        let ports = graph.activePortsOf(node);
        let degree = ports.length;
        let data;
        if (kind === 'in' || kind === 'out') {
            if (degree !== 1) {
                throw new Error('in/out degree !== 1');
            }
            let outerPort = new ZxPort(ports[0].edge, new ZxNodePos(100000, inputPorts.length + outputPorts.length));
            (kind === 'in' ? inputPorts : outputPorts).push(outerPort);
            ports.push(outerPort);
            data = zBasisEqualityMatrix(0, 2);
        } else if (kind === '@') {
            data = zBasisEqualityMatrix(0, degree);
        } else if (kind === 'O') {
            data = xBasisEqualityMatrix(0, degree);
        } else {
            throw new Error(`Unrecognized node kind ${kind}`);
        }

        let tensor = new Tensor(data, ports);
        for (let port of ports) {
            portToTensorMap.set(port, tensor);
        }
    }

    let edges = [...graph.edges.keys()];
    edges.sort((a, b) => a.orderValXThenY() - b.orderValXThenY());
    for (let edge of graph.edges.keys()) {
        let kind = graph.edges.get(edge);
        let [p1, p2] = graph.activePortsOf(edge);
        let t1 = portToTensorMap.get(p1);
        let t2 = portToTensorMap.get(p2);

        // Perform a basis change if necessary.
        let unitary = basisChangeDict()[kind];
        if (unitary === undefined) {
            throw new Error(`Unrecognized edge kind ${kind}`);
        }
        if (unitary !== 1) {
            t1.inline_applyMatrixToPort(unitary, p1);
        }

        // Contract the two tensors into one and rewrite the port to tensor map accordingly.
        let t3 = t1.contracted(p1, t2, p2);
        for (let port of t3.ports) {
            portToTensorMap.set(port, t3);
        }
        portToTensorMap.delete(p1);
        portToTensorMap.delete(p2);
    }

    let values = seq(portToTensorMap.values()).distinct().toArray();
    if (values.length !== 1) {
        throw new Error('values.length !== 1');
    }
    values[0].inline_reorderPorts([...inputPorts, ...outputPorts]);
    return new Matrix(1 << inputPorts.length, 1 << outputPorts.length, values[0].data.rawBuffer());
}

export {zBasisEqualityMatrix, xBasisEqualityMatrix, Tensor, evalZxGraphGroundTruth}