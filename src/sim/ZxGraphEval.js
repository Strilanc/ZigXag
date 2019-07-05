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
    SingleQubitGates,
    InitEprPairs,
    MultiCnot,
    AmpsDisplay,
} from "src/sim/QuantumProgram.js"

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
        fixedPoints.push(..._nodeSpiderFixedPoints(graph, node, qubitMap));
    }

    // Stabilizers of the input state are fixed points.
    for (let edge of graph.edges.keys()) {
        fixedPoints.push(..._edgeEprFixedPoints(graph, edge, qubitMap));
    }

    return fixedPoints;
}

/**
 * @param {!ZxGraph} graph
 * @param {!ZxNode} node
 * @param {!GeneralMap.<!ZxPort, !int>} qubit_map
 * @private
 */
function _nodeSpiderFixedPoints(graph, node, qubit_map) {
    let ports = graph.activePortsOf(node);
    let kind = graph.kind(node);

    if (kind === 'in' || kind === 'out') {
        return [];
    }

    if (kind === 'O' || kind === '@') {
        if (ports.length === 0) {
            return [];
        }

        let axis = kind === '@';
        let qs = ports.map(p => qubit_map.get(p));

        let result = [];
        result.push(PauliProduct.fromXzParity(qubit_map.size, !axis, qs));
        for (let i = 1; i < qs.length; i++) {
            result.push(PauliProduct.fromXzParity(qubit_map.size, axis, [qs[0], qs[i]]));
        }
        return result;
    }

    if (kind === '+') {
        let result = [];
        for (let portPair of graph.activeCrossingPortPairs(node)) {
            let qs = portPair.map(p => qubit_map.get(p));
            result.push(
                PauliProduct.fromSparseByType(qubit_map.size, {X: qs}),
                PauliProduct.fromSparseByType(qubit_map.size, {Z: qs}));
        }
        return result;
    }


    throw new Error(`Unrecognized node kind ${kind}.`);
}

/**
 * @param {!ZxGraph} graph
 * @param {!ZxEdge} edge
 * @param {!GeneralMap.<!ZxPort, !int>} qubit_map
 * @private
 */
function _edgeEprFixedPoints(graph, edge, qubit_map) {
    let [a, b] = edge.ports().map(p => qubit_map.get(p));
    let kind = graph.kind(edge);
    let f = v => PauliProduct.fromSparseByType(qubit_map.size, v);

    if (kind === '-' || kind === 'x' || kind === 'z') {
        return [f({X: [a, b]}), f({Z: [a, b]})];
    }

    if (kind === 'h') {
        return [f({X: a, Z: b}), f({Z: a, X: b})];
    }

    if (kind === 'f') {
        return [f({X: [a, b]}), f({Y: a, Z: b})];
    }

    if (kind === 's') {
        return [f({X: a, Y: b}), f({Z: [a, b]})];
    }

    throw new Error(`Unrecognized edge kind ${kind}.`);
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
 * @param {!int} externalWidth The columns of the fixed point table first go over the internal degrees of freedom, then
 *      the external ones. This indicates how many external degrees of freedom there are, allowing us to tell which
 *      columns correspond to what. In other words, this is the number of input edges plus the number of output edges.
 * @returns {!GeneralMap<!QubitAxis, !Array.<!QubitAxis>>}
 * @private
 */
function _internalToExternalMapFromFixedPoints(fixedPoints, externalWidth) {
    let reducedFixedPoints = PauliProduct.gaussianEliminate(fixedPoints).map(e => e.abs());

    let width = fixedPoints.length === 0 ? 0 : fixedPoints[0].paulis.length;
    let internalWidth = width - externalWidth;
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
 * @param {!GeneralMap.<!ZxPort, !int>} portToQubitMap
 * @param {!Array.<TransformedMeasurement>} spiderMeasurements
 * @param {!int} numIn
 * @param {!int} numOut
 * @returns {!GeneralMap<!int, !Array.<!QubitAxis>>} Map from in/out axis to measurement qubits that flip it.
 */
function _spiderMeasurementToFeedbackMap(graph, portToQubitMap, spiderMeasurements, numIn, numOut) {
    let fixedPoints = fixedPointsOfGraph(graph, portToQubitMap);
    let externalMap = _internalToExternalMapFromFixedPoints(fixedPoints, numIn + numOut);
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
 * @returns {!{portToQubitMap: !GeneralMap<!ZxPort, !int>, num_inputs: !int, num_outputs: !int}}
 */
function generatePortToQubitMap(graph) {
    let portToQubitMap = /** @type {!GeneralMap<!ZxPort, !int>} */ new GeneralMap();

    // Sort and classify nodes.
    let inputNodes = graph.inputNodes();
    let outputNodes = graph.outputNodes();
    let measurementNodes = graph.spiderMeasurementNodes();
    let crossingNodes = graph.crossingNodes();
    if (inputNodes.length + outputNodes.length + measurementNodes.length + crossingNodes.length !== graph.nodes.size) {
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

    // And lastly output nodes.
    for (let node of outputNodes) {
        let ports = graph.activePortsOf(node);
        if (ports.length !== 1) {
            throw new Error('ports.length !== 1')
        }
        portToQubitMap.set(ports[0], portToQubitMap.size);
    }

    return {portToQubitMap, num_inputs: inputNodes.length, num_outputs: outputNodes.length};
}

/**
 * @param {!ZxGraph} graph
 * @returns {!{
 *      stabilizers: !Array.<!PauliProduct>,
 *      wavefunction: !Matrix,
 *      qasm: !string,
 *      quirk_url: !string,
 *      satisfiable: !boolean
 * }}
 */
function evalZxGraph(graph) {
    // Prepare simulator.
    let {portToQubitMap, num_inputs: numIn, num_outputs: numOut} = generatePortToQubitMap(graph);
    let outProgram = new QuantumProgram();
    let numInternal = portToQubitMap.size - numIn - numOut;
    outProgram.statements.push(new HeaderAlloc(portToQubitMap.size, numInternal));

    // Perform operations congruent to the ZX graph.
    _zxEval_initEprPairs(outProgram, graph, portToQubitMap);
    _zxEval_performSpiderMeasurements(outProgram, graph, portToQubitMap, numIn, numOut);
    outProgram.statements.push(new AmpsDisplay(numInternal, numIn + numOut));

    // Derive wavefunction and etc for caller.
    return _analyzeProgram(outProgram, portToQubitMap.size, numIn, numOut);
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

    // Apply any basis changes.
    let knownBasisChanges = ['h', 'x', 'z', 's', 'f'];
    let basisChanges = new GeneralMap(...pairs.
        filter(e => knownBasisChanges.indexOf(e.kind) !== -1).
        map(e => [e.qs[1], e.kind]));
    if (basisChanges.size > 0) {
        outProgram.statements.push(new SingleQubitGates(basisChanges));
    }
}

/**
 * @param {!QuantumProgram} outProgram
 * @param {!int} n
 * @param {!Array.<!int>} qubitIds
 * @param {!boolean} axis
 * @returns {!Array.<!TransformedMeasurement>}
 * @private
 */
function _transformedSpiderMeasurement(outProgram, n, qubitIds, axis) {
    if (qubitIds.length === 0) {
        return [];
    }
    let [head, ...tail] = qubitIds;
    outProgram.statements.push(new MultiCnot(head, tail, !axis));
    let result = [];
    result.push(new TransformedMeasurement(
        PauliProduct.fromXzParity(n, axis, qubitIds),
        new QubitAxis(head, axis),
        new QubitAxis(head, !axis)));
    for (let t of tail) {
        result.push(new TransformedMeasurement(
            PauliProduct.fromXzParity(n, !axis, [head, t]),
            new QubitAxis(t, !axis),
            new QubitAxis(t, axis)));
    }
    return result;
}

/**
 * @param {!QuantumProgram} outProgram
 * @param {!ZxGraph} graph
 * @param {!GeneralMap.<!ZxPort, !int>} portToQubitMap
 * @param {!int} numIn
 * @param {!int} numOut
 * @private
 */
function _zxEval_performSpiderMeasurements(outProgram, graph, portToQubitMap, numIn, numOut) {
    outProgram.statements.push(new Comment('', 'Perform per-node spider measurements.'));
    let n = portToQubitMap.size;

    // Perform 2-qubit operations and determine what to measure.
    let spiderMeasurements = /** @type {!Array.<TransformedMeasurement>} */ [];
    for (let {node, axis} of graph.spiderMeasurementNodes()) {
        let qubits = graph.activePortsOf(node).map(p => portToQubitMap.get(p));
        spiderMeasurements.push(..._transformedSpiderMeasurement(outProgram, n, qubits, axis));
    }

    // Perform Bell measurements on crossing lines.
    for (let node of graph.crossingNodes()) {
        for (let pair of graph.activeCrossingPortPairs(node)) {
            let qubits = pair.map(p => portToQubitMap.get(p));
            spiderMeasurements.push(..._transformedSpiderMeasurement(outProgram, n, qubits, false));
        }
    }

    // Group.
    let xMeasured = spiderMeasurements.filter(e => !e.measurementAxis.axis).map(e => e.measurementAxis.qubit);
    let allMeasured = spiderMeasurements.map(e => e.measurementAxis.qubit);
    allMeasured.sort((a, b) => a - b);

    // Act.
    outProgram.statements.push(new SingleQubitGates(new Map(xMeasured.map(q => [q, 'h']))));

    let measurementToFeedback = _spiderMeasurementToFeedbackMap(
        graph, portToQubitMap, spiderMeasurements, numIn, numOut);
    outProgram.statements.push(new MeasurementsWithPauliFeedback(measurementToFeedback));
}

/**
 * @param {!QuantumProgram} outProgram
 * @param {!int} numQubits
 * @param {!int} numIn
 * @param {!int} numOut
 * @returns {!{
 *      stabilizers: !Array.<!PauliProduct>,
 *      wavefunction: !Matrix,
 *      qasm: !string,
 *      quirk_url: !string,
 *      satisfiable: !boolean
 * }}
 * @private
 */
function _analyzeProgram(outProgram, numQubits, numIn, numOut) {
    let numKept = numIn + numOut;

    let qasm = outProgram.qasm();
    let quirk_url = outProgram.quirkUrl();

    let wantZeroSim = new ChpSimulator(numQubits, 0);
    let out = [];
    try {
        outProgram.interpret(wantZeroSim, out);
    } finally {
        wantZeroSim.destruct();
    }
    let satisfiable = out.every(e => e === false);

    let sim = new ChpSimulator(numQubits);
    let stabilizers;
    try {
        outProgram.interpret(sim, []);
        stabilizers = _extractRemainingStabilizers(sim, numKept);
    } finally {
        sim.destruct();
    }

    let wavefunction = stabilizerStateToWavefunction(stabilizers);
    wavefunction = new Matrix(1 << numIn, 1 << numOut, wavefunction.rawBuffer());

    return {
        stabilizers,
        wavefunction,
        qasm,
        quirk_url,
        satisfiable,
    };
}

/**
 * @param {!ChpSimulator} stabilizerSim
 * @param {!int} numKept
 * @returns {!Array.<!PauliProduct>}
 * @private
 */
function _extractRemainingStabilizers(stabilizerSim, numKept) {
    // Extract and normalize stabilizers from simulator.
    let lines = stabilizerSim.toString().split('\n');
    lines = lines.slice(1 + (lines.length >> 1));
    let paulis = PauliProduct.gaussianEliminate(lines.map(PauliProduct.fromString));

    // Only keep lower right of table (the unmeasured qubits).
    lines = paulis.map(e => e.toString());
    lines = lines.slice(lines.length - numKept).map(e => e[0] + e.slice(e.length - numKept));
    paulis = lines.map(PauliProduct.fromString);

    // Normalize
    return PauliProduct.gaussianEliminate(paulis);
}

export {evalZxGraph, generatePortToQubitMap, fixedPointsOfGraph}
