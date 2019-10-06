/**
 * Analyzes a ZX graph by interpreting nodes as qubits and edges as actions between qubits.
 */

import {GeneralMap} from "src/base/GeneralMap.js";
import {Matrix} from "src/base/Matrix.js"
import {ZxPort, ZxGraph, ZxEdge, ZxNode, edgeActionsToNodesAdjGraph} from "src/sim/ZxGraph.js"
import {
    fixedPointsOfGraph,
    internalToExternalMapFromFixedPoints,
    PortQubitMapping,
    analyzeQuantumProgram,
} from "src/sim/ZxGraphAnalysis.js"
import {QubitAxis, PauliProduct} from "src/sim/PauliProduct.js"
import {
    InitPlusStates,
    Hadamards,
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
import {seq} from "src/base/Seq.js";
import {Graph} from "src/base/Graph.js";
import {describe} from "src/base/Describe.js";

/**
 * @param {!Graph} graph
 * @returns {!AnalyzedQuantumProgram}
 */
function evalZxGraph_qa(graph) {
    if (!(graph instanceof Graph)) {
        throw new Error(`Not a Graph: ${graph}`);
    }
    graph = edgeActionsToNodesAdjGraph(graph);

    // Prepare simulator.
    let portQubitMapping = graphToPortQubitMapping_qa(graph);
    let outProgram = new QuantumProgram();
    outProgram.statements.push(new HeaderAlloc(portQubitMapping));

    // Perform operations congruent to the ZX graph.
    _initPlusStates(outProgram, graph, portQubitMapping.map);
    _performNodeMeasurements(outProgram, graph, portQubitMapping);
    outProgram.statements.push(new AmpsDisplay(
        portQubitMapping.numInternal,
        portQubitMapping.numIn + portQubitMapping.numOut));

    // Derive wavefunction and etc for caller.
    return analyzeQuantumProgram(outProgram, portQubitMapping);
}

/**
 * @param {!Graph} graph
 * @returns {!PortQubitMapping}
 */
function graphToPortQubitMapping_qa(graph) {
    if (!(graph instanceof Graph)) {
        throw new Error(`Not a Graph: ${graph}`);
    }

    let portToQubitMap = /** @type {!Map<!string, !int>} */ new Map();

    // Sort and classify nodes.
    let inputNodes = _sortedNodesOfKinds(graph, ['in']);
    let outputNodes = _sortedNodesOfKinds(graph, ['out']);
    let postNodes = _sortedNodesOfKinds(graph, ['O!', 'w!', 'f!', 'x!', '@!', 's!', 'a!', 'z!']);
    let spiderNodes = _sortedNodesOfKinds(graph, ['O', 'w', 'f', 'x', '@', 's', 'a', 'z']);
    let hadamardNodes = _sortedNodesOfKinds(graph, ['h']);
    let recognizedLength =
        inputNodes.length +
        outputNodes.length +
        spiderNodes.length +
        hadamardNodes.length +
        postNodes.length;
    let actualLength = graph.nodes.length;
    if (recognizedLength !== actualLength) {
        throw new Error(`Unrecognized node(s). ${recognizedLength} vs ${actualLength}`);
    }

    // CAREFUL: The order of the nodes' qubits matters!
    // Earlier qubits are isolated by Gaussian eliminations, expressing them in terms of later qubits.
    // Therefore it is important that qubits for nodes we want to eliminate to have qubits that come first.

    let orderedNodes = [
        // Internal nodes go first.
        ...hadamardNodes,
        ...spiderNodes,
        // Then input nodes.
        ...inputNodes,
        // Then output nodes.
        ...outputNodes,
        // And lastly post-selection.
        ...postNodes,
    ];

    let k = 0;
    for (let node of orderedNodes) {
        for (let port of node.ports) {
            portToQubitMap.set(port.id, k);
        }
        k++;
    }

    return new PortQubitMapping(
        portToQubitMap,
        inputNodes.length,
        outputNodes.length,
        postNodes.length);
}

/**
 * @param {!Graph} graph
 * @param {!Array.<!string>} kinds
 * @param {undefined|!Array.<!int>} allowedDegrees
 * @returns {!Array.<!Node>}
 * @private
 */
function _sortedNodesOfKinds(graph, kinds, allowedDegrees=undefined) {
    let nodes = [];
    for (let node of graph.nodes) {
        if (kinds.indexOf(node.data.kind) !== -1) {
            if (allowedDegrees !== undefined && allowedDegrees.indexOf(node.degree) === -1) {
                throw Error(`Bad state. Invalid degree ${node.degree} for kind ${kinds}`);
            }
            nodes.push(node);
        }
    }
    nodes.sort((a, b) => a.id - b.id);
    return nodes;
}

function _classifyNodeInitMeasure() {
    let unknownNodes = _sortedNodesOfKinds(graph, ['in', 'out']);
    let blackNodes = _sortedNodesOfKinds(graph, ['@!', 's!', 'a!', 'z!', '@', 's', 'a', 'z']);
    let whiteNodes = _sortedNodesOfKinds(graph, ['O', 'w', 'f', 'x', 'O!', 'w!', 'f!', 'x!']);
    let hadamardNodes = _sortedNodesOfKinds(graph, ['h']);

    let preferredAxis = new Map();
    for (let n of blackNodes) {
        preferredAxis.set(n.id, true);
    }
    for (let n of whiteNodes) {
        preferredAxis.set(n.id, false);
    }
    for (let n of hadamardNodes) {
        preferredAxis.set(n.id, 'h');
        n.edges[0]
    }
    for (let n of unknownNodes) {
        let axis = !preferredAxis.get(n.edges[0].opposite(n).id);
    }
}
/**
 * @param {!QuantumProgram} outProgram
 * @param {!Graph} graph
 * @param {!GeneralMap.<!string, !int>} portToQubitMap
 * @private
 */
function _initPlusStates(outProgram, graph, portToQubitMap) {
    outProgram.statements.push(new Comment('', 'Init per-edge EPR pairs.'));

    let inputNodes = _sortedNodesOfKinds(graph, ['in']);
    let outputNodes = _sortedNodesOfKinds(graph, ['out']);
    let blackNodes = _sortedNodesOfKinds(graph, ['@!', 's!', 'a!', 'z!', '@', 's', 'a', 'z']);
    let whiteNodes = _sortedNodesOfKinds(graph, ['O', 'w', 'f', 'x', 'O!', 'w!', 'f!', 'x!']);
    let hadamardNodes = _sortedNodesOfKinds(graph, ['h']);
    let initColor = new Map();
    let measureColor = new Map();
    for (let n of blackNodes) {

    }

    // Identify edge qubit pairs.
    let pairs = graph.edges.map(edge => {
        let qs = edge.ports.map(p => portToQubitMap.get(p.id));
        qs.sort((a, b) => a - b);
        return {qs, kind: edge.data.kind};
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
 * @param {!Graph} graph
 * @param {!PortQubitMapping} portQubitMapping
 * @private
 */
function _performNodeMeasurements(outProgram, graph, portQubitMapping) {
    // Apply single-qubit basis changes.
    let nodeBasisChanges = new GeneralMap();
    for (let node of graph.nodes) {
        let nodeKind = NODES.map.get(node.data.kind);
        let ports = node.ports;
        let mat = nodeKind.nodeRootEdgeAction.matrix;
        if (ports.length > 0 && mat !== 1 && mat !== null) {
            nodeBasisChanges.set(portQubitMapping.map.get(ports[0].id), nodeKind.id);
        }
    }
    if (nodeBasisChanges.size > 0) {
        outProgram.statements.push(new Comment('', 'Apply per-node basis changes.'));
        outProgram.statements.push(new EdgeActions(nodeBasisChanges, true));
    }

    // Multi-qubit basis changes and transformed measurement collection.
    outProgram.statements.push(new Comment('', 'Perform per-node measurements.'));
    let transMeasurements = /** @type {!Array.<TransformedMeasurement>} */ [];
    for (let node of graph.nodes) {
        let kind = node.data.kind;
        let ports = node.ports;
        let nodeKind = NODES.map.get(kind);
        let qubits = ports.map(p => portQubitMapping.map.get(p.id));
        transMeasurements.push(
            ...nodeKind.nodeMeasurer(outProgram, portQubitMapping.numQubits, qubits));
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
    let postSelections = new Map();
    for (let node of graph.nodes) {
        let nodeKind = NODES.map.get(node.data.kind);
        if (nodeKind.postSelectStabilizer === undefined) {
            continue;
        }
        let ports = node.ports;
        if (ports.length !== 1) {
            throw new Error('Postselection node must have degree 1.');
        }
        let qubit = portQubitMapping.map.get(ports[0].id);
        postSelections.set(qubit, nodeKind.postSelectStabilizer);
    }
    if (postSelections.size > 0) {
        outProgram.statements.push(new PostSelection(postSelections));
    }
}

/**
 * @param {!Graph} graph
 * @param {!PortQubitMapping} portQubitMapping
 * @param {!Array.<TransformedMeasurement>} transMeasurements
 * @returns {!GeneralMap<!int, !Array.<!QubitAxis>>} Map from in/out axis to measurement qubits that flip it.
 */
function _transformedMeasurementToFeedbackMap(graph, portQubitMapping, transMeasurements) {
    let fixedPoints = fixedPointsOfGraph(graph, portQubitMapping.map);
    let externalMap = internalToExternalMapFromFixedPoints(fixedPoints, portQubitMapping.numInternal);
    let out = new GeneralMap();
    for (let transMeasure of transMeasurements) {
        if (externalMap.has(transMeasure.postselectionControlAxis)) {
            let externalFlips = externalMap.get(transMeasure.postselectionControlAxis) || [];
            out.set(transMeasure.measurementAxis.qubit, externalFlips);
        }
    }
    return out;
}

export {evalZxGraph_qa, graphToPortQubitMapping_qa}
