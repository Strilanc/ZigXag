import {GeneralMap} from "src/base/GeneralMap.js";
import {seq, Seq} from "src/base/Seq.js";
import {SimulatorSpec} from "src/sim/SimulatorSpec.js"
import {ChpSimulator} from "src/sim/ChpSimulator.js"
import {VectorSimulator} from "src/sim/VectorSimulator.js"
import {Measurement} from "src/sim/Measurement.js"
import {Complex} from "src/base/Complex.js"
import {Matrix} from "src/base/Matrix.js"
import {ZxPort, ZxGraph, ZxEdge, ZxNode} from "src/sim/ZxGraph.js"
import {BitTable} from "src/sim/BitTable.js"
import {QubitAxis,PauliProduct} from "src/sim/PauliProduct.js"
import {popcnt} from "src/base/Util.js";
import {stabilizerStateToWavefunction} from "src/sim/StabilizerToWave.js";
import {
    QuantumProgram,
    Comment,
    HeaderAlloc,
    MeasurementsWithPauliFeedback,
    EdgeActions,
    InitEprPairs,
    MultiCnot,
    AmpsDisplay,
    PostSelection,
} from "src/sim/QuantumProgram.js"
import {NODES} from "src/sim/ZxNodeKind.js";

/**
 * Determines products of Paulis that can be applied after EPR pairs are made, but before spider measurements
 * are performed, without changing the state produced by the graph (up to global phase). This includes both products
 * that are no-ops because they are stabilizers of the EPR pairs as well as products that are no-ops because they
 * exactly match a measurement that is about to be performed.
 *
 * @param {!ZxGraph} graph
 * @param {!GeneralMap.<!ZxPort, !int>} qubitMap
 * @returns {!Array.<!PauliProduct>}
 */
function fixedPointsOfGraph(graph, qubitMap) {
    let fixedPoints = [];

    // Pauli products that are about to be measured are fixed points.
    for (let node of graph.nodes.keys()) {
        fixedPoints.push(..._nodeFixedPoints(graph, node, qubitMap));
    }

    // Stabilizers of the input state are fixed points.
    for (let edge of graph.edges.keys()) {
        fixedPoints.push(..._edgeEprFixedPoints(graph, edge, qubitMap));
    }

    return fixedPoints;
}

/**
 * @param {!PauliProduct} product
 * @param {!int} n
 * @param {!Array.<!int>} qubits
 * @private
 */
function _remapProductQubits(product, n, qubits) {
    return PauliProduct.fromSparseQubitAxes(
        n,
        product.activeQubitAxes().map(axis => new QubitAxis(qubits[axis.qubit], axis.axis)));
}

/**
 * @param {!ZxGraph} graph
 * @param {!ZxNode} node
 * @param {!GeneralMap.<!ZxPort, !int>} qubit_map
 * @private
 */
function _nodeFixedPoints(graph, node, qubit_map) {
    let ports = graph.activePortsOf(node);
    let kind = graph.kind(node);

    let nodeKind = NODES.map.get(kind);
    if (nodeKind === undefined) {
        throw new Error(`Unrecognized node kind ${kind} for fixed points.`);
    }
    let qs = ports.map(p => qubit_map.get(p));
    let products = nodeKind.fixedPoints(qs.length);
    return products.map(e => _remapProductQubits(e, qubit_map.size, qs));
}

/**
 * @param {!ZxGraph} graph
 * @param {!ZxEdge} edge
 * @param {!GeneralMap.<!ZxPort, !int>} qubit_map
 * @private
 */
function _edgeEprFixedPoints(graph, edge, qubit_map) {
    let qubits = edge.ports().map(p => qubit_map.get(p));
    let kind = graph.kind(edge);
    let nodeKind = NODES.map.get(kind === '-' ? '@' : kind);
    if (nodeKind === undefined) {
        throw new Error(`Unrecognized edge kind ${kind} for fixed points.`);
    }
    let products = nodeKind.fixedPoints(2);
    return products.map(e => _remapProductQubits(e, qubit_map.size, qubits));
}

/**
 * Rewrites the set of fixed points internal to the graph into rules for which external elements can be toggled
 * in order to have the same effect as toggling an internal element.
 *
 * In some cases an individual internal toggle will not correspond to any set of external toggles, but a pairing of
 * such internal toggles will. In this case exactly one of the involved internal toggles will be mapped to the external
 * toggle of the pairing, whereas the others are mapped to an 'undefined' rule to indicate the redundancy. This works
 * because this case occurs only when all of the paired internal toggles will be needed at the same time.
 *
 * @param {!Array.<!PauliProduct>} fixedPoints
 * @param {!int} internalWidth The columns of the fixed point table first go over the internal degrees of freedom, then
 *      the external ones. This indicates where the split is located.
 * @returns {!GeneralMap<!QubitAxis, !Array.<!QubitAxis>>}
 * @private
 */
function _internalToExternalMapFromFixedPoints(fixedPoints, internalWidth) {
    let reducedFixedPoints = PauliProduct.gaussianEliminate(fixedPoints).map(e => e.abs());

    let fixupMap = /** @type {!GeneralMap<!QubitAxis, !Array.<!QubitAxis>>} */ new GeneralMap();

    for (let fixedPoint of reducedFixedPoints) {
        let internal = fixedPoint.slice(0, internalWidth);
        if (internal.xzBitWeight() === 0) {
            continue;
        }

        let [control, ...redundantControls] = internal.activeQubitAxes();
        if (fixupMap.has(control)) {
            throw new Error('Control was used twice.')
        }
        for (let pauli of redundantControls) {
            if (fixupMap.get(pauli, undefined) !== undefined) {
                throw new Error('Inconsistent implied control.')
            }
            fixupMap.set(pauli, undefined);
        }
        let externalFlips = fixedPoint.activeQubitAxes().filter(e => e.qubit >= internalWidth);
        fixupMap.set(control, externalFlips);
    }

    return fixupMap;
}

/**
 * @param {!ZxGraph} graph
 * @param {!PortQubitMapping} portQubitMapping
 * @param {!Array.<TransformedMeasurement>} spiderMeasurements
 * @returns {!GeneralMap<!int, !Array.<!QubitAxis>>} Map from in/out axis to measurement qubits that flip it.
 */
function _spiderMeasurementToFeedbackMap(graph, portQubitMapping, spiderMeasurements) {
    let fixedPoints = fixedPointsOfGraph(graph, portQubitMapping.map);
    let externalMap = _internalToExternalMapFromFixedPoints(fixedPoints, portQubitMapping.numInternal);
    let out = new GeneralMap();
    for (let spider of spiderMeasurements) {
        if (!externalMap.has(spider.postselectionControlAxis)) {
            throw new Error('Uncontrollable measurement.');
        }
        let externalFlips = externalMap.get(spider.postselectionControlAxis) || [];
        out.set(spider.measurementAxis.qubit, externalFlips);
    }
    return out;
}

/**
 * @param {!ZxGraph} graph
 * @returns {!PortQubitMapping}
 */
function graphToPortQubitMapping(graph) {
    let portToQubitMap = /** @type {!GeneralMap<!ZxPort, !int>} */ new GeneralMap();

    // Sort and classify nodes.
    let inputNodes = graph.inputNodes();
    let outputNodes = graph.outputNodes();
    let postNodes = graph.postselectionNodesWithAxis();
    let measurementNodes = graph.spiderNodesWithAxis();
    let crossingNodes = graph.crossingNodes();
    let hadamardNodes = graph.hadamardNodes();
    if (inputNodes.length +
            outputNodes.length +
            measurementNodes.length +
            crossingNodes.length +
            hadamardNodes.length +
            postNodes.length !== graph.nodes.size) {
        throw new Error('Unrecognized node(s).');
    }

    // CAREFUL: The order of the nodes' qubits matters!
    // Earlier qubits are isolated by Gaussian eliminations, expressing them in terms of later qubits.
    // Therefore it is important that qubits for nodes we want to eliminate to have qubits that come first.

    // Internal nodes go first.
    for (let node of crossingNodes) {
        for (let p of graph.activePortsOf(node)) {
            portToQubitMap.set(p, portToQubitMap.size);
        }
    }
    for (let node of hadamardNodes) {
        for (let p of graph.activePortsOf(node)) {
            portToQubitMap.set(p, portToQubitMap.size);
        }
    }
    for (let {node} of measurementNodes) {
        for (let p of graph.activePortsOf(node)) {
            portToQubitMap.set(p, portToQubitMap.size);
        }
    }

    // Then input nodes.
    for (let node of inputNodes) {
        let ports = graph.activePortsOf(node);
        if (ports.length !== 1) {
            throw new Error('ports.length !== 1')
        }
        portToQubitMap.set(ports[0], portToQubitMap.size);
    }

    // Then output nodes.
    for (let node of outputNodes) {
        let ports = graph.activePortsOf(node);
        if (ports.length !== 1) {
            throw new Error('ports.length !== 1')
        }
        portToQubitMap.set(ports[0], portToQubitMap.size);
    }

    // And lastly post-selection.
    for (let {node} of postNodes) {
        let ports = graph.activePortsOf(node);
        if (ports.length !== 1) {
            throw new Error('ports.length !== 1')
        }
        portToQubitMap.set(ports[0], portToQubitMap.size);
    }

    return new PortQubitMapping(
        portToQubitMap,
        inputNodes.length,
        outputNodes.length,
        postNodes.length);
}

/**
 * @param {!ZxGraph} graph
 * @returns {!{
 *      stabilizers: !Array.<!PauliProduct>,
 *      wavefunction: !Matrix,
 *      qasm: !string,
 *      quirkUrl: !string,
 *      satisfiable: !boolean,
 *      successProbability: !number,
 * }}
 */
function evalZxGraph(graph) {
    // Prepare simulator.
    let portQubitMapping = graphToPortQubitMapping(graph);
    let outProgram = new QuantumProgram();
    outProgram.statements.push(new HeaderAlloc(portQubitMapping));

    // Perform operations congruent to the ZX graph.
    _zxEval_initEprPairs(outProgram, graph, portQubitMapping.map);
    _zxEval_performSpiderMeasurements(outProgram, graph, portQubitMapping);
    outProgram.statements.push(new AmpsDisplay(
        portQubitMapping.numInternal,
        portQubitMapping.numIn + portQubitMapping.numOut));

    // Derive wavefunction and etc for caller.
    return _analyzeProgram(outProgram, portQubitMapping);
}

class TransformedMeasurement {
    /**
     * @param {!PauliProduct} originalStabilizer
     * @param {!QubitAxis} postselectionControlAxis
     * @param {!QubitAxis} measurementAxis
     */
    constructor(originalStabilizer, measurementAxis, postselectionControlAxis) {
        this.originalStabilizer = originalStabilizer;
        this.measurementAxis = measurementAxis;
        this.postselectionControlAxis = postselectionControlAxis;
    }

    /**
     * @param {*} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        return (other instanceof TransformedMeasurement &&
            this.measurementAxis.isEqualTo(other.measurementAxis) &&
            this.originalStabilizer.isEqualTo(other.originalStabilizer) &&
            this.postselectionControlAxis.isEqualTo(other.postselectionControlAxis));
    }

    /**
     * @returns {!string}
     */
    toString() {
        return `originalStabilizer: ${this.originalStabilizer}
postselectionControlAxis: ${this.postselectionControlAxis}
measurementAxis: ${this.measurementAxis}`;
    }
}

/**
 * @param {!QuantumProgram} outProgram
 * @param {!ZxGraph} graph
 * @param {!GeneralMap.<!ZxPort, !int>} portToQubitMap
 * @private
 */
function _zxEval_initEprPairs(outProgram, graph, portToQubitMap) {
    outProgram.statements.push(new Comment('', 'Init per-edge EPR pairs.'));

    // Identify edge qubit pairs.
    let pairs = [...graph.edges.entries()].map(ek => {
        let [e, kind] = ek;
        let qs = e.ports().map(p => portToQubitMap.get(p));
        qs.sort((a, b) => a - b);
        return {qs, kind};
    });
    pairs.sort((a, b) => (a.qs[0] - b.qs[0])*10000 + (a.qs[1] - b.qs[1]));

    // Make the EPR pairs.
    outProgram.statements.push(new InitEprPairs(...pairs.map(e => e.qs)));

    // Apply any edge-based basis changes.
    let edgeBasisChanges = new GeneralMap();
    for (let pair of pairs) {
        let nodeKind = NODES.map.get(pair.kind === '-' ? '@' : pair.kind);
        if (nodeKind.edgeAction.matrix !== 1) {
            edgeBasisChanges.set(pair.qs[0], pair.kind);
        }
    }
    if (edgeBasisChanges.size > 0) {
        outProgram.statements.push(new EdgeActions(edgeBasisChanges));
    }

    // Apply any spider-based basis changes.
    let nodeBasisChanges = new GeneralMap();
    for (let node of graph.nodes.keys()) {
        let nodeKind = NODES.map.get(graph.kind(node));
        if (nodeKind === NODES.h) {
            continue;
        }
        let ports = graph.activePortsOf(node);
        if (ports.length > 0 && nodeKind.edgeAction.matrix !== 1 && nodeKind.edgeAction.matrix !== null) {
            nodeBasisChanges.set(portToQubitMap.get(ports[0]), nodeKind.id);
        }
    }
    if (nodeBasisChanges.size > 0) {
        outProgram.statements.push(new Comment('', 'Apply spider node transformations.'));
        outProgram.statements.push(new EdgeActions(nodeBasisChanges));
    }
}

/**
 * @param {!QuantumProgram} outProgram
 * @param {!int} totalQubits
 * @param {!Array.<!int>} qubitIds
 * @param {!boolean} axis
 * @returns {!Array.<!TransformedMeasurement>}
 * @private
 */
function _transformedSpiderMeasurement(outProgram, totalQubits, qubitIds, axis) {
    if (qubitIds.length === 0) {
        return [];
    }
    let [head, ...tail] = qubitIds;
    outProgram.statements.push(new MultiCnot(head, tail, !axis, axis));
    let result = [];
    result.push(new TransformedMeasurement(
        PauliProduct.fromXzParity(totalQubits, axis, qubitIds),
        new QubitAxis(head, axis),
        new QubitAxis(head, !axis)));
    for (let t of tail) {
        result.push(new TransformedMeasurement(
            PauliProduct.fromXzParity(totalQubits, !axis, [head, t]),
            new QubitAxis(t, !axis),
            new QubitAxis(t, axis)));
    }
    return result;
}

class PortQubitMapping {
    /**
     * @param {!GeneralMap.<!ZxPort, !int>} map
     * @param {!int} numIn
     * @param {!int} numOut
     * @param {!int} numPost
     */
    constructor(map, numIn, numOut, numPost) {
        this.map = map;
        this.numIn = numIn;
        this.numOut = numOut;
        this.numPost = numPost;
    }

    /**
     * @param {*} other
     * @returns {!boolean}
     */
    isEqualTo(other) {
        return (other instanceof PortQubitMapping &&
            this.map.isEqualTo(other.map) &&
            this.numIn === other.numIn &&
            this.numOut === other.numOut &&
            this.numPost === other.numPost);
    }

    get numQubits() {
        return this.map.size;
    }

    get numExternal() {
        return this.numIn + this.numOut + this.numPost;
    }

    get numInternal() {
        return this.numQubits - this.numExternal;
    }
}

/**
 * @param {!QuantumProgram} outProgram
 * @param {!ZxGraph} graph
 * @param {!PortQubitMapping} portQubitMapping
 * @private
 */
function _zxEval_performSpiderMeasurements(outProgram, graph, portQubitMapping) {
    outProgram.statements.push(new Comment('', 'Perform per-node spider measurements.'));

    // Perform 2-qubit operations and determine what to measure.
    let spiderMeasurements = /** @type {!Array.<TransformedMeasurement>} */ [];
    for (let {node, axis} of graph.spiderNodesWithAxis()) {
        let qubits = graph.activePortsOf(node).map(p => portQubitMapping.map.get(p));
        spiderMeasurements.push(
            ..._transformedSpiderMeasurement(outProgram, portQubitMapping.numQubits, qubits, axis));
    }
    for (let node of graph.hadamardNodes()) {
        let [a, b] = graph.activePortsOf(node).map(p => portQubitMapping.map.get(p));
        outProgram.statements.push(new MultiCnot(a, [b], true, true));
        spiderMeasurements.push(new TransformedMeasurement(
            PauliProduct.fromSparseByType(portQubitMapping.numQubits, {X: a, Z: b}),
            new QubitAxis(a, false),
            new QubitAxis(b, false)));
        spiderMeasurements.push(new TransformedMeasurement(
            PauliProduct.fromSparseByType(portQubitMapping.numQubits, {X: b, Z: a}),
            new QubitAxis(b, false),
            new QubitAxis(a, false)));
    }

    // Perform Bell measurements on crossing lines.
    for (let node of graph.crossingNodes()) {
        for (let pair of graph.activeCrossingPortPairs(node)) {
            let qubits = pair.map(p => portQubitMapping.map.get(p));
            spiderMeasurements.push(
                ..._transformedSpiderMeasurement(outProgram, portQubitMapping.numQubits, qubits, false));
        }
    }

    // Group.
    let xMeasured = spiderMeasurements.filter(e => !e.measurementAxis.axis).map(e => e.measurementAxis.qubit);
    let allMeasured = spiderMeasurements.map(e => e.measurementAxis.qubit);
    allMeasured.sort((a, b) => a - b);

    // Act.
    outProgram.statements.push(new EdgeActions(new Map(xMeasured.map(q => [q, 'h']))));

    let measurementToFeedback = _spiderMeasurementToFeedbackMap(
        graph, portQubitMapping, spiderMeasurements);
    outProgram.statements.push(new MeasurementsWithPauliFeedback(measurementToFeedback));

    let postSelections = new GeneralMap();
    for (let {node, axis} of graph.postselectionNodesWithAxis()) {
        let ports = graph.activePortsOf(node);
        if (ports.length !== 1) {
            throw new Error('Postselection node must have degree 1.');
        }
        let qubit = portQubitMapping.map.get(ports[0]);
        postSelections.set(qubit, axis);
    }
    if (postSelections.size > 0) {
        outProgram.statements.push(new PostSelection(postSelections));
    }
}

/**
 * @param {!QuantumProgram} outProgram
 * @param {!PortQubitMapping} portQubitMapping
 * @returns {!{
 *      stabilizers: !Array.<!PauliProduct>,
 *      wavefunction: !Matrix,
 *      qasm: !string,
 *      quirkUrl: !string,
 *      satisfiable: !boolean,
 *      successProbability: !number,
 * }}
 * @private
 */
function _analyzeProgram(outProgram, portQubitMapping) {
    let qasm = outProgram.qasm();
    let quirkUrl = outProgram.quirkUrl();

    let wantZeroSim = new ChpSimulator(portQubitMapping.numQubits, 0);
    let wantZeroOut = {
        measurements: [],
        successProbability: 1.0,
    };
    try {
        outProgram.interpret(wantZeroSim, wantZeroOut);
    } finally {
        wantZeroSim.destruct();
    }
    let satisfiable = wantZeroOut.measurements.every(e => !e[1]);

    let sim = new ChpSimulator(portQubitMapping.numQubits);
    let out = {
        measurements: [],
        successProbability: 1.0,
    };
    let stabilizers;
    try {
        outProgram.interpret(sim, out);
        stabilizers = _extractRemainingStabilizers(
            sim,
            portQubitMapping.numInternal,
            portQubitMapping.numIn + portQubitMapping.numOut);
    } finally {
        sim.destruct();
    }

    let wavefunction = stabilizerStateToWavefunction(stabilizers);
    wavefunction = new Matrix(1 << portQubitMapping.numIn, 1 << portQubitMapping.numOut, wavefunction.rawBuffer());

    return {
        stabilizers,
        wavefunction,
        qasm,
        quirkUrl,
        satisfiable,
        successProbability: out.successProbability
    };
}

/**
 * @param {!ChpSimulator} stabilizerSim
 * @param {!int} offset
 * @param {!int} len
 * @returns {!Array.<!PauliProduct>}
 * @private
 */
function _extractRemainingStabilizers(stabilizerSim, offset, len) {
    // Extract and normalize stabilizers from simulator.
    let lines = stabilizerSim.toString().split('\n');
    lines = lines.slice(1 + (lines.length >> 1));
    let paulis = PauliProduct.gaussianEliminate(lines.map(PauliProduct.fromString));

    // Only keep lower right of table (the unmeasured qubits).
    lines = paulis.map(e => e.toString());
    lines = lines.slice(offset, offset + len).map(e => e[0] + e.slice(1 + offset, 1 + offset + len));
    paulis = lines.map(PauliProduct.fromString);

    // Normalize
    return PauliProduct.gaussianEliminate(paulis);
}

export {evalZxGraph, graphToPortQubitMapping, fixedPointsOfGraph}
