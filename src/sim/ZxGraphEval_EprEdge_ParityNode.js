import {GeneralMap} from "src/base/GeneralMap.js";
import {Matrix} from "src/base/Matrix.js"
import {ZxPort, ZxGraph, ZxEdge, ZxNode} from "src/sim/ZxGraph.js"
import {
    fixedPointsOfGraph,
    internalToExternalMapFromFixedPoints,
    PortQubitMapping,
    analyzeQuantumProgram,
} from "src/sim/ZxGraphAnalysis.js"
import {QubitAxis, PauliProduct} from "src/sim/PauliProduct.js"
import {
    QuantumProgram,
    Comment,
    HeaderAlloc,
    MeasurementsWithPauliFeedback,
    InitEprPairs,
    AmpsDisplay,
    PostSelection,
} from "src/sim/QuantumProgram.js"
import {NODES} from "src/nodes/All.js";
import {EdgeActions} from "src/sim/EdgeActions.js";

/**
 * @param {!ZxGraph} graph
 * @returns {!PortQubitMapping}
 */
function graphToPortQubitMapping_ep(graph) {
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
 * @returns {!AnalyzedQuantumProgram}
 */
function evalZxGraph_ep(graph) {
    // Prepare simulator.
    let portQubitMapping = graphToPortQubitMapping_ep(graph);
    let outProgram = new QuantumProgram();
    outProgram.statements.push(new HeaderAlloc(portQubitMapping));

    // Perform operations congruent to the ZX graph.
    _initEdgeEprPairs(outProgram, graph, portQubitMapping.map);
    _performNodeMeasurements(outProgram, graph, portQubitMapping);
    outProgram.statements.push(new AmpsDisplay(
        portQubitMapping.numInternal,
        portQubitMapping.numIn + portQubitMapping.numOut));

    // Derive wavefunction and etc for caller.
    return analyzeQuantumProgram(outProgram, portQubitMapping);
}

/**
 * @param {!QuantumProgram} outProgram
 * @param {!ZxGraph} graph
 * @param {!GeneralMap.<!ZxPort, !int>} portToQubitMap
 * @private
 */
function _initEdgeEprPairs(outProgram, graph, portToQubitMap) {
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

/**
 * @param {!QuantumProgram} outProgram
 * @param {!ZxGraph} graph
 * @param {!PortQubitMapping} portQubitMapping
 * @private
 */
function _performNodeMeasurements(outProgram, graph, portQubitMapping) {
    // Apply single-qubit basis changes.
    let nodeBasisChanges = new GeneralMap();
    for (let node of graph.nodes.keys()) {
        let nodeKind = NODES.map.get(graph.kind(node));
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
    for (let [node, kind] of graph.nodes.entries()) {
        let nodeKind = NODES.map.get(kind);
        if (nodeKind.postSelectStabilizer === undefined) {
            continue;
        }
        let ports = graph.activePortsOf(node);
        if (ports.length !== 1) {
            throw new Error('Postselection node must have degree 1.');
        }
        let qubit = portQubitMapping.map.get(ports[0]);
        postSelections.set(qubit, nodeKind.postSelectStabilizer);
    }
    if (postSelections.size > 0) {
        outProgram.statements.push(new PostSelection(postSelections));
    }
}

/**
 * @param {!ZxGraph} graph
 * @param {!PortQubitMapping} portQubitMapping
 * @param {!Array.<TransformedMeasurement>} transMeasurements
 * @returns {!GeneralMap<!int, !Array.<!QubitAxis>>} Map from in/out axis to measurement qubits that flip it.
 */
function _transformedMeasurementToFeedbackMap(graph, portQubitMapping, transMeasurements) {
    let fixedPoints = fixedPointsOfGraph(graph, portQubitMapping.map);
    let externalMap = internalToExternalMapFromFixedPoints(fixedPoints, portQubitMapping.numInternal);
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

export {evalZxGraph_ep, graphToPortQubitMapping_ep}
