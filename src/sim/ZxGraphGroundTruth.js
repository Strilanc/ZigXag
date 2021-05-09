// import {GeneralMap} from "src/base/GeneralMap.js";
// import {seq} from "src/base/Seq.js";
// import {Complex} from "src/base/Complex.js"
// import {Matrix} from "src/base/Matrix.js"
// import {ZxPort, ZxGraph, ZxEdge, ZxNode} from "src/sim/ZxGraph.js"
// import {Controls} from "src/sim/Controls.js";
// import {zBasisEqualityMatrix, xBasisEqualityMatrix} from "src/nodes/Base.js";
// import {NODES} from "src/nodes/All.js";
//
//
// class Tensor {
//     /**
//      * @param {!Matrix} data
//      * @param {!Array.<ZxPort>} ports
//      */
//     constructor(data, ports) {
//         if (1 << ports.length !== data.height() || data.width() !== 1) {
//             throw new Error('1 << ports.length !== data.height() || data.width() !== 1');
//         }
//         this.data = data;
//         this.ports = ports;
//     }
//
//     /**
//      * @param {!Matrix} unitary
//      * @param {!ZxPort} port
//      */
//     inline_applyMatrixToPort(unitary, port) {
//         this.data = unitary.applyToStateVectorAtQubitWithControls(
//             this.data,
//             this._indexOfPort(port),
//             Controls.NONE);
//     }
//
//     /**
//      * @param {ZxPort} port
//      * @returns {!int}
//      * @private
//      */
//     _indexOfPort(port) {
//         for (let k = 0; k < this.ports.length; k++) {
//             if (port.isEqualTo(this.ports[k])) {
//                 return k;
//             }
//         }
//
//         throw new Error(`${this} doesn't have port ${port}.`);
//     }
//
//     /**
//      * @param {!Array.<!ZxPort>} newOrder
//      */
//     inline_reorderPorts(newOrder) {
//         for (let newIndex = 0; newIndex < this.ports.length; newIndex++) {
//             let oldIndex = this._indexOfPort(newOrder[newIndex]);
//             if (oldIndex === newIndex) {
//                 continue;
//             }
//             [this.ports[newIndex], this.ports[oldIndex]] = [this.ports[oldIndex], this.ports[newIndex]];
//             this.data = this.data.afterQubitSwap(oldIndex, newIndex);
//         }
//     }
//
//     /**
//      * @param {!ZxPort} port1
//      * @param {!ZxPort} port2
//      * @returns {!Tensor}
//      */
//     _selfContract(port1, port2) {
//         let p1 = this._indexOfPort(port1);
//         let p2 = this._indexOfPort(port2);
//         if (p1 === p2) {
//             throw new Error("Contracted port with itself.");
//         }
//         if (p1 > p2) {
//             [p1, p2] = [p2, p1];
//         }
//
//         let ports = [
//             ...this.ports.slice(0, p1),
//             ...this.ports.slice(p1 + 1, p2),
//             ...this.ports.slice(p2 + 1),
//         ];
//         let data = Matrix.zero(1, this.data.height() / 4);
//
//         let buf1 = this.data.rawBuffer();
//         let buf2 = data.rawBuffer();
//         let n1 = buf1.length >> 1;
//         for (let k = 0; k < n1; k++) {
//             // Contraction axes must agree.
//             let b1 = (k & (1 << p1)) !== 0;
//             let b2 = (k & (1 << p2)) !== 0;
//             if (b1 !== b2) {
//                 continue;
//             }
//
//             // Add into output.
//             let k2 = dropBit(dropBit(k, p2), p1);
//             buf2[k2*2] += buf1[k*2];
//             buf2[k2*2+1] += buf1[k*2+1];
//         }
//         return new Tensor(data, ports);
//     }
//
//     /**
//      * @param {!Tensor} other
//      * @returns {!Tensor}
//      */
//     tensorProduct(other) {
//         return new Tensor(
//             this.data.tensorProduct(other.data),
//             [...other.ports, ...this.ports]);
//     }
//
//     /**
//      * @param {!ZxPort} thisPort
//      * @param {!Tensor} other
//      * @param {!ZxPort} otherPort
//      * @returns {!Tensor}
//      */
//     contracted(thisPort, other, otherPort) {
//         if (this === other) {
//             return this._selfContract(thisPort, otherPort);
//         }
//
//         let p1 = this._indexOfPort(thisPort);
//         let p2 = other._indexOfPort(otherPort);
//         let ports = [
//             ...this.ports.slice(0, p1),
//             ...this.ports.slice(p1 + 1),
//             ...other.ports.slice(0, p2),
//             ...other.ports.slice(p2 + 1),
//         ];
//         let data = Matrix.zero(1, this.data.height() * other.data.height() / 4);
//
//         let buf1 = this.data.rawBuffer();
//         let buf2 = other.data.rawBuffer();
//         let buf3 = data.rawBuffer();
//         let secondWord = this.ports.length - 1;
//         let n1 = buf1.length >> 1;
//         let n2 = buf2.length >> 1;
//         for (let k1 = 0; k1 < n1; k1++) {
//             let c1 = this.data.cell(0, k1);
//             let i1 = dropBit(k1, p1);
//             for (let k2 = 0; k2 < n2; k2++) {
//                 // Contraction axes must agree.
//                 let b1 = (k1 & (1 << p1)) !== 0;
//                 let b2 = (k2 & (1 << p2)) !== 0;
//                 if (b1 !== b2) {
//                     continue;
//                 }
//
//                 // Add input product into output.
//                 let i2 = dropBit(k2, p2);
//                 let k3 = i1 | (i2 << secondWord);
//                 let c2 = other.data.cell(0, k2);
//                 let c3 = c1.times(c2);
//                 buf3[k3*2] += c3.real;
//                 buf3[k3*2+1] += c3.imag;
//             }
//         }
//         return new Tensor(data, ports);
//     }
//
//     /**
//      * @returns {!string}
//      */
//     toString() {
//         return `Tensor(ports=[\n    ${this.ports.join(',\n    ')}\n], data=${this.data})`;
//     }
//
//     /**
//      * @param {object} other
//      * @returns {!boolean}
//      */
//     isEqualTo(other) {
//         if (!(other instanceof Tensor)) {
//             return false;
//         }
//         if (!other.data.isEqualTo(this.data)) {
//             return false;
//         }
//         if (other.ports.length !== this.ports.length) {
//             return false;
//         }
//         for (let k = 0; k < this.ports.length; k++) {
//             if (!this.ports[k].isEqualTo(other.ports[k])) {
//                 return false;
//             }
//         }
//         return true;
//     }
// }
//
//
// /**
//  * @param {!int} val
//  * @param {!int} bit
//  * @returns {!int}
//  */
// function dropBit(val, bit) {
//     let low = val & ((1 << bit) - 1);
//     let high = val >> (bit + 1);
//     return low | (high << bit);
// }
//
// /**
//  * @param {!ZxGraph} graph
//  * @returns {!Matrix}
//  */
// function evalZxGraphGroundTruth(graph) {
//     let portToTensorMap = /** @type {!GeneralMap.<ZxPort, Tensor>} */new GeneralMap();
//     let globalScalar = Complex.ONE;
//
//     let inputPorts = [];
//     let outputPorts = [];
//     for (let node of graph.sortedNodes()) {
//         let kind = graph.nodes.get(node);
//
//         if (kind === '+') {
//             for (let pair of graph.activeCrossingPortPairs(node)) {
//                 let tensor = new Tensor(zBasisEqualityMatrix(0, 2), pair);
//                 for (let port of pair) {
//                     portToTensorMap.set(port, tensor);
//                 }
//             }
//             continue;
//         }
//
//         let nodeKind = NODES.map.get(kind);
//         let ports = graph.activePortsOf(node);
//         let degree = ports.length;
//         if (nodeKind === undefined) {
//             throw new Error(`Unrecognized node kind ${kind}`);
//         }
//         let data = nodeKind.tensor(degree);
//         if (data.width() > 1) {
//             data = new Matrix(1, data.height() * data.width(), data.rawBuffer());
//         }
//
//         if (kind === 'in' || kind === 'out') {
//             let outerPort = new ZxPort(ports[0].edge, new ZxNode(100000, inputPorts.length + outputPorts.length));
//             (kind === 'in' ? inputPorts : outputPorts).push(outerPort);
//             ports.push(outerPort);
//         }
//
//         if (ports.length === 0) {
//             globalScalar = globalScalar.times(data.cell(0, 0));
//         }
//         let tensor = new Tensor(data, ports);
//         for (let port of ports) {
//             portToTensorMap.set(port, tensor);
//         }
//     }
//
//     for (let edge of graph.sortedEdges()) {
//         let kind = graph.edges.get(edge);
//         let [p1, p2] = graph.activePortsOf(edge);
//         let t1 = portToTensorMap.get(p1);
//         let t2 = portToTensorMap.get(p2);
//
//         // Perform a basis change if necessary.
//         let unitary = NODES.map.get(kind === '-' ? '@' : kind).edgeAction.matrix;
//         if (unitary !== 1) {
//             t1.inline_applyMatrixToPort(unitary, p1);
//         }
//
//         // Contract the two tensors into one and rewrite the port to tensor map accordingly.
//         let t3 = t1.contracted(p1, t2, p2);
//         for (let port of t3.ports) {
//             portToTensorMap.set(port, t3);
//         }
//         portToTensorMap.delete(p1);
//         portToTensorMap.delete(p2);
//         if (t3.ports.length === 0) {
//             globalScalar = globalScalar.times(t3.data.cell(0, 0));
//         }
//     }
//
//     let result = new Tensor(Matrix.solo(globalScalar), []);
//     let tensorFactors = seq(portToTensorMap.values()).distinctBy(e => e.ports[0]).toArray();
//     for (let factor of tensorFactors) {
//         result = result.tensorProduct(factor);
//     }
//     result.inline_reorderPorts([...inputPorts, ...outputPorts]);
//     return new Matrix(1 << inputPorts.length, 1 << outputPorts.length, result.data.rawBuffer());
// }
//
// export {Tensor, evalZxGraphGroundTruth}
