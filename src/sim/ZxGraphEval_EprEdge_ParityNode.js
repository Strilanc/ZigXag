// /**
//  * Analyzes a ZX graph by interpreting edges as EPR pairs and nodes as parity measurements.
//  */
//
// import {GeneralMap} from "src/base/GeneralMap.js";
// import {
//     fixedPointsOfGraph,
//     internalToExternalMapFromFixedPoints,
//     PortQubitMapping,
//     analyzeQuantumProgram,
// } from "src/sim/ZxGraphAnalysis.js"
// import {QubitAxis} from "src/sim/PauliProduct.js"
// import {
//     QuantumProgram,
//     Comment,
//     HeaderAlloc,
//     MeasurementsWithPauliFeedback,
//     InitEprPairs,
//     AmpsDisplay,
//     PostSelection,
// } from "src/sim/QuantumProgram.js"
// import {NODES} from "src/nodes/All.js";
// import {EdgeActions} from "src/sim/EdgeActions.js";
// import {seq} from "src/base/Seq.js";
// import {Graph} from "src/base/Graph.js";
//
// /**
//  * @param {!Graph} graph
//  * @returns {!AnalyzedQuantumProgram}
//  */
// function evalZxGraph_ep(graph) {
//     if (!(graph instanceof Graph)) {
//         throw new Error(`Not a Graph: ${graph}`);
//     }
//
//     // Prepare simulator.
//     let portQubitMapping = graphToPortQubitMapping_ep(graph);
//     let outProgram = new QuantumProgram();
//     outProgram.statements.push(new HeaderAlloc(portQubitMapping));
//
//     // Perform operations congruent to the ZX graph.
//     _initEdgeEprPairs(outProgram, graph, portQubitMapping.map);
//     _performNodeMeasurements(outProgram, graph, portQubitMapping);
//     outProgram.statements.push(new AmpsDisplay(
//         portQubitMapping.numInternal,
//         portQubitMapping.numIn + portQubitMapping.numOut));
//
//     // Derive wavefunction and etc for caller.
//     return analyzeQuantumProgram(outProgram, portQubitMapping);
// }
//
// /**
//  * @param {!Graph} graph
//  * @returns {!PortQubitMapping}
//  */
// function graphToPortQubitMapping_ep(graph) {
//     if (!(graph instanceof Graph)) {
//         throw new Error(`Not a Graph: ${graph}`);
//     }
//
//     let portToQubitMap = /** @type {!Map<!string, !int>} */ new Map();
//
//     // Sort and classify nodes.
//     let inputPorts = _sortedNodePortsOfKinds(graph, ['in']);
//     let outputPorts = _sortedNodePortsOfKinds(graph, ['out']);
//     let postPorts = _sortedNodePortsOfKinds(graph, ['O!', 'w!', 'f!', 'x!', '@!', 's!', 'a!', 'z!']);
//     let spiderPorts = _sortedNodePortsOfKinds(graph, ['O', 'w', 'f', 'x', '@', 's', 'a', 'z']);
//     let hadamardPorts = _sortedNodePortsOfKinds(graph, ['h']);
//     let recognizedLength =
//         inputPorts.length +
//         outputPorts.length +
//         spiderPorts.length +
//         hadamardPorts.length +
//         postPorts.length;
//     let actualLength = seq(graph.nodes).flatMap(e => e.ports).count();
//     if (recognizedLength !== actualLength) {
//         throw new Error(`Unrecognized node(s). ${recognizedLength} vs ${actualLength}`);
//     }
//
//     // CAREFUL: The order of the nodes' qubits matters!
//     // Earlier qubits are isolated by Gaussian eliminations, expressing them in terms of later qubits.
//     // Therefore it is important that qubits for nodes we want to eliminate to have qubits that come first.
//
//     let orderedPorts = [
//         // Internal nodes go first.
//         ...hadamardPorts,
//         ...spiderPorts,
//         // Then input nodes.
//         ...inputPorts,
//         // Then output nodes.
//         ...outputPorts,
//         // And lastly post-selection.
//         ...postPorts,
//     ];
//
//     for (let port of orderedPorts) {
//         portToQubitMap.set(port.id, portToQubitMap.size);
//     }
//
//     return new PortQubitMapping(
//         portToQubitMap,
//         inputPorts.length,
//         outputPorts.length,
//         postPorts.length);
// }
//
// /**
//  * @param {!Graph} graph
//  * @param {!Array.<!string>} kinds
//  * @param {undefined|!Array.<!int>} allowedDegrees
//  * @returns {!Array.<!Node>}
//  * @private
//  */
// function _sortedNodePortsOfKinds(graph, kinds, allowedDegrees=undefined) {
//     let ports = [];
//     for (let node of graph.nodes) {
//         if (kinds.indexOf(node.data.kind) !== -1) {
//             if (allowedDegrees !== undefined && allowedDegrees.indexOf(node.degree) === -1) {
//                 throw Error(`Bad state. Invalid degree ${node.degree} for kind ${kinds}`);
//             }
//             ports.push(...node.ports);
//         }
//     }
//     ports.sort((a, b) => (a.node.id - b.node.id) || (a.edge.id - b.edge.id));
//     return ports;
// }
//
// /**
//  * @param {!QuantumProgram} outProgram
//  * @param {!Graph} graph
//  * @param {!GeneralMap.<!string, !int>} portToQubitMap
//  * @private
//  */
// function _initEdgeEprPairs(outProgram, graph, portToQubitMap) {
//     outProgram.statements.push(new Comment('', 'Init per-edge EPR pairs.'));
//
//     // Identify edge qubit pairs.
//     let pairs = graph.edges.map(edge => {
//         let qs = edge.ports.map(p => portToQubitMap.get(p.id));
//         qs.sort((a, b) => a - b);
//         return {qs, kind: edge.data.kind};
//     });
//     pairs.sort((a, b) => (a.qs[0] - b.qs[0])*10000 + (a.qs[1] - b.qs[1]));
//
//     // Make the EPR pairs.
//     outProgram.statements.push(new InitEprPairs(...pairs.map(e => e.qs)));
//
//     // Apply any edge-based basis changes.
//     let edgeBasisChanges = new GeneralMap();
//     for (let pair of pairs) {
//         let nodeKind = NODES.map.get(pair.kind === '-' ? '@' : pair.kind);
//         if (nodeKind.edgeAction.matrix !== 1) {
//             edgeBasisChanges.set(pair.qs[0], pair.kind);
//         }
//     }
//     if (edgeBasisChanges.size > 0) {
//         outProgram.statements.push(new EdgeActions(edgeBasisChanges, false));
//     }
// }
//
// /**
//  * @param {!QuantumProgram} outProgram
//  * @param {!Graph} graph
//  * @param {!PortQubitMapping} portQubitMapping
//  * @private
//  */
// function _performNodeMeasurements(outProgram, graph, portQubitMapping) {
//     // Apply single-qubit basis changes.
//     let nodeBasisChanges = new GeneralMap();
//     for (let node of graph.nodes) {
//         let nodeKind = NODES.map.get(node.data.kind);
//         let ports = node.ports;
//         let mat = nodeKind.nodeRootEdgeAction.matrix;
//         if (ports.length > 0 && mat !== 1 && mat !== null) {
//             nodeBasisChanges.set(portQubitMapping.map.get(ports[0].id), nodeKind.id);
//         }
//     }
//     if (nodeBasisChanges.size > 0) {
//         outProgram.statements.push(new Comment('', 'Apply per-node basis changes.'));
//         outProgram.statements.push(new EdgeActions(nodeBasisChanges, true));
//     }
//
//     // Multi-qubit basis changes and transformed measurement collection.
//     outProgram.statements.push(new Comment('', 'Perform per-node measurements.'));
//     let transMeasurements = /** @type {!Array.<TransformedMeasurement>} */ [];
//     for (let node of graph.nodes) {
//         let kind = node.data.kind;
//         let ports = node.ports;
//         let nodeKind = NODES.map.get(kind);
//         let qubits = ports.map(p => portQubitMapping.map.get(p.id));
//         transMeasurements.push(
//             ...nodeKind.nodeMeasurer(outProgram, portQubitMapping.numQubits, qubits));
//     }
//
//     // Group transformed measurements by basis.
//     let xMeasured = transMeasurements.filter(e => !e.measurementAxis.axis).map(e => e.measurementAxis.qubit);
//     let allMeasured = transMeasurements.map(e => e.measurementAxis.qubit);
//     allMeasured.sort((a, b) => a - b);
//
//     // Measurements and feedback.
//     outProgram.statements.push(new EdgeActions(new Map(xMeasured.map(q => [q, 'h'])), false));
//     let measurementToFeedback = _transformedMeasurementToFeedbackMap(
//         graph, portQubitMapping, transMeasurements);
//     outProgram.statements.push(new MeasurementsWithPauliFeedback(measurementToFeedback));
//
//     // Post-selections.
//     let postSelections = new Map();
//     for (let node of graph.nodes) {
//         let nodeKind = NODES.map.get(node.data.kind);
//         if (nodeKind.postSelectStabilizer === undefined) {
//             continue;
//         }
//         let ports = node.ports;
//         if (ports.length !== 1) {
//             throw new Error('Postselection node must have degree 1.');
//         }
//         let qubit = portQubitMapping.map.get(ports[0].id);
//         postSelections.set(qubit, nodeKind.postSelectStabilizer);
//     }
//     if (postSelections.size > 0) {
//         outProgram.statements.push(new PostSelection(postSelections));
//     }
// }
//
// /**
//  * @param {!Graph} graph
//  * @param {!PortQubitMapping} portQubitMapping
//  * @param {!Array.<TransformedMeasurement>} transMeasurements
//  * @returns {!GeneralMap<!int, !Array.<!QubitAxis>>} Map from in/out axis to measurement qubits that flip it.
//  */
// function _transformedMeasurementToFeedbackMap(graph, portQubitMapping, transMeasurements) {
//     let fixedPoints = fixedPointsOfGraph(graph, portQubitMapping.map);
//     let externalMap = internalToExternalMapFromFixedPoints(fixedPoints, portQubitMapping.numInternal);
//     let out = new GeneralMap();
//     for (let transMeasure of transMeasurements) {
//         if (externalMap.has(transMeasure.postselectionControlAxis)) {
//             let externalFlips = externalMap.get(transMeasure.postselectionControlAxis) || [];
//             out.set(transMeasure.measurementAxis.qubit, externalFlips);
//         }
//     }
//     return out;
// }
//
// export {evalZxGraph_ep, graphToPortQubitMapping_ep}
