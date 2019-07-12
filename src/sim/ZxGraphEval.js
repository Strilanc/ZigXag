import {GeneralMap} from "src/base/GeneralMap.js";
import {ChpSimulator} from "src/sim/ChpSimulator.js"
import {Matrix} from "src/base/Matrix.js"
import {ZxPort, ZxGraph, ZxEdge, ZxNode} from "src/sim/ZxGraph.js"
import {QubitAxis,PauliProduct} from "src/sim/PauliProduct.js"
import {stabilizerStateToWavefunction} from "src/sim/StabilizerToWave.js";
import {
    QuantumProgram,
    Comment,
    HeaderAlloc,
    MeasurementsWithPauliFeedback,
    InitEprPairs,
    AmpsDisplay,
    PostSelection,
} from "src/sim/QuantumProgram.js"
import {NODES, EdgeActions} from "src/sim/ZxNodeKind.js";

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
 * @param {!Array.<TransformedMeasurement>} transMeasurements
 * @returns {!GeneralMap<!int, !Array.<!QubitAxis>>} Map from in/out axis to measurement qubits that flip it.
 */
function _transformedMeasurementToFeedbackMap(graph, portQubitMapping, transMeasurements) {
    let fixedPoints = fixedPointsOfGraph(graph, portQubitMapping.map);
    let externalMap = _internalToExternalMapFromFixedPoints(fixedPoints, portQubitMapping.numInternal);
    let out = new GeneralMap();
    for (let transMeasure of transMeasurements) {
        if (!externalMap.has(transMeasure.postselectionControlAxis)) {
            throw new Error('Uncontrollable measurement.');
        }
        let externalFlips = externalMap.get(transMeasure.postselectionControlAxis) || [];
        out.set(transMeasure.measurementAxis.qubit, externalFlips);
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
    _zxEval_initEdgeEprPairs(outProgram, graph, portQubitMapping.map);
    _zxEval_performNodeMeasurements(outProgram, graph, portQubitMapping);
    outProgram.statements.push(new AmpsDisplay(
        portQubitMapping.numInternal,
        portQubitMapping.numIn + portQubitMapping.numOut));

    // Derive wavefunction and etc for caller.
    return _analyzeProgram(outProgram, portQubitMapping);
}

/**
 * @param {!QuantumProgram} outProgram
 * @param {!ZxGraph} graph
 * @param {!GeneralMap.<!ZxPort, !int>} portToQubitMap
 * @private
 */
function _zxEval_initEdgeEprPairs(outProgram, graph, portToQubitMap) {
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
        outProgram.statements.push(new EdgeActions(edgeBasisChanges, false));
    }
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
function _zxEval_performNodeMeasurements(outProgram, graph, portQubitMapping) {
    // Apply single-qubit basis changes.
    let nodeBasisChanges = new GeneralMap();
    for (let node of graph.nodes.keys()) {
        let nodeKind = NODES.map.get(graph.kind(node));
        if (nodeKind === NODES.h) {
            continue;
        }
        let ports = graph.activePortsOf(node);
        let mat = nodeKind.nodeRootEdgeAction.matrix;
        if (ports.length > 0 && mat !== 1 && mat !== null) {
            nodeBasisChanges.set(portQubitMapping.map.get(ports[0]), nodeKind.id);
        }
    }
    if (nodeBasisChanges.size > 0) {
        outProgram.statements.push(new Comment('', 'Apply per-node basis changes.'));
        outProgram.statements.push(new EdgeActions(nodeBasisChanges, true));
    }

    // Multi-qubit basis changes and transformed measurement collection.
    outProgram.statements.push(new Comment('', 'Perform per-node measurements.'));
    let transMeasurements = /** @type {!Array.<TransformedMeasurement>} */ [];
    for (let [node, kind] of graph.nodes.entries()) {
        if (kind !== '+') {
            let nodeKind = NODES.map.get(kind);
            let qubits = graph.activePortsOf(node).map(p => portQubitMapping.map.get(p));
            transMeasurements.push(
                ...nodeKind.nodeMeasurer(outProgram, portQubitMapping.numQubits, qubits));
        } else {
            for (let pair of graph.activeCrossingPortPairs(node)) {
                let qubits = pair.map(p => portQubitMapping.map.get(p));
                transMeasurements.push(
                    ...NODES.black.nodeMeasurer(outProgram, portQubitMapping.numQubits, qubits, false));
            }
        }
    }

    // Group transformed measurements by basis.
    let xMeasured = transMeasurements.filter(e => !e.measurementAxis.axis).map(e => e.measurementAxis.qubit);
    let allMeasured = transMeasurements.map(e => e.measurementAxis.qubit);
    allMeasured.sort((a, b) => a - b);

    // Measurements and feedback.
    outProgram.statements.push(new EdgeActions(new Map(xMeasured.map(q => [q, 'h'])), false));
    let measurementToFeedback = _transformedMeasurementToFeedbackMap(
        graph, portQubitMapping, transMeasurements);
    outProgram.statements.push(new MeasurementsWithPauliFeedback(measurementToFeedback));

    // Post-selections.
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
