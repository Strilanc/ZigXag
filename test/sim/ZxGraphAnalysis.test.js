import {Suite, assertThat, assertThrows, assertTrue} from "test/TestUtil.js"
import {ZxGraph, ZxNode, ZxEdge, ZxPort} from "src/sim/ZxGraph.js"
import {evalZxGraphGroundTruth} from "src/sim/ZxGraphGroundTruth.js"
import {Matrix} from "src/base/Matrix.js"
import {Complex} from "src/base/Complex.js"
import {GeneralMap} from "src/base/GeneralMap.js"
import {QubitAxis, PauliProduct} from "src/sim/PauliProduct.js"
import {
    QuantumProgram,
    MultiCnot,
    HeaderAlloc,
    MeasurementsWithPauliFeedback,
    InitPlusStates,
    Hadamards,
} from "src/sim/QuantumProgram.js"
import {seq} from "src/base/Seq.js";

import {graphToPortQubitMapping_ep} from "src/sim/ZxGraphEval_EprEdge_ParityNode.js"
import {
    fixedPointsOfGraph,
    internalToExternalMapFromFixedPoints,
    PortQubitMapping,
    analyzeQuantumProgram,
} from "src/sim/ZxGraphAnalysis.js"


let suite = new Suite("ZxGraphEval");


suite.test('fixedPointsOfGraph', () => {
    let graph = ZxGraph.fromDiagram(`
        !---@---?
            |
            |
            |
        !---O---?
    `);
    let qubitMapping = graphToPortQubitMapping_ep(graph);
    let fixedPoints = fixedPointsOfGraph(graph, qubitMapping.map);
    assertThat(fixedPoints).isEqualTo([
        '+XXX.......',
        '+ZZ........',
        '+Z.Z.......',
        '+...ZZZ....',
        '+...XX.....',
        '+...X.X....',
        '+..XX......',
        '+..ZZ......',
        '+X.....X...',
        '+Z.....Z...',
        '+.X......X.',
        '+.Z......Z.',
        '+....X..X..',
        '+....Z..Z..',
        '+.....X...X',
        '+.....Z...Z',
    ].map(PauliProduct.fromString));
});

suite.test('internalToExternalMapFromFixedPoints', () => {
    let graph = ZxGraph.fromDiagram(`
        !---@---?
            |
            |
            |
        !---O---?
    `);
    let qubitMapping = graphToPortQubitMapping_ep(graph);
    assertThat(qubitMapping).isEqualTo(new PortQubitMapping(
        new GeneralMap(
            [new ZxNode(1, 0).leftPort(), 0],
            [new ZxNode(1, 0).rightPort(), 1],
            [new ZxNode(1, 0).downPort(), 2],

            [new ZxNode(1, 1).upPort(), 3],
            [new ZxNode(1, 1).leftPort(), 4],
            [new ZxNode(1, 1).rightPort(), 5],

            [new ZxNode(0, 0).rightPort(), 6],
            [new ZxNode(0, 1).rightPort(), 7],
            [new ZxNode(2, 0).leftPort(), 8],
            [new ZxNode(2, 1).leftPort(), 9],
        ),
        2,
        2,
        0,
    ));
    /**
     * Mapping:
     *    6 0 1 8
     *   !---@---?
     *     2>|
     *       |
     *     3>|
     *   !---O---?
     *    7 4 5 9
     */

    let fixedPoints = fixedPointsOfGraph(graph, qubitMapping.map);
    let map = internalToExternalMapFromFixedPoints(fixedPoints, qubitMapping.map.size - 4);
    assertThat(map).isEqualTo(new GeneralMap(
        [QubitAxis.x(0), [QubitAxis.x(8), QubitAxis.x(9)]],
        [QubitAxis.x(1), [QubitAxis.x(8)]],
        [QubitAxis.x(2), [QubitAxis.x(9)]],
        [QubitAxis.x(3), [QubitAxis.x(9)]],
        [QubitAxis.x(4), [QubitAxis.x(9)]],
        [QubitAxis.x(5), [QubitAxis.x(9)]],

        [QubitAxis.z(0), [QubitAxis.z(8)]],
        [QubitAxis.z(1), [QubitAxis.z(8)]],
        [QubitAxis.z(2), [QubitAxis.z(8)]],
        [QubitAxis.z(3), [QubitAxis.z(8)]],
        [QubitAxis.z(4), [QubitAxis.z(8), QubitAxis.z(9)]],
        [QubitAxis.z(5), [QubitAxis.z(9)]],
    ));
});

suite.test('analyzeQuantumProgram', () => {
    let mapping = new PortQubitMapping(
        new GeneralMap(
            ['0', 0],
            ['1', 1],
            ['2', 2],
            ['3', 3],
            ['4', 4],
            ['5', 5],
            ['6', 6],
        ), 2, 2, 0);
    let out = analyzeQuantumProgram(
        new QuantumProgram([
            new HeaderAlloc(mapping),
            new InitPlusStates(3, 4, 5, 6),
            new MultiCnot(1, [4, 6], false, true),
            new MultiCnot(1, [2], false, false),
            new MultiCnot(0, [2, 3, 5], false, true),
            new Hadamards(2, 3, 4, 5, 6),
            new MeasurementsWithPauliFeedback(new GeneralMap(
                [0, [QubitAxis.z(5)]],
                [1, [QubitAxis.z(6)]],
                [2, [QubitAxis.z(6)]],
            ))
        ]),
        mapping);
    assertTrue(out.satisfiable);
    assertThat(out.successProbability).isEqualTo(1);
    assertThat(out.wavefunction).isApproximatelyEqualTo(Matrix.generateDiagonal(4, e => e === 3 ? -0.5 : 0.5));
    assertThat(out.quirkUrl).isEqualTo(`
        https://algassert.com/quirk#circuit={
            "cols":[
                [1,"⊖",1,1,"Z",1,"Z"],
                [1,"⊖","X"],
                ["⊖",1,"Z","Z",1,"Z"],
                [1,1,"H","H","H","H","H"],
                ["Measure","Measure","Measure"],
                ["Z",1,1,1,1,"•"],[1,"Z","Z",1,1,1,"•"]
            ],
            "init":[0,0,0,"+","+","+","+"]
        }`.split(/\s/).join(''));
    assertThat(out.qasm).isEqualTo(`OPENQASM 2.0;
include "qelib1.inc";
qreg q[7];
creg m_0[1];
creg m_1[1];
creg m_2[1];
h q[3];
h q[4];
h q[5];
h q[6];
cx q[4], q[1];
cx q[6], q[1];
h q[1];
cx q[1], q[2];
h q[1];
cx q[2], q[0];
cx q[3], q[0];
cx q[5], q[0];
h q[2];
h q[3];
h q[4];
h q[5];
h q[6];
measure q[0] -> m_0;
measure q[1] -> m_1;
measure q[2] -> m_2;

// Adjust Pauli frame based on measurements.
if (m_0 == 1) z q[5];
if (m_1 == 1) z q[6];
if (m_2 == 1) z q[6];`);
    assertThat(out.stabilizers).isEqualTo([
        PauliProduct.fromString('+X.XZ'),
        PauliProduct.fromString('+Z.Z.'),
        PauliProduct.fromString('+.XZX'),
        PauliProduct.fromString('+.Z.Z'),
    ]);
});
